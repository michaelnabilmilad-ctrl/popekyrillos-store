import { cleanText, currency, publicError, updateOrder } from "./_paymob-utils.js";

const defaultBostaBaseUrl = "https://app.bosta.co/api/v2";

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+20")) return digits;
  if (digits.startsWith("20")) return `+${digits}`;
  if (digits.startsWith("0")) return `+2${digits}`;
  return digits;
}

function requireBostaConfig(env = {}) {
  const apiKey = cleanText(env.BOSTA_API_KEY, 500);
  if (!apiKey) throw publicError(500, "Bosta API key is not configured.");
  return {
    baseUrl: cleanText(env.BOSTA_BASE_URL, 160) || defaultBostaBaseUrl,
    authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`
  };
}

function itemDescription(items = []) {
  const names = items
    .map((item) => `${item.name}${item.option ? ` - ${item.option}` : ""} x${item.quantity}`)
    .filter(Boolean);
  return cleanText(names.join(" | "), 500) || "Pope Kyrillos Store order";
}

function itemsCount(items = []) {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 1;
}

function bostaPayload(order = {}) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];

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
      packageType: cleanText(order.packageType, 40) || "Small",
      packageDetails: {
        description: itemDescription(items),
        itemsCount: itemsCount(items)
      }
    },
    cod: 0,
    businessReference: order.reference
  };
}

export function bostaReference(delivery = {}) {
  return (
    delivery.trackingNumber ||
    delivery.awbNumber ||
    delivery.trackingCode ||
    delivery._id ||
    delivery.id ||
    delivery.businessReference ||
    ""
  );
}

export async function createBostaDeliveryForOrder(env, order = {}) {
  if (order.customer?.deliveryMethod !== "bosta") return null;
  if (order.bosta?.delivery) return order.bosta.delivery;

  const { baseUrl, authorization } = requireBostaConfig(env);
  const payload = bostaPayload(order);

  const response = await fetch(`${baseUrl}/deliveries?apiVersion=1`, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    const message = result.message || result.error || result.detail || "Bosta rejected the delivery request.";
    throw publicError(response.status >= 500 ? 502 : response.status, message);
  }

  const delivery = result.data || result;
  await updateOrder(env, order.reference, (existing) => ({
    ...existing,
    status: existing.status === "paid" ? "paid_shipment_created" : existing.status || "shipment_created",
    bosta: {
      status: "created",
      delivery,
      businessReference: payload.businessReference,
      reference: bostaReference(delivery),
      createdAt: new Date().toISOString()
    }
  }));

  return delivery;
}

export function bostaOrderPayload({ reference, customer, secureCart, paymentMethod = "instapay" }) {
  return {
    reference,
    status: "shipment_requested",
    currency,
    amountCents: secureCart.subtotalCents,
    subtotalCents: secureCart.subtotalCents,
    shippingCents: 0,
    customer,
    deliveryMethod: customer.deliveryMethod,
    items: secureCart.items,
    payment: {
      method: cleanText(paymentMethod, 40) || "instapay",
      status: paymentMethod === "paymob" ? "pending" : "awaiting_manual_confirmation",
      provider: paymentMethod === "paymob" ? "paymob" : "manual"
    },
    bosta: {
      status: "requested"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
