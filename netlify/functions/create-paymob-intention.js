const crypto = require("crypto");
const {
  buildBillingData,
  calculateShippingCents,
  checkoutUrl,
  cleanText,
  currency,
  integrationIds,
  jsonResponse,
  parseJsonBody,
  saveOrder,
  siteUrl,
  updateOrder,
  validateCartItems,
  validateCustomer
} = require("./_paymob-utils");

function newOrderReference() {
  return `PKS-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function requirePaymobConfig() {
  if (!process.env.PAYMOB_SECRET_KEY) throw new Error("PAYMOB_SECRET_KEY is not configured.");
  if (!process.env.PAYMOB_PUBLIC_KEY) throw new Error("PAYMOB_PUBLIC_KEY is not configured.");
  return {
    secretKey: process.env.PAYMOB_SECRET_KEY,
    integrationIds: integrationIds()
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const orderReference = newOrderReference();

  try {
    const { secretKey, integrationIds: paymentMethods } = requirePaymobConfig();
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

    const baseUrl = siteUrl();
    const intentionPayload = {
      amount: amountCents,
      currency,
      payment_methods: paymentMethods,
      billing_data: buildBillingData(customer, orderReference),
      items: paymobItems(secureCart.items, shippingCents),
      special_reference: orderReference,
      notification_url: `${baseUrl}/.netlify/functions/paymob-webhook`,
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
      const providerMessage = paymobErrorMessage(paymobData);
      console.error("Paymob intention rejected", {
        status: paymobResponse.status,
        orderReference,
        message: providerMessage
      });
      await updateOrder(orderReference, (order) => ({
        ...order,
        status: "payment_intention_failed",
        payment: {
          ...order.payment,
          status: "failed_to_create",
          providerResponseStatus: paymobResponse.status
        }
      }));
      return jsonResponse(502, {
        error: "تعذر فتح Paymob الآن.",
        message: publicPaymobError(providerMessage),
        providerMessage,
        providerStatus: paymobResponse.status
      });
    }

    await updateOrder(orderReference, (order) => ({
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
      checkoutUrl: checkoutUrl(paymobData.client_secret)
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
};
