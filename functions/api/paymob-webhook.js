import {
  boolValue,
  cleanText,
  extractOrderReference,
  extractWebhookData,
  jsonResponse,
  updateOrder,
  verifyPaymobHmac
} from "../_paymob-utils.js";
import { bostaReference, createBostaDeliveryForOrder } from "../_bosta-utils.js";

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

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return jsonResponse(204, {});
  if (!["POST", "GET"].includes(request.method)) return jsonResponse(405, { error: "Method not allowed." });

  try {
    const secret = env.PAYMOB_HMAC_SECRET;
    if (!secret) {
      console.error("Paymob webhook rejected: PAYMOB_HMAC_SECRET is not configured");
      return jsonResponse(500, { error: "Webhook is not configured." });
    }

    const { payload, obj: transaction, hmac } = await extractWebhookData(context);
    if (!(await verifyPaymobHmac(transaction, hmac, secret))) {
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

    const order = await updateOrder(env, reference, (existing) => {
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

    let bostaShipment = null;
    if (paid && order.customer?.deliveryMethod === "bosta" && !order.bosta?.delivery) {
      try {
        bostaShipment = await createBostaDeliveryForOrder(env, order);
        console.info("Bosta delivery created after Paymob payment", {
          orderReference: reference,
          bostaReference: bostaReference(bostaShipment)
        });
      } catch (error) {
        console.error("Bosta delivery creation after Paymob payment failed", {
          orderReference: reference,
          message: error.message
        });
        await updateOrder(env, reference, (existing) => ({
          ...existing,
          bosta: {
            ...(existing.bosta || {}),
            status: "failed",
            error: cleanText(error.message, 300),
            failedAt: new Date().toISOString()
          }
        }));
      }
    }

    return jsonResponse(200, {
      received: true,
      orderReference: reference,
      status: order.status,
      bostaReference: bostaShipment ? bostaReference(bostaShipment) : order.bosta?.reference || null
    });
  } catch (error) {
    console.error("Paymob webhook processing failed", { message: error.message });
    return jsonResponse(500, { error: "Webhook processing failed." });
  }
}
