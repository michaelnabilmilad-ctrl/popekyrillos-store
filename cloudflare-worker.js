import { onRequest as createBostaDelivery } from "./functions/api/create-bosta-delivery.js";
import { onRequest as createPaymobIntention } from "./functions/api/create-paymob-intention.js";
import { onRequest as paymobWebhook } from "./functions/api/paymob-webhook.js";
import { onRequest as uploadProductImage } from "./functions/api/upload-product-image.js";
import { onRequest as updateProducts } from "./functions/api/update-products.js";

const canonicalOrigin = "https://popekyrillos.store";
const canonicalHostname = "popekyrillos.store";
const staticRewrites = {
  "/cart": "/cart.html",
  "/checkout": "/checkout.html",
  "/payment": "/payment.html",
  "/policies": "/policies.html",
  "/privacy-policy": "/policies.html",
  "/refund-policy": "/policies.html",
  "/shipping-policy": "/policies.html",
  "/payment-success": "/payment-success.html",
  "/payment-failed": "/payment-failed.html",
  "/payment-pending": "/payment-pending.html"
};
const htmlRoutePaths = new Set(["/", "/products", "/contact"]);

let productsCache = null;
let productsCacheTime = 0;

function unauthorizedAdminResponse() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Pope Kyrillos Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

function parseBasicAuth(request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Basic ")) return null;

  try {
    const decoded = atob(authorization.slice(6));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function isAdminAuthorized(request, env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return false;
  const credentials = parseBasicAuth(request);
  if (!credentials) return false;
  return timingSafeEqual(credentials.username, env.ADMIN_USERNAME) && timingSafeEqual(credentials.password, env.ADMIN_PASSWORD);
}

function isProtectedAdminPath(pathname) {
  return pathname === "/admin" || pathname === "/admin.html" || pathname === "/admin.css" || pathname === "/admin.js" || pathname.startsWith("/admin/");
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

function rewriteGetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), {
    method: "GET",
    headers: request.headers
  });
}

function normalizeSlug(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function localized(value) {
  if (value && typeof value === "object") return value.ar || value.en || Object.values(value).find(Boolean) || "";
  return value || "";
}

function productSlug(product) {
  return normalizeSlug(product?.slug || localized(product?.name) || product?.id || "");
}

function canonicalProductPath(product) {
  return `/products/${encodeURIComponent(productSlug(product) || product?.id || "")}`;
}

function canonicalProductUrl(product) {
  return `${canonicalOrigin}${canonicalProductPath(product)}`;
}

function cleanDescription(description = "") {
  return String(description).split("الاختيارات والأسعار:")[0].replace(/\s+/g, " ").trim();
}

function productImages(product) {
  if (Array.isArray(product?.images) && product.images.length) return product.images;
  if (product?.image) return [product.image];
  return [];
}

function productPrice(product) {
  const variantPrices = Array.isArray(product?.variants)
    ? product.variants.map((variant) => Number(variant.price)).filter((price) => Number.isFinite(price) && price > 0)
    : [];
  if (variantPrices.length) return Math.min(...variantPrices);
  const price = Number(product?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function isVariantAvailable(variant) {
  const quantity = Number(variant?.quantity);
  if (Number.isInteger(quantity) && quantity >= 0) return quantity > 0;
  return variant?.available !== false;
}

function hasAvailableVariant(product) {
  if (Array.isArray(product?.variants) && product.variants.length) return product.variants.some(isVariantAvailable);
  return product?.stock !== "غير متاح حاليا" && product?.available !== false;
}

async function loadProducts(env, request) {
  if (productsCache && Date.now() - productsCacheTime < 60000) return productsCache;
  const response = await env.ASSETS.fetch(rewriteRequest(request, "/products.json"));
  if (!response.ok) return [];
  productsCache = await response.json();
  productsCacheTime = Date.now();
  return productsCache;
}

function productByIdOrSlug(products, value = "") {
  const decoded = decodeURIComponent(String(value || ""));
  const normalized = normalizeSlug(decoded);
  return (
    products.find((product) => product.id === decoded || product.slug === decoded) ||
    products.find((product) => productSlug(product) === normalized || normalizeSlug(product.id) === normalized) ||
    null
  );
}

function productFromUrl(products, url) {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] === "products" && segments[1]) return productByIdOrSlug(products, segments.slice(1).join("/"));
  if (segments[0] === "product") return productByIdOrSlug(products, segments[1] || url.searchParams.get("id") || url.searchParams.get("product"));
  if (segments[0] === "en" && segments[1] === "products" && segments[2]) return productByIdOrSlug(products, segments.slice(2).join("/"));
  return productByIdOrSlug(products, url.searchParams.get("product") || url.searchParams.get("id") || "");
}

function legacyProductUrl(url) {
  return (
    url.searchParams.has("product") ||
    url.searchParams.has("id") ||
    url.pathname === "/product" ||
    url.pathname.startsWith("/product/") ||
    url.pathname.startsWith("/en/products/")
  );
}

function redirectToProduct(product, url, status = 301) {
  const target = new URL(canonicalProductUrl(product));
  const variant = url.searchParams.get("variant");
  const image = url.searchParams.get("image");
  if (variant) target.searchParams.set("variant", variant);
  if (image) target.searchParams.set("image", image);
  return Response.redirect(target.toString(), status);
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function absoluteAssetUrl(value = "") {
  if (!value) return "";
  return new URL(value.startsWith("/") ? value : `/${value}`, canonicalOrigin).toString();
}

function injectHead(html, tags) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, tags.title).replace(/<meta\s+name="description"[\s\S]*?>/i, tags.description).replace("</head>", `${tags.extra}\n  </head>`);
}

function injectCanonical(html, url) {
  const canonical = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  const ogUrl = `<meta property="og:url" content="${escapeHtml(url)}" />`;
  let nextHtml = html;
  if (/<link\s+rel="canonical"[\s\S]*?>/i.test(nextHtml)) nextHtml = nextHtml.replace(/<link\s+rel="canonical"[\s\S]*?>/i, canonical);
  else nextHtml = nextHtml.replace("</head>", `    ${canonical}\n  </head>`);
  if (/<meta\s+property="og:url"[\s\S]*?>/i.test(nextHtml)) nextHtml = nextHtml.replace(/<meta\s+property="og:url"[\s\S]*?>/i, ogUrl);
  return nextHtml;
}

function productMetaTags(product) {
  const titleText = `${localized(product.name)} | مكتبة البابا كيرلس`;
  const descriptionText = cleanDescription(localized(product.description)) || "تفاصيل المنتج من مكتبة البابا كيرلس.";
  const canonical = canonicalProductUrl(product);
  const image = absoluteAssetUrl(productImages(product)[0] || "assets/optimized/hero-papa-kyrillos-products.webp");
  const price = productPrice(product);
  const availability = hasAvailableVariant(product) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: localized(product.name),
    description: descriptionText,
    image: image ? [image] : undefined,
    sku: product.sku || product.id,
    url: canonical,
    offers: {
      "@type": "Offer",
      priceCurrency: "EGP",
      price: price === null ? undefined : price,
      availability,
      url: canonical
    }
  };

  return {
    title: `<title>${escapeHtml(titleText)}</title>`,
    description: `<meta name="description" content="${escapeHtml(descriptionText.slice(0, 170))}" />`,
    extra: [
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      '<meta name="robots" content="index, follow" />',
      '<meta property="og:type" content="product" />',
      `<meta property="og:title" content="${escapeHtml(titleText)}" />`,
      `<meta property="og:description" content="${escapeHtml(descriptionText.slice(0, 170))}" />`,
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${escapeHtml(titleText)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(descriptionText.slice(0, 170))}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
      `<script type="application/ld+json" id="product-json-ld">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`
    ].join("\n    ")
  };
}

async function htmlResponse(request, env, pathname = "/index.html", init = {}) {
  const assetPath = pathname === "/index.html" ? "/" : pathname.replace(/\.html$/, "");
  const response = await env.ASSETS.fetch(rewriteGetRequest(request, assetPath));
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  if (request.method === "HEAD") return new Response(null, { status: init.status || response.status, headers });
  if (headers.get("Content-Type")?.includes("text/html") && init.canonicalUrl) {
    return new Response(injectCanonical(await response.text(), init.canonicalUrl), { status: init.status || response.status, headers });
  }
  return new Response(response.body, { status: init.status || response.status, headers });
}

async function productPageResponse(request, env, product) {
  const response = await env.ASSETS.fetch(rewriteGetRequest(request, "/"));
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }
  let html = await response.text();
  html = injectHead(html, productMetaTags(product));
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function notFoundResponse() {
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>المنتج غير موجود | مكتبة البابا كيرلس</title>
    <meta name="robots" content="noindex, follow" />
    <style>
      body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#f8f3ea;color:#1f2933;display:grid;min-height:100vh;place-items:center;padding:24px}
      main{max-width:620px;background:#fff;border:1px solid #e7dccb;border-radius:8px;padding:32px;box-shadow:0 18px 50px rgba(31,41,51,.08)}
      h1{margin:0 0 12px;font-size:clamp(1.6rem,4vw,2.3rem)}
      p{line-height:1.8;color:#52606d}
      a{display:inline-flex;margin-top:16px;background:#0c6b68;color:#fff;text-decoration:none;border-radius:6px;padding:12px 18px;font-weight:700}
    </style>
  </head>
  <body>
    <main>
      <h1>المنتج غير موجود</h1>
      <p>الرابط الذي فتحته لا يطابق منتجا متاحا حاليا. يمكنك الرجوع إلى كل المنتجات أو التواصل معنا للمساعدة.</p>
      <a href="/#catalog">الرجوع إلى المنتجات</a>
    </main>
  </body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, follow"
    }
  });
}

function withAssetCacheHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  if (pathname === "/products.json" || pathname === "/sitemap.xml" || pathname === "/robots.txt") {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = requestContext(request, env, ctx);

    const forwardedProto = request.headers.get("X-Forwarded-Proto") || "";
    const isHttps = url.protocol === "https:" || forwardedProto === "https";
    if (!isHttps || url.hostname !== canonicalHostname) {
      url.protocol = "https:";
      url.hostname = canonicalHostname;
      return Response.redirect(url.toString(), 301);
    }

    if (isProtectedAdminPath(url.pathname)) {
      if (!isAdminAuthorized(request, env)) return unauthorizedAdminResponse();

      if (url.pathname === "/admin" || url.pathname === "/admin.html") {
        url.pathname = "/admin/";
        return Response.redirect(url.toString(), 302);
      }

      if (url.pathname === "/admin/api/update-products") return updateProducts(context);
      if (url.pathname === "/admin/api/upload-product-image") return uploadProductImage(context);
    }

    if (url.pathname === "/api/create-paymob-intention") return createPaymobIntention(context);
    if (url.pathname === "/api/create-bosta-delivery") return createBostaDelivery(context);
    if (url.pathname === "/api/paymob-webhook") return paymobWebhook(context);

    if (legacyProductUrl(url) || url.pathname.startsWith("/products/")) {
      const products = await loadProducts(env, request);
      const product = productFromUrl(products, url);
      if (legacyProductUrl(url) && product) return redirectToProduct(product, url);
      if (url.pathname.startsWith("/products/")) {
        if (!product) return notFoundResponse();
        return productPageResponse(request, env, product);
      }
    }

    if (staticRewrites[url.pathname]) {
      const isPrivate = ["/cart", "/checkout", "/payment", "/payment-success", "/payment-failed", "/payment-pending"].includes(url.pathname);
      return htmlResponse(request, env, staticRewrites[url.pathname], isPrivate ? {} : { canonicalUrl: `${canonicalOrigin}${url.pathname}` });
    }

    if (htmlRoutePaths.has(url.pathname) || url.pathname.startsWith("/category/")) {
      return htmlResponse(request, env, "/index.html", { canonicalUrl: `${canonicalOrigin}${url.pathname === "/" ? "/" : url.pathname}` });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withAssetCacheHeaders(assetResponse, url.pathname);
  }
};
