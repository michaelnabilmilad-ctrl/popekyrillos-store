import { bostaOrderPayload, bostaReference, createBostaDeliveryForOrder } from "../_bosta-utils.js";
import { cleanText, jsonResponse, parseRequestBody, saveOrder, validateCartItems, validateCustomer } from "../_paymob-utils.js";

function randomHex(bytes = 4) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function newOrderReference() {
  return `PKS-BOSTA-${Date.now()}-${randomHex()}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return jsonResponse(204, {});
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const reference = newOrderReference();

  try {
    const body = await parseRequestBody(request);
    const secureCart = await validateCartItems(context, body.items || body.cart || [], { requirePrices: false });
    const customer = validateCustomer(body.customer || {}, reference);
    const paymentMethod = cleanText(body.paymentMethod, 40) || "instapay";

    if (customer.deliveryMethod !== "bosta") {
      return jsonResponse(400, { error: "اختار الشحن مع بوسطا الأول." });
    }

    const order = bostaOrderPayload({ reference, customer, secureCart, paymentMethod });
    await saveOrder(env, order);

    const delivery = await createBostaDeliveryForOrder(env, order);

    return jsonResponse(200, {
      orderReference: reference,
      delivery,
      bostaReference: bostaReference(delivery)
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error("Create Bosta delivery failed", {
        reference,
        message: error.message
      });
    }
    return jsonResponse(statusCode, { error: error.publicMessage || "تعذر إنشاء شحنة بوسطا الآن." });
  }
}
