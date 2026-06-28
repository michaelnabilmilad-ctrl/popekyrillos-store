const crypto = require("crypto");
const {
  buildBillingData,
  calculateShippingCents,
  cleanText,
  currency,
  integrationIds,
  jsonResponse,
  parseJsonBody,
  saveOrder,
  updateOrder,
  validateCartItems,
  validateCustomer
} = require("./_paymob-utils");

function newOrderReference() {
  return `PKS-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function requirePaymobConfig() {
  const apiKey = cleanText(process.env.PAYMOB_API_KEY || process.env.PAYMOB_SECRET_KEY, 1000);
  const iframeId = cleanText(process.env.PAYMOB_IFRAME_ID, 80);
  if (!apiKey) throw new Error("PAYMOB_API_KEY is not configured.");
  if (!iframeId) throw new Error("PAYMOB_IFRAME_ID is not configured.");
  return {
    apiKey,
    iframeId,
    integrationId: integrationIds()[0]
  };
}

function paymobItems(orderItems, shippingCents) {
  const itemsTotal = orderItems.reduce((sum, item) => sum + item.lineAmountCents, 0) + shippingCents;
  const productsCount = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  return [
    {
      name: "Pope Kyrillos Store order",
      amount: itemsTotal,
      description: `${productsCount || 1} product(s)`,
      quantity: 1
    }
  ];
}

function paymobErrorMessage(data = {}) {
  const message = data.message || data.error || data.detail || data.details || data.raw || "";
  if (Array.isArray(message)) return message.filter(Boolean).join(" ");
  if (message && typeof message === "object") return JSON.stringify(message);
  return String(message || "Paymob rejected the request.");
}

function publicPaymobError(message = "") {
  if (/integration id\/name does not exist|integration.*does not exist/i.test(message)) {
    return "رقم Paymob Integration ID غير صحيح أو لا يتبع نفس حساب Paymob. راجع PAYMOB_INTEGRATION_IDS في Cloudflare.";
  }
  return message || "تعذر فتح Paymob الآن.";
}

function legacyBillingData(customer, orderReference) {
  const data = buildBillingData(customer, orderReference);
  return {
    apartment: data.apartment || "NA",
    email: data.email,
    floor: data.floor || "NA",
    first_name: data.first_name,
    street: data.street,
    building: data.building || "NA",
    phone_number: data.phone_number,
    shipping_method: "NA",
    postal_code: "NA",
    city: data.city,
    country: data.country || "EG",
    last_name: data.last_name,
    state: data.state
  };
}

async function postPaymob(path, payload) {
  const response = await fetch(`https://accept.paymob.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw Object.assign(new Error(paymobErrorMessage(data)), {
      statusCode: 502,
      providerStatus: response.status,
      providerData: data
    });
  }
  return data;
}

function legacyCheckoutUrl(iframeId, token) {
  return `https://accept.paymob.com/api/acceptance/iframes/${encodeURIComponent(iframeId)}?payment_token=${encodeURIComponent(token)}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const orderReference = newOrderReference();

  try {
    const { apiKey, iframeId, integrationId } = requirePaymobConfig();
    const body = parseJsonBody(event);
    const secureCart = await validateCartItems(body.items || body.cart || []);
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
    await saveOrder(pendingOrder);

    const authData = await postPaymob("/api/auth/tokens", { api_key: apiKey });
    const authToken = authData.token;
    if (!authToken) throw new Error("Paymob auth token was not returned.");

    const orderData = await postPaymob("/api/ecommerce/orders", {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency,
      merchant_order_id: orderReference,
      items: paymobItems(secureCart.items, shippingCents)
    });
    const paymobOrderId = orderData.id;
    if (!paymobOrderId) throw new Error("Paymob order ID was not returned.");

    const paymentKeyData = await postPaymob("/api/acceptance/payment_keys", {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: paymobOrderId,
      billing_data: legacyBillingData(customer, orderReference),
      currency,
      integration_id: integrationId,
      lock_order_when_paid: false
    });
    const paymentToken = paymentKeyData.token;
    if (!paymentToken) throw new Error("Paymob payment token was not returned.");

    await updateOrder(orderReference, (order) => ({
      ...order,
      status: "pending",
      payment: {
        ...order.payment,
        status: "pending",
        paymobOrderId,
        paymobIntegrationId: integrationId
      }
    }));

    console.info("Paymob intention created", { orderReference, amountCents });

    return jsonResponse(200, {
      orderReference,
      currency,
      amountCents,
      checkoutUrl: legacyCheckoutUrl(iframeId, paymentToken)
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error("Create Paymob intention failed", {
        orderReference,
        message: error.message
      });
    }
    const providerMessage = error.providerData ? paymobErrorMessage(error.providerData) : error.message;
    return jsonResponse(statusCode, {
      error: error.publicMessage || "تعذر تجهيز الدفع الآن. حاول مرة أخرى.",
      message: publicPaymobError(providerMessage),
      providerMessage,
      providerStatus: error.providerStatus || null
    });
  }
};
