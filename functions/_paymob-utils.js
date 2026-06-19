export const currency = "EGP";

const hmacFields = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success"
];

export function jsonResponse(status, body = {}, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    ...extraHeaders
  };

  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export function publicError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  error.publicMessage = message;
  return error;
}

export function cleanText(value = "", maxLength = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+20")) return digits;
  if (digits.startsWith("20")) return `+${digits}`;
  if (digits.startsWith("0")) return `+2${digits}`;
  return digits;
}

export async function parseRequestBody(request) {
  const raw = await request.text();
  if (!raw) return {};

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return [...new URLSearchParams(raw).entries()].reduce((data, [key, value]) => {
      data[key] = value;
      return data;
    }, {});
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw publicError(400, "بيانات الطلب غير صالحة.");
  }
}

async function loadProducts(context) {
  const requestUrl = new URL(context.request.url);
  const productsUrl = new URL("/products.json", requestUrl);
  const response = context.env?.ASSETS?.fetch
    ? await context.env.ASSETS.fetch(new Request(productsUrl.toString()))
    : await fetch(productsUrl);

  if (!response.ok) {
    console.error("Failed to load products.json", { status: response.status });
    throw publicError(500, "تعذر قراءة بيانات المنتجات.");
  }

  return response.json();
}

function productUnavailable(product = {}) {
  const stock = cleanText(product.stock, 120);
  const normalizedStock = stock.toLowerCase();
  return product.available === false || stock.includes("غير متاح") || /sold\s*out|out\s*of\s*stock/i.test(normalizedStock);
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
          available: product.available !== false && !productUnavailable(product)
        }
      ];
}

function findVariant(product = {}, variantId = "default") {
  const variants = getProductVariants(product);
  return variants.find((variant) => String(variant.id) === String(variantId)) || (variantId === "default" ? variants[0] : null);
}

function variantPrice(variant = {}, product = {}) {
  const value = Number(variant.price ?? product.price);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function variantQuantity(variant = {}) {
  const raw = variant.quantity ?? variant.inventoryQuantity ?? variant.inventory_quantity ?? null;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function variantAvailable(product = {}, variant = {}) {
  const quantity = variantQuantity(variant);
  return !productUnavailable(product) && variant.available !== false && quantity !== 0;
}

function variantTitle(variant = {}) {
  if (variant.title && variant.title !== "Default Title") return cleanText(variant.title, 160);
  const options = variant.options && typeof variant.options === "object" ? Object.values(variant.options).filter(Boolean) : [];
  return options.length ? cleanText(options.join(" / "), 160) : "";
}

function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

export function integrationIds(env = {}) {
  const ids = String(env.PAYMOB_INTEGRATION_IDS || "")
    .split(/[,\s]+/)
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) throw publicError(500, "Paymob integration IDs are not configured.");
  return ids;
}

export function siteUrl(env = {}, request) {
  const fallback = request ? new URL(request.url).origin : "https://popekyrillos.store";
  return String(env.SITE_URL || fallback).replace(/\/+$/, "");
}

function splitName(fullName = "") {
  const parts = cleanText(fullName, 120).split(" ").filter(Boolean);
  if (!parts.length) return { firstName: "Customer", lastName: "Pope Kyrillos" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || "Customer"
  };
}

export function validateCustomer(customer = {}, orderReference = "") {
  const deliveryMethod = cleanText(customer.deliveryMethod, 30) || "bosta";
  if (!["bosta", "pickup"].includes(deliveryMethod)) throw publicError(400, "طريقة الاستلام غير صحيحة.");

  const name = cleanText(customer.name, 120);
  const phone = normalizePhone(customer.phone);
  const email = cleanText(customer.email, 160);
  const governorate = cleanText(customer.governorate, 100);
  const city = cleanText(customer.city, 100);
  const address = cleanText(customer.address, 260);
  const notes = cleanText(customer.notes, 600);

  if (!name) throw publicError(400, "اسم العميل مطلوب.");
  if (!phone || phone.length < 10) throw publicError(400, "رقم الموبايل غير صحيح.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw publicError(400, "البريد الإلكتروني غير صحيح.");
  if (deliveryMethod === "bosta") {
    if (!governorate) throw publicError(400, "المحافظة مطلوبة للشحن.");
    if (!city) throw publicError(400, "المدينة أو المنطقة مطلوبة للشحن.");
    if (!address || address.length < 6) throw publicError(400, "العنوان التفصيلي مطلوب للشحن.");
  }

  return {
    deliveryMethod,
    name,
    phone,
    email: email || `customer-${orderReference.toLowerCase()}@popekyrillos.store`,
    governorate,
    city,
    address,
    notes
  };
}

export async function validateCartItems(context, items = []) {
  if (!Array.isArray(items) || !items.length) throw publicError(400, "السلة فارغة.");
  if (items.length > 80) throw publicError(400, "عدد المنتجات في الطلب كبير جدا.");

  const products = await loadProducts(context);
  const catalog = new Map(products.map((product) => [String(product.id), product]));

  const orderItems = items.map((item) => {
    const product = catalog.get(String(item.productId || ""));
    if (!product) throw publicError(400, "منتج غير موجود في الكتالوج.");

    const variant = findVariant(product, item.variantId || "default");
    if (!variant) throw publicError(400, "اختيار المنتج غير موجود.");
    if (!variantAvailable(product, variant)) throw publicError(400, "أحد المنتجات أو الاختيارات غير متاح حاليا.");

    const quantity = Math.floor(Number(item.qty || item.quantity));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw publicError(400, "كمية غير صحيحة في السلة.");

    const availableQuantity = variantQuantity(variant);
    if (availableQuantity !== null && quantity > availableQuantity) {
      throw publicError(400, "الكمية المطلوبة أكبر من المتاح حاليا.");
    }

    const price = variantPrice(variant, product);
    if (price === null || price <= 0) throw publicError(400, "سعر أحد المنتجات غير متاح للدفع أونلاين.");

    const unitAmountCents = toCents(price);
    return {
      productId: String(product.id),
      variantId: String(variant.id || "default"),
      name: cleanText(product.name, 180),
      option: variantTitle(variant),
      quantity,
      unitPrice: price,
      unitAmountCents,
      lineAmountCents: unitAmountCents * quantity,
      sku: cleanText(variant.sku || product.sku || "", 80)
    };
  });

  const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineAmountCents, 0);
  if (subtotalCents <= 0) throw publicError(400, "إجمالي الطلب غير صالح.");
  return { items: orderItems, subtotalCents };
}

export function calculateShippingCents(customer = {}) {
  // Shipping fees are currently confirmed separately, so Paymob receives product totals only.
  return customer.deliveryMethod === "pickup" ? 0 : 0;
}

export function buildBillingData(customer = {}, orderReference = "") {
  const { firstName, lastName } = splitName(customer.name);
  return {
    first_name: firstName,
    last_name: lastName,
    phone_number: customer.phone,
    email: customer.email || `customer-${orderReference.toLowerCase()}@popekyrillos.store`,
    country: "EG",
    state: customer.governorate || "Cairo",
    city: customer.city || customer.governorate || "Cairo",
    street: customer.address || "Pickup from Pope Kyrillos Store",
    building: "NA",
    floor: "NA",
    apartment: "NA",
    postal_code: "NA",
    shipping_method: customer.deliveryMethod === "pickup" ? "pickup" : "delivery"
  };
}

export function checkoutUrl(env = {}, clientSecret = "") {
  if (!env.PAYMOB_PUBLIC_KEY) throw publicError(500, "Paymob public key is not configured.");
  return `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(env.PAYMOB_PUBLIC_KEY)}&clientSecret=${encodeURIComponent(clientSecret)}`;
}

function requireOrderStore(env = {}) {
  if (!env.PAYMOB_ORDERS) throw publicError(500, "PAYMOB_ORDERS KV binding is not configured.");
  return env.PAYMOB_ORDERS;
}

export async function saveOrder(env, order) {
  await requireOrderStore(env).put(order.reference, JSON.stringify(order));
  return order;
}

export async function getOrder(env, reference = "") {
  const safeReference = cleanText(reference, 80);
  if (!safeReference) return null;
  return requireOrderStore(env).get(safeReference, "json");
}

export async function updateOrder(env, reference, updater) {
  const existing = (await getOrder(env, reference)) || { reference, createdAt: new Date().toISOString() };
  const updated = updater(existing);
  updated.updatedAt = new Date().toISOString();
  return saveOrder(env, updated);
}

function nestedValue(object, field) {
  return field.split(".").reduce((value, key) => (value && value[key] !== undefined ? value[key] : undefined), object);
}

function hmacValue(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return "";
  return String(value);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left = "", right = "") {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

async function computePaymobHmac(transaction, secret) {
  const data = hmacFields.map((field) => hmacValue(nestedValue(transaction, field))).join("");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return hex(signature);
}

export async function verifyPaymobHmac(transaction, providedHmac, secret) {
  if (!providedHmac || !secret) return false;
  const expected = await computePaymobHmac(transaction, secret);
  return timingSafeEqual(expected, providedHmac);
}

export function boolValue(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function queryParams(request) {
  return [...new URL(request.url).searchParams.entries()].reduce((data, [key, value]) => {
    data[key] = value;
    return data;
  }, {});
}

export async function extractWebhookData(context) {
  const query = queryParams(context.request);
  const body = context.request.method === "GET" ? {} : await parseRequestBody(context.request).catch(() => ({}));
  const source = Object.keys(body).length ? body : query;
  let obj = source.obj || source.transaction || source.data?.obj || source.data || source;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      obj = {};
    }
  }
  const hmac = query.hmac || source.hmac || source.hmac_hash || obj.hmac || "";
  return { payload: source, obj, hmac };
}

export function extractOrderReference(payload = {}, transaction = {}) {
  const candidates = [
    payload.special_reference,
    payload.merchant_order_id,
    payload.order_reference,
    transaction.special_reference,
    transaction.merchant_order_id,
    transaction.order_reference,
    nestedValue(transaction, "order.special_reference"),
    nestedValue(transaction, "order.merchant_order_id"),
    nestedValue(transaction, "order.order_reference"),
    nestedValue(transaction, "payment_key_claims.extra.special_reference"),
    nestedValue(transaction, "data.special_reference")
  ];

  return cleanText(candidates.find((value) => value && String(value).startsWith("PKS-")) || candidates.find(Boolean) || "", 80);
}
