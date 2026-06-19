import {
  buildBillingData,
  calculateShippingCents,
  checkoutUrl,
  cleanText,
  currency,
  integrationIds,
  jsonResponse,
  parseRequestBody,
  saveOrder,
  siteUrl,
  updateOrder,
  validateCartItems,
  validateCustomer
} from "../_paymob-utils.js";

function randomHex(bytes = 4) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function newOrderReference() {
  return `PKS-${Date.now()}-${randomHex()}`;
}

function requirePaymobConfig(env = {}) {
  if (!env.PAYMOB_SECRET_KEY) throw new Error("PAYMOB_SECRET_KEY is not configured.");
  if (!env.PAYMOB_PUBLIC_KEY) throw new Error("PAYMOB_PUBLIC_KEY is not configured.");
  return {
    secretKey: env.PAYMOB_SECRET_KEY,
    integrationIds: integrationIds(env)
  };
}

function paymobItems(orderItems, shippingCents) {
  const items = orderItems.map((item) => ({
    name: item.option ? `${item.name} - ${item.option}`.slice(0, 255) : item.name.slice(0, 255),
    amount: item.unitAmountCents,
    description: item.option || item.name,
    quantity: item.quantity
  }));

  if (shippingCents > 0) {
    items.push({
      name: "Shipping",
      amount: shippingCents,
      description: "Delivery fee",
      quantity: 1
    });
  }

  return items;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return jsonResponse(204, {});
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const orderReference = newOrderReference();

  try {
    const { secretKey, integrationIds: paymentMethods } = requirePaymobConfig(env);
    const body = await parseRequestBody(request);
    const secureCart = await validateCartItems(context, body.items || body.cart || []);
    const customer = validateCustomer(body.customer || {}, orderReference);
    const shippingCents = calculateShippingCents(customer);
    const amountCents = secureCart.subtotalCents + shippingCents;
    const now = new Date().toISOString();

    const pendingOrder = {
      reference: orderReference,
      status: "pending",
      currency,
      amountCents,
      subtotalCents: secureCart.subtotalCents,
      shippingCents,
      customer,
      deliveryMethod: customer.deliveryMethod,
      items: secureCart.items,
      payment: {
        method: "paymob",
        status: "pending",
        provider: "paymob"
      },
      createdAt: now,
      updatedAt: now
    };
    await saveOrder(env, pendingOrder);

    const baseUrl = siteUrl(env, request);
    const intentionPayload = {
      amount: amountCents,
      currency,
      payment_methods: paymentMethods,
      billing_data: buildBillingData(customer, orderReference),
      items: paymobItems(secureCart.items, shippingCents),
      special_reference: orderReference,
      notification_url: `${baseUrl}/api/paymob-webhook`,
      redirection_url: `${baseUrl}/payment-pending?order=${encodeURIComponent(orderReference)}`,
      extras: {
        internal_order_reference: orderReference,
        delivery_method: customer.deliveryMethod,
        customer_note: cleanText(customer.notes, 300)
      }
    };

    const paymobResponse = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(intentionPayload)
    });

    const paymobData = await paymobResponse.json().catch(async () => ({ raw: await paymobResponse.text().catch(() => "") }));
    if (!paymobResponse.ok || !paymobData.client_secret) {
      console.error("Paymob intention rejected", {
        status: paymobResponse.status,
        orderReference,
        message: paymobData.message || paymobData.error || paymobData.detail || "Unknown Paymob error"
      });
      await updateOrder(env, orderReference, (order) => ({
        ...order,
        status: "payment_intention_failed",
        payment: {
          ...order.payment,
          status: "failed_to_create",
          providerResponseStatus: paymobResponse.status
        }
      }));
      return jsonResponse(502, { error: "تعذر فتح Paymob الآن. حاول مرة أخرى بعد لحظات." });
    }

    await updateOrder(env, orderReference, (order) => ({
      ...order,
      status: "pending",
      payment: {
        ...order.payment,
        status: "pending",
        paymobIntentionId: paymobData.id || paymobData.intention_id || null
      }
    }));

    console.info("Paymob intention created", { orderReference, amountCents });

    return jsonResponse(200, {
      orderReference,
      currency,
      amountCents,
      clientSecret: paymobData.client_secret,
      checkoutUrl: checkoutUrl(env, paymobData.client_secret)
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error("Create Paymob intention failed", {
        orderReference,
        message: error.message
      });
    }
    return jsonResponse(statusCode, { error: error.publicMessage || "تعذر تجهيز الدفع الآن. حاول مرة أخرى." });
  }
}
