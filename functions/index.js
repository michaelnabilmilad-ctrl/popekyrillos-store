import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const bostaApiKey = defineSecret("BOSTA_API_KEY");
const bostaBaseUrl = "https://app.bosta.co/api/v2";
const allowedOrigins = new Set([
  "https://popekyrillos.store",
  "https://www.popekyrillos.store",
  "http://127.0.0.1:8095",
  "http://localhost:8095"
]);

function corsHeaders(origin = "") {
  const allowedOrigin = allowedOrigins.has(origin) ? origin : "https://popekyrillos.store";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
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

    const token = bostaApiKey.value();
    const authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    const payload = deliveryPayload(request.body);

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
