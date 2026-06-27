import { onRequest as createBostaDelivery } from "./functions/api/create-bosta-delivery.js";
import { onRequest as createPaymobIntention } from "./functions/api/create-paymob-intention.js";
import { onRequest as paymobWebhook } from "./functions/api/paymob-webhook.js";

const rewrites = {
  "/payment-success": "/payment-success.html",
  "/payment-failed": "/payment-failed.html",
  "/payment-pending": "/payment-pending.html"
};

function requestContext(request, env, ctx) {
  return {
    request,
    env,
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException() {}
  };
}

function rewriteRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = requestContext(request, env, ctx);

    if (url.pathname === "/api/create-paymob-intention") {
      return createPaymobIntention(context);
    }

    if (url.pathname === "/api/create-bosta-delivery") {
      return createBostaDelivery(context);
    }

    if (url.pathname === "/api/paymob-webhook") {
      return paymobWebhook(context);
    }

    if (rewrites[url.pathname]) {
      return env.ASSETS.fetch(rewriteRequest(request, rewrites[url.pathname]));
    }

    return env.ASSETS.fetch(request);
  }
};
