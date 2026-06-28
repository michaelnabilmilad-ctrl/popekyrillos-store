import { onRequest as createBostaDelivery } from "./functions/api/create-bosta-delivery.js";
import { onRequest as createPaymobIntention } from "./functions/api/create-paymob-intention.js";
import { onRequest as paymobWebhook } from "./functions/api/paymob-webhook.js";
import { onRequest as uploadProductImage } from "./functions/api/upload-product-image.js";
import { onRequest as updateProducts } from "./functions/api/update-products.js";

const rewrites = {
  "/payment-success": "/payment-success.html",
  "/payment-failed": "/payment-failed.html",
  "/payment-pending": "/payment-pending.html"
};

function unauthorizedAdminResponse() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Pope Kyrillos Admin", charset="UTF-8"',
      "Cache-Control": "no-store"
    }
  });
}

function parseBasicAuth(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(authorization.slice(6));
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function isAdminAuthorized(request, env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    return false;
  }

  const credentials = parseBasicAuth(request);
  if (!credentials) {
    return false;
  }

  return (
    timingSafeEqual(credentials.username, env.ADMIN_USERNAME) &&
    timingSafeEqual(credentials.password, env.ADMIN_PASSWORD)
  );
}

function isProtectedAdminPath(pathname) {
  return (
    pathname === "/admin" ||
    pathname === "/admin.html" ||
    pathname === "/admin.css" ||
    pathname === "/admin.js" ||
    pathname.startsWith("/admin/")
  );
}

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

    if (isProtectedAdminPath(url.pathname)) {
      if (!isAdminAuthorized(request, env)) {
        return unauthorizedAdminResponse();
      }

      if (url.pathname === "/admin" || url.pathname === "/admin.html") {
        url.pathname = "/admin/";
        return Response.redirect(url.toString(), 302);
      }

      if (url.pathname === "/admin/api/update-products") {
        return updateProducts(context);
      }

      if (url.pathname === "/admin/api/upload-product-image") {
        return uploadProductImage(context);
      }
    }

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
