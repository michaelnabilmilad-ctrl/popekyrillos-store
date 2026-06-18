const {
  boolValue,
  cleanText,
  extractOrderReference,
  extractWebhookData,
  jsonResponse,
  updateOrder,
  verifyPaymobHmac
} = require("./_paymob-utils");

function paymentStatus(transaction = {}) {
  const success = boolValue(transaction.success);
  const pending = boolValue(transaction.pending);
  const hasError = boolValue(transaction.error_occured) || boolValue(transaction.is_voided) || boolValue(transaction.is_refunded);

  if (success && !pending && !hasError) return "paid";
  if (!success && !pending) return "failed";
  if (hasError) return "failed";
  return "pending";
}

function transactionId(transaction = {}) {
  return cleanText(transaction.id || transaction.transaction_id || transaction.txn_response_code || "", 80);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (!["POST", "GET"].includes(event.httpMethod)) return jsonResponse(405, { error: "Method not allowed." });

  try {
    const secret = process.env.PAYMOB_HMAC_SECRET;
    if (!secret) {
      console.error("Paymob webhook rejected: PAYMOB_HMAC_SECRET is not configured");
      return jsonResponse(500, { error: "Webhook is not configured." });
    }

    const { payload, obj: transaction, hmac } = extractWebhookData(event);
    if (!verifyPaymobHmac(transaction, hmac, secret)) {
      console.warn("Paymob webhook rejected: invalid HMAC", {
        transactionId: transactionId(transaction)
      });
      return jsonResponse(401, { error: "Invalid HMAC." });
    }

    const reference = extractOrderReference(payload, transaction);
    const id = transactionId(transaction);
    const nextPaymentStatus = paymentStatus(transaction);
    const paid = nextPaymentStatus === "paid";
    const failed = nextPaymentStatus === "failed";

    if (!reference) {
      console.warn("Paymob webhook accepted but no order reference was found", { transactionId: id, status: nextPaymentStatus });
      return jsonResponse(202, { received: true, status: "accepted_without_reference" });
    }

    const order = await updateOrder(reference, (existing) => {
      const processedTransactionIds = Array.isArray(existing.payment?.processedTransactionIds)
        ? existing.payment.processedTransactionIds
        : [];
      const alreadyProcessed = id && processedTransactionIds.includes(id);
      const ids = alreadyProcessed || !id ? processedTransactionIds : [...processedTransactionIds, id];

      if (alreadyProcessed && existing.status === "paid") {
        return existing;
      }

      return {
        ...existing,
        status: paid ? "paid" : failed ? "failed" : "pending",
        paidAt: paid && !existing.paidAt ? new Date().toISOString() : existing.paidAt || null,
        payment: {
          ...(existing.payment || {}),
          method: "paymob",
          provider: "paymob",
          status: nextPaymentStatus,
          transactionId: id || existing.payment?.transactionId || null,
          processedTransactionIds: ids,
          paymobOrderId: transaction.order?.id || existing.payment?.paymobOrderId || null,
          paymobStatus: nextPaymentStatus,
          lastWebhookAt: new Date().toISOString()
        }
      };
    });

    console.info("Paymob webhook processed", {
      orderReference: reference,
      transactionId: id,
      status: order.status
    });

    return jsonResponse(200, {
      received: true,
      orderReference: reference,
      status: order.status
    });
  } catch (error) {
    console.error("Paymob webhook processing failed", { message: error.message });
    return jsonResponse(500, { error: "Webhook processing failed." });
  }
};
