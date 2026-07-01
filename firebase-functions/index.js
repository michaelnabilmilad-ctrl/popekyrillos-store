import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const bostaApiKey = defineSecret("BOSTA_API_KEY");
const bostaBaseUrl = "https://app.bosta.co/api/v2";
const currency = "EGP";
const allowedOrigins = new Set([
  "https://popekyrillos.store",
  "https://www.popekyrillos.store",
  "http://127.0.0.1:8095",
  "http://localhost:8095"
]);

admin.initializeApp();

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(__dirname, "products.json"), "utf8"));
const catalogById = new Map(catalog.map((product) => [String(product.id), product]));

function corsHeaders(origin = "") {
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "https://popekyrillos.store";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function cleanText(value = "", maxLength = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizePhone(phone = "") {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+20")) return digits;
  if (digits.startsWith("20")) return `+${digits}`;
  if (digits.startsWith("0")) return `+2${digits}`;
  return digits;
}

function getProductVariants(product = {}) {
  return Array.isArray(product.variants) && product.variants.length
    ? product.variants
    : [
        {
          id: "default",
          title: product.name || "Default",
          options: {},
          price: product.price,
          available: product.available !== false && product.stock !== "غير متاح حاليا"
        }
      ];
}

function findVariant(product = {}, variantId = "default") {
  const variants = getProductVariants(product);
  return variants.find((variant) => String(variant.id) === String(variantId)) || variants[0];
}

function variantPrice(variant = {}, product = {}) {
  const value = Number(variant.price ?? product.price);
  return Number.isFinite(value) ? value : null;
}

function isVariantAvailable(variant = {}) {
  return variant.available !== false && variant.inventoryQuantity !== 0 && variant.quantity !== 0;
}

function variantTitle(variant = {}) {
  if (variant.title && variant.title !== "Default Title") return cleanText(variant.title, 160);
  const options = variant.options && typeof variant.options === "object" ? Object.values(variant.options).filter(Boolean) : [];
  return options.length ? cleanText(options.join(" / "), 160) : "";
}

function buildOrder(items = []) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Cart is empty.");
  }

  const orderItems = items.slice(0, 80).map((item) => {
    const product = catalogById.get(String(item.productId));
    if (!product) throw new Error("Product not found.");
    const variant = findVariant(product, item.variantId || "default");
    if (!variant || !isVariantAvailable(variant)) throw new Error("Product option is unavailable.");
    const price = variantPrice(variant, product);
    if (price === null) throw new Error("Product price is not available.");

    const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.qty || item.quantity) || 1)));
    return {
      productId: String(product.id),
      variantId: String(variant.id || "default"),
      name: cleanText(product.name, 180),
      option: variantTitle(variant),
      quantity,
      price,
      lineTotal: price * quantity,
      sku: cleanText(variant.sku || "", 80)
    };
  });

  const total = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const itemsCount = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  return { currency, total, itemsCount, items: orderItems };
}

async function verifiedUser(request) {
  const header = request.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

function deliveryPayload(data = {}) {
  const customer = data.customer || {};
  const order = data.order || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const description = items
    .map((item) => `${cleanText(item.name, 90)} x ${Number(item.quantity) || 1}`)
    .join(", ")
    .slice(0, 500);

  return {
    type: 10,
    receiver: {
      firstName: cleanText(customer.name, 80),
      phone: normalizePhone(customer.phone),
      email: cleanText(customer.email, 120) || undefined
    },
    dropOffAddress: {
      city: cleanText(customer.governorate, 80),
      districtName: cleanText(customer.city, 80),
      firstLine: cleanText(customer.address, 250),
      secondLine: cleanText(customer.notes, 250) || undefined,
      isWorkAddress: false
    },
    specs: {
      packageType: "Small",
      packageDetails: {
        description: description || "Pope Kyrillos Store order",
        itemsCount: Number(order.itemsCount) || items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0) || 1
      }
    },
    cod: Number(data.paymentMethod === "pickupCash" ? order.total : 0) || 0,
    businessReference: `PKS-${Date.now()}`
  };
}

function validateRequest(data = {}) {
  const customer = data.customer || {};
  if (customer.deliveryMethod !== "bosta") return "Bosta delivery method is required.";
  if (!cleanText(customer.name)) return "Customer name is required.";
  if (!normalizePhone(customer.phone) || normalizePhone(customer.phone).length < 10) return "Valid customer phone is required.";
  if (!cleanText(customer.governorate)) return "Governorate is required.";
  if (!cleanText(customer.city)) return "City or area is required.";
  if (cleanText(customer.address).length < 6) return "Full address is required.";
  return "";
}

export const createBostaDelivery = onRequest(
  {
    region: "us-central1",
    secrets: [bostaApiKey],
    cors: false
  },
  async (request, response) => {
    const headers = corsHeaders(request.get("origin"));
    Object.entries(headers).forEach(([key, value]) => response.set(key, value));

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ error: "Method not allowed." });
      return;
    }

    const validationError = validateRequest(request.body);
    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    let secureOrder;
    try {
      secureOrder = buildOrder(request.body?.order?.items || []);
    } catch (error) {
      response.status(400).json({ error: "Invalid order.", message: error.message });
      return;
    }

    const token = bostaApiKey.value();
    const authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    const payload = deliveryPayload({ ...request.body, order: secureOrder });

    try {
      const bostaResponse = await fetch(`${bostaBaseUrl}/deliveries?apiVersion=1`, {
        method: "POST",
        headers: {
          "Authorization": authorization,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = await bostaResponse.json().catch(() => ({}));
      if (!bostaResponse.ok) {
        response.status(bostaResponse.status).json({
          error: "Bosta delivery creation failed.",
          message: result.message || result.error || "Bosta rejected the request.",
          details: result
        });
        return;
      }
      response.status(200).json({ delivery: result.data || result, request: { businessReference: payload.businessReference } });
    } catch (error) {
      response.status(502).json({ error: "Bosta request failed.", message: error.message });
    }
  }
);

export const createOrder = onRequest(
  {
    region: "us-central1",
    cors: false
  },
  async (request, response) => {
    const headers = corsHeaders(request.get("origin"));
    Object.entries(headers).forEach(([key, value]) => response.set(key, value));

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ error: "Method not allowed." });
      return;
    }

    const customer = request.body?.customer || {};
    const paymentMethod = cleanText(request.body?.paymentMethod, 40);
    const deliveryMethod = cleanText(customer.deliveryMethod, 40);
    const allowedPayments = new Set(["paymob", "instapay", "vodafoneCash", "fawry", "pickupCash"]);

    if (!allowedPayments.has(paymentMethod)) {
      response.status(400).json({ error: "Invalid payment method." });
      return;
    }
    const validationError = deliveryMethod === "bosta"
      ? validateRequest({ customer })
      : !cleanText(customer.name) || !normalizePhone(customer.phone) || normalizePhone(customer.phone).length < 10
      ? "Valid customer name and phone are required."
      : "";
    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    let secureOrder;
    try {
      secureOrder = buildOrder(request.body?.items || request.body?.order?.items || []);
    } catch (error) {
      response.status(400).json({ error: "Invalid order.", message: error.message });
      return;
    }

    const user = await verifiedUser(request);
    const orderDoc = {
      userId: user?.uid || null,
      userEmail: user?.email || cleanText(customer.email, 120) || null,
      customer: {
        deliveryMethod,
        name: cleanText(customer.name, 100),
        phone: normalizePhone(customer.phone),
        email: cleanText(customer.email, 120) || null,
        governorate: cleanText(customer.governorate, 80) || null,
        city: cleanText(customer.city, 80) || null,
        address: cleanText(customer.address, 260) || null,
        notes: cleanText(customer.notes, 500) || null
      },
      order: secureOrder,
      payment: {
        method: paymentMethod,
        status: paymentMethod === "paymob" ? "pending_online" : "pending_manual"
      },
      status: "new",
      source: "website",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const doc = await admin.firestore().collection("orders").add(orderDoc);
    response.status(200).json({
      orderId: doc.id,
      order: secureOrder,
      paymentUrl: "",
      paymentStatus: orderDoc.payment.status
    });
  }
);
