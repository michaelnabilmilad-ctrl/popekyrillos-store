import { onRequest as createBostaDelivery } from "./functions/api/create-bosta-delivery.js";
import { onRequest as createPaymobIntention } from "./functions/api/create-paymob-intention.js";
import { onRequest as paymobWebhook } from "./functions/api/paymob-webhook.js";
import { onRequest as uploadProductImage } from "./functions/api/upload-product-image.js";
import { onRequest as updateProducts } from "./functions/api/update-products.js";
import { onRequest as updateTaxonomy } from "./functions/api/update-taxonomy.js";
import { bestSellersResponse } from "./functions/api/best-sellers.js";

const canonicalOrigin = "https://popekyrillos.store";
const canonicalHostname = "popekyrillos.store";
const allowedOrdersOrigin = "https://popekyrillos.store";
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
const productColoringConfigs = {
  "custom-1782980654479": {
    coloringBaseImageUrl: "assets/coloring/iota-medal-1/base.webp",
    coloringMaskUrl: "assets/coloring/iota-medal-1/region-mask.png?v=2",
    coloringOutlineUrl: "assets/coloring/iota-medal-1/outline.png?v=2",
    coloringRegions: Array.from({ length: 13 }, (_, index) => ({ id: `region-${index + 1}`, maskColor: [index + 1, 0, 0] })),
    symmetryGroups: [
      ["region-2", "region-3", "region-4", "region-5"],
      ["region-6", "region-7"],
      ["region-8", "region-9"],
      ["region-10", "region-11"],
      ["region-12", "region-13"]
    ]
  }
};

function withProductColoringConfig(product) {
  const config = productColoringConfigs[String(product?.id || "")];
  return config ? { ...product, ...config } : product;
}

let productsCache = null;
let productsCacheTime = 0;
let productsCacheSha = "";
let taxonomyCache = "";
let taxonomyCacheTime = 0;
let taxonomyCacheSha = "";
let thumbnailManifestCache = null;

function githubConfig(env = {}) {
  return {
    token: String(env.GITHUB_TOKEN || "").trim(),
    owner: String(env.GITHUB_OWNER || "michaelnabilmilad-ctrl").trim(),
    repo: String(env.GITHUB_REPO || "popekyrillos-store").trim(),
    branch: String(env.GITHUB_PRODUCTS_BRANCH || env.GITHUB_DATA_BRANCH || "products-data").trim()
  };
}

function githubHeaders(config, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    "User-Agent": "popekyrillos-store",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
  };
}

function githubContentsUrl(config, path) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path.replace(/^\/+/, "")}?ref=${encodeURIComponent(config.branch)}`;
}

function githubRawUrl(config, path) {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${path.replace(/^\/+/, "")}`;
}

async function githubFetchText(env, path) {
  const config = githubConfig(env);

  if (config.token) {
    const response = await fetch(githubContentsUrl(config, path), {
      headers: githubHeaders(config, "application/vnd.github.raw")
    });
    if (response.ok) {
      return {
        text: await response.text(),
        sha: response.headers.get("ETag") || ""
      };
    }
  }

  const response = await fetch(githubRawUrl(config, path), {
    headers: { "User-Agent": "popekyrillos-store" }
  });
  if (!response.ok) throw new Error(`GitHub raw fetch failed with ${response.status}`);
  return {
    text: await response.text(),
    sha: response.headers.get("ETag") || ""
  };
}

async function githubFetchAsset(env, path) {
  const config = githubConfig(env);
  if (config.token) {
    const response = await fetch(githubContentsUrl(config, path), {
      headers: githubHeaders(config, "application/vnd.github.raw")
    });
    if (response.ok) return response;
  }

  return fetch(githubRawUrl(config, path), {
    headers: { "User-Agent": "popekyrillos-store" }
  });
}

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
  return pathname === "/admin" || pathname === "/admin.html" || pathname === "/admin.css" || pathname === "/admin.js" || pathname === "/admin-orders.js" || pathname.startsWith("/admin/");
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

function productPriceText(product) {
  const price = productPrice(product);
  return price === null ? "" : `${price} ج.م`;
}

function isVariantAvailable(variant) {
  const rawQuantity = variant?.quantity;
  const quantity = rawQuantity === null || rawQuantity === undefined || rawQuantity === "" ? null : Number(rawQuantity);
  if (quantity !== null && Number.isInteger(quantity) && quantity >= 0) return quantity > 0;
  return variant?.available !== false;
}

function hasAvailableVariant(product) {
  if (Array.isArray(product?.variants) && product.variants.length) return product.variants.some(isVariantAvailable);
  return product?.stock !== "غير متاح حاليا" && product?.available !== false;
}

function productDescription(product) {
  return cleanDescription(localized(product?.description)) || "تفاصيل المنتج من مكتبة البابا كيرلس.";
}

function productSsrHtml(product) {
  const name = localized(product.name);
  const description = productDescription(product);
  const image = absoluteAssetUrl(productImages(product)[0] || "assets/optimized/hero-papa-kyrillos-products.webp");
  const price = productPriceText(product);
  const canonical = canonicalProductUrl(product);
  const availability = hasAvailableVariant(product) ? "متاح" : "غير متاح حاليا";
  return `
    <section class="ssr-product-page" aria-labelledby="ssr-product-title" dir="rtl">
      <div class="ssr-product-shell">
        <a class="ssr-product-back" href="/#catalog">العودة إلى المنتجات</a>
        <div class="ssr-product-grid">
          <figure class="ssr-product-media">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" width="900" height="900" />
          </figure>
          <article class="ssr-product-copy">
            <p class="ssr-product-label">${escapeHtml(localized(product.label || product.badge || "منتج"))}</p>
            <h1 id="ssr-product-title">${escapeHtml(name)}</h1>
            <p class="ssr-product-description">${escapeHtml(description)}</p>
            ${price ? `<p class="ssr-product-price">${escapeHtml(price)}</p>` : ""}
            <p class="ssr-product-stock">${escapeHtml(availability)}</p>
            <a class="ssr-product-action" href="${escapeHtml(canonical)}">عرض المنتج</a>
          </article>
        </div>
      </div>
    </section>`;
}

function productSsrStyles() {
  return `<style>
    .js-product-route .ssr-product-page{display:none}
    .ssr-product-page{padding:112px clamp(18px,5vw,74px) 64px;background:#faf6ed;color:#10212a}
    .ssr-product-shell{max-width:1180px;margin:0 auto}
    .ssr-product-back{display:inline-flex;margin-bottom:18px;color:#073d42;font-weight:800;text-decoration:none}
    .ssr-product-grid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(280px,1.1fr);gap:28px;align-items:center}
    .ssr-product-media{display:grid;place-items:center;aspect-ratio:1/1;margin:0;border:1px solid #ded8cb;border-radius:8px;background:#fff;overflow:hidden}
    .ssr-product-media img{display:block;width:100%;height:100%;object-fit:contain;padding:20px}
    .ssr-product-label{margin:0 0 8px;color:#c69245;font-weight:800}
    .ssr-product-copy h1{margin:0;font-size:clamp(30px,4vw,50px);line-height:1.2}
    .ssr-product-description{margin:18px 0 0;color:#65747a;line-height:1.9}
    .ssr-product-price{margin:20px 0 0;color:#85243c;font-size:26px;font-weight:900}
    .ssr-product-stock{margin:8px 0 0;color:#073d42;font-weight:800}
    .ssr-product-action{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:24px;padding:0 18px;border-radius:8px;background:#1a2751;color:#fff;text-decoration:none;font-weight:900}
    @media (max-width:760px){.ssr-product-page{padding:92px 18px 44px}.ssr-product-grid{grid-template-columns:1fr}.ssr-product-copy h1{font-size:28px}}
  </style>
  <script>document.documentElement.classList.add("js-product-route");</script>`;
}

async function loadProducts(env, request, { maxAgeMs = 5000 } = {}) {
  if (productsCache && Date.now() - productsCacheTime < maxAgeMs) return productsCache;

  try {
    const latest = await githubFetchText(env, "products.json");
    const products = JSON.parse(latest.text);
    if (Array.isArray(products)) {
      productsCache = products;
      productsCacheTime = Date.now();
      productsCacheSha = latest.sha;
      return productsCache;
    }
  } catch (error) {
    console.warn("Could not load products.json from GitHub, falling back to deployed assets.", error);
  }

  const response = await env.ASSETS.fetch(rewriteRequest(request, "/products.json"));
  if (!response.ok) return [];
  productsCache = await response.json();
  productsCacheTime = Date.now();
  productsCacheSha = response.headers.get("ETag") || "";
  return productsCache;
}

async function productsJsonResponse(request, env) {
  const products = await loadProducts(env, request, { maxAgeMs: 60000 });
  return new Response(JSON.stringify(products), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ...(productsCacheSha ? { ETag: productsCacheSha } : {})
    }
  });
}

function catalogThumbnail(product, manifest = {}) {
  const generated = manifest[String(product?.id || "")] || "";
  const source = generated || productImages(product)[0] || product?.image || "";
  return String(source || "");
}

function catalogDto(product, thumbnailManifest) {
  return {
    id: String(product?.id || ""),
    slug: productSlug(product),
    name: product?.name || "",
    price: productPrice(product),
    thumbnail: catalogThumbnail(product, thumbnailManifest),
    availability: hasAvailableVariant(product) ? "available" : "unavailable",
    category: catalogMainCategoryId(product),
    subcategory: product?.subcategory || product?.subCategory || ""
  };
}

async function loadThumbnailManifest(env, request) {
  if (thumbnailManifestCache) return thumbnailManifestCache;
  const response = await env.ASSETS.fetch(rewriteRequest(request, "/thumbnail-manifest-v2.json"));
  if (!response.ok) return {};
  try { thumbnailManifestCache = await response.json(); } catch { thumbnailManifestCache = {}; }
  return thumbnailManifestCache;
}

function normalizedSearch(value = "") {
  return String(value).normalize("NFKD").toLocaleLowerCase("ar").replace(/\s+/g, " ").trim();
}

const catalogMainCategoryIds = [
  "altar-vessels", "censers-incense", "candles-lamps", "church-vestments", "crosses",
  "icons-frames", "books-rituals", "occasions-service", "church-equipment"
];

const legacyCatalogCategoryIds = {
  brass: "altar-vessels",
  candles: "candles-lamps",
  vestments: "church-vestments",
  icons: "icons-frames",
  books: "books-rituals",
  gifts: "occasions-service"
};

const namedCatalogCategoryIds = {
  "مستلزمات المذبح والخدمة": "altar-vessels",
  "الصلبان": "crosses",
  "الأيقونات والبراويز": "icons-frames",
  "الكتب والطقوس": "books-rituals",
  "الهدايا والإكسسوارات": "occasions-service",
  "الملابس والمفارش الكنسية": "church-vestments",
  "تجهيزات الكنيسة": "church-equipment"
};

function catalogMainCategoryId(product) {
  const mainCategory = String(product?.mainCategory || "").trim();
  if (catalogMainCategoryIds.includes(mainCategory)) return mainCategory;
  const discoveryValues = [
    ...(Array.isArray(product?.searchKeywords) ? product.searchKeywords : []),
    ...(Array.isArray(product?.tags) ? product.tags : [])
  ].map((value) => String(value));
  const discovered = catalogMainCategoryIds.find((id) => discoveryValues.includes(id));
  if (discovered) return discovered;
  if (mainCategory === "الشمع والبخور") {
    return String(product?.category || "") === "brass" ? "censers-incense" : "candles-lamps";
  }
  if (namedCatalogCategoryIds[mainCategory]) return namedCatalogCategoryIds[mainCategory];
  return legacyCatalogCategoryIds[String(product?.category || "")] || mainCategory || "uncategorized";
}

function catalogProductMatches(product, params) {
  if (!hasAvailableVariant(product)) return false;
  const category = params.get("category") || "all";
  const subcategory = params.get("subcategory") || "";
  const search = normalizedSearch(params.get("search") || "");
  const price = params.get("price") || "all";
  const productCategory = catalogMainCategoryId(product);
  const productSubcategory = String(product?.subcategory || product?.subCategory || "");
  const amount = productPrice(product);
  if (category !== "all" && productCategory !== category) return false;
  if (subcategory && productSubcategory !== subcategory && String(product?.label || "") !== subcategory) return false;
  if (price === "under-1000" && !(amount !== null && amount < 1000)) return false;
  if (price === "1000-5000" && !(amount !== null && amount >= 1000 && amount <= 5000)) return false;
  if (price === "over-5000" && !(amount !== null && amount > 5000)) return false;
  if (search) {
    const haystack = normalizedSearch([
      localized(product?.name), product?.label, product?.description, productCategory, productSubcategory,
      ...(Array.isArray(product?.tags) ? product.tags : []),
      ...(Array.isArray(product?.searchKeywords) ? product.searchKeywords : [])
    ].join(" "));
    if (!haystack.includes(search)) return false;
  }
  return true;
}

function sortCatalogProducts(products, sort = "default") {
  if (sort !== "price-asc" && sort !== "price-desc") return products;
  const direction = sort === "price-desc" ? -1 : 1;
  return products.sort((a, b) => direction * ((productPrice(a) ?? Number.MAX_SAFE_INTEGER) - (productPrice(b) ?? Number.MAX_SAFE_INTEGER)));
}

async function catalogApiResponse(request, env, ctx) {
  const url = new URL(request.url);
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page"))) || 1);
  const limit = Math.min(48, Math.max(1, Math.trunc(Number(url.searchParams.get("limit"))) || 12));
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.searchParams.set("schema", "9");
  cacheUrl.searchParams.set("thumbnails", "plain-iota-v2");
  [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => cacheUrl.searchParams.append(key, value));
  const allProducts = await loadProducts(env, request, { maxAgeMs: 600000 });
  const thumbnailManifest = await loadThumbnailManifest(env, request);
  if (productsCacheSha) cacheUrl.searchParams.set("v", productsCacheSha);
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const edgeCache = caches.default;
  const cached = await edgeCache.match(cacheKey);
  if (cached) return cached;
  const matched = sortCatalogProducts(allProducts.filter((product) => catalogProductMatches(product, url.searchParams)), url.searchParams.get("sort") || "default");
  const start = (page - 1) * limit;
  const body = JSON.stringify({ items: matched.slice(start, start + limit).map((product) => catalogDto(product, thumbnailManifest)), page, limit, total: matched.length, hasMore: start + limit < matched.length });
  const response = new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate", "CDN-Cache-Control": "public, max-age=600, stale-while-revalidate=300" } });
  ctx.waitUntil(edgeCache.put(cacheKey, response.clone()));
  return response;
}

async function productApiResponse(request, env, product) {
  return new Response(JSON.stringify(product), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600, stale-while-revalidate=300" }
  });
}

async function loadTaxonomySource(env, request, { maxAgeMs = 5000 } = {}) {
  if (taxonomyCache && Date.now() - taxonomyCacheTime < maxAgeMs) return taxonomyCache;

  try {
    const latest = await githubFetchText(env, "category-taxonomy.js");
    if (latest.text.includes("window.POPE_KYRILLOS_TAXONOMY") && latest.text.includes("subcategoryImage")) {
      taxonomyCache = latest.text;
      taxonomyCacheTime = Date.now();
      taxonomyCacheSha = latest.sha;
      return taxonomyCache;
    }
  } catch (error) {
    console.warn("Could not load category-taxonomy.js from GitHub, falling back to deployed assets.", error);
  }

  const response = await env.ASSETS.fetch(rewriteRequest(request, "/category-taxonomy.js"));
  if (!response.ok) return "";
  taxonomyCache = await response.text();
  taxonomyCacheTime = Date.now();
  taxonomyCacheSha = response.headers.get("ETag") || "";
  return taxonomyCache;
}

async function taxonomyJsResponse(request, env) {
  const source = await loadTaxonomySource(env, request, { maxAgeMs: 300000 });
  return new Response(source, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      ...(taxonomyCacheSha ? { ETag: taxonomyCacheSha } : {})
    }
  });
}

function isProductUploadAsset(pathname) {
  return pathname.startsWith("/assets/optimized/products/") || pathname.startsWith("/assets/detail/products/");
}

function assetContentType(pathname = "") {
  const extension = pathname.toLowerCase().split("?")[0].split(".").pop();
  const types = {
    avif: "image/avif",
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp"
  };
  return types[extension] || "";
}

async function githubAssetFallbackResponse(pathname, env) {
  if (!isProductUploadAsset(pathname)) return null;
  const response = await githubFetchAsset(env, pathname);
  if (!response.ok) return null;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=60, must-revalidate");
  const contentType = assetContentType(pathname);
  if (contentType) headers.set("Content-Type", contentType);
  else ensureUtf8ContentType(headers, pathname);
  return new Response(response.body, { status: response.status, headers });
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

function absoluteCatalogUrl(value = "") {
  const rawValue = String(value || "").trim();
  if (!rawValue || /^(?:data|blob):/i.test(rawValue)) return "";
  try {
    return new URL(rawValue, canonicalOrigin).toString();
  } catch {
    return "";
  }
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function feedText(value = "", fallback = "") {
  const text = stripHtml(localized(value));
  return text || fallback;
}

function feedProductType(product) {
  return feedText(product?.subCategory || product?.label || product?.mainCategory || product?.category, "منتجات كنسية");
}

function isVisibleCatalogProduct(product) {
  return Boolean(product) && product.active !== false && product.hidden !== true && product.deleted !== true && product.published !== false;
}

function feedImages(product) {
  const seen = new Set();
  return productImages(product)
    .map(absoluteCatalogUrl)
    .filter((url) => url && /^https?:\/\//i.test(url))
    .filter((url) => {
      const key = url.replace(/#.*$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function feedPricing(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const candidates = variants.length
    ? variants
        .map((variant) => ({
          price: Number(variant.price),
          compareAtPrice: Number(variant.compareAtPrice)
        }))
        .filter((entry) => Number.isFinite(entry.price) && entry.price > 0)
    : [{ price: Number(product?.price), compareAtPrice: Number(product?.compareAtPrice) }];

  if (!candidates.length || !Number.isFinite(candidates[0].price)) return null;
  const selected = candidates.reduce((best, entry) => (entry.price < best.price ? entry : best), candidates[0]);
  const hasSale = Number.isFinite(selected.compareAtPrice) && selected.compareAtPrice > selected.price;
  return {
    price: hasSale ? selected.compareAtPrice : selected.price,
    salePrice: hasSale ? selected.price : null
  };
}

function feedMoney(value) {
  return `${Number(value).toFixed(2)} EGP`;
}

function catalogFeedItem(product, { includePrice = true } = {}) {
  const id = feedText(product.id);
  const title = feedText(product.name, id);
  const images = feedImages(product);
  const pricing = feedPricing(product);
  const excludedReasons = [];

  if (!id) excludedReasons.push("missing id");
  if (!title) excludedReasons.push("missing title");
  if (!images.length) excludedReasons.push("missing valid image");
  if (includePrice && !pricing) excludedReasons.push("missing valid price");
  if (excludedReasons.length) return { item: "", excludedReasons };

  const description = feedText(product.description, title);
  const availability = hasAvailableVariant(product) ? "in stock" : "out of stock";
  const productType = feedProductType(product);
  const additionalImages = images.slice(1, 11);
  const lines = [
    "    <item>",
    `      <g:id>${xmlEscape(id)}</g:id>`,
    `      <g:title>${xmlEscape(title)}</g:title>`,
    `      <g:description>${xmlEscape(description)}</g:description>`,
    `      <g:availability>${availability}</g:availability>`,
    "      <g:condition>new</g:condition>"
  ];

  if (includePrice && pricing) {
    lines.push(`      <g:price>${xmlEscape(feedMoney(pricing.price))}</g:price>`);
    if (pricing.salePrice !== null) lines.push(`      <g:sale_price>${xmlEscape(feedMoney(pricing.salePrice))}</g:sale_price>`);
  }

  lines.push(
    `      <g:link>${xmlEscape(canonicalProductUrl(product))}</g:link>`,
    `      <g:image_link>${xmlEscape(images[0])}</g:image_link>`,
    ...additionalImages.map((image) => `      <g:additional_image_link>${xmlEscape(image)}</g:additional_image_link>`),
    "      <g:brand>مكتبة البابا كيرلس</g:brand>",
    `      <g:product_type>${xmlEscape(productType)}</g:product_type>`,
    "    </item>"
  );

  return { item: lines.join("\n"), excludedReasons: [] };
}

function catalogFeedXml(products, { includePrice = true, requestPath = "/api/meta-catalog-feed.xml" } = {}) {
  const items = [];
  const excluded = [];

  products.filter(isVisibleCatalogProduct).forEach((product) => {
    try {
      const result = catalogFeedItem(product, { includePrice });
      if (result.item) {
        items.push(result.item);
      } else {
        excluded.push({ id: product?.id || "", reasons: result.excludedReasons });
        console.warn(`Catalog feed skipped product ${product?.id || "(missing id)"}: ${result.excludedReasons.join(", ")}`);
      }
    } catch (error) {
      excluded.push({ id: product?.id || "", reasons: [error?.message || "unknown error"] });
      console.warn(`Catalog feed failed product ${product?.id || "(missing id)"}`, error);
    }
  });

  const generatedAt = new Date().toISOString();
  return {
    xml: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
      "  <channel>",
      "    <title>مكتبة البابا كيرلس Product Feed</title>",
      `    <link>${xmlEscape(`${canonicalOrigin}${requestPath}`)}</link>`,
      "    <description>Product catalog feed generated from popekyrillos.store products.</description>",
      `    <lastBuildDate>${xmlEscape(generatedAt)}</lastBuildDate>`,
      `    <!-- included=${items.length}; excluded=${excluded.length}; includePrice=${includePrice ? "true" : "false"} -->`,
      ...items,
      "  </channel>",
      "</rss>"
    ].join("\n"),
    includedCount: items.length,
    excluded
  };
}

async function catalogFeedResponse(request, env, { includePrice = true } = {}) {
  const products = await loadProducts(env, request, { maxAgeMs: 60000 });
  const url = new URL(request.url);
  const result = catalogFeedXml(products, { includePrice, requestPath: url.pathname });
  return new Response(result.xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff",
      "X-Catalog-Feed-Included": String(result.includedCount),
      "X-Catalog-Feed-Excluded": String(result.excluded.length)
    }
  });
}

function injectHead(html, tags) {
  let nextHtml = html
    .replace(/<title>[\s\S]*?<\/title>/i, tags.title)
    .replace(/<meta\s+name="description"[\s\S]*?>/i, tags.description);

  [
    /<link\s+rel="canonical"[\s\S]*?>/gi,
    /<meta\s+name="robots"[\s\S]*?>/gi,
    /<meta\s+property="og:[^"]+"[\s\S]*?>/gi,
    /<meta\s+name="twitter:[^"]+"[\s\S]*?>/gi,
    /<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi
  ].forEach((pattern) => {
    nextHtml = nextHtml.replace(pattern, "");
  });

  return nextHtml.replace("</head>", `${tags.extra}\n  </head>`);
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

function ensureUtf8ContentType(headers, pathname = "") {
  const current = headers.get("Content-Type") || "";
  const lower = current.toLowerCase();
  if (lower.includes("charset=")) return;

  const type = current.split(";")[0].trim().toLowerCase();
  const fallbackByExtension = pathname.endsWith(".js")
    ? "text/javascript"
    : pathname.endsWith(".css")
      ? "text/css"
      : pathname.endsWith(".json")
        ? "application/json"
        : pathname.endsWith(".xml")
          ? "application/xml"
          : pathname.endsWith(".txt")
            ? "text/plain"
            : "";
  const normalized = type || fallbackByExtension;
  const needsUtf8 =
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized === "application/xml" ||
    normalized === "application/javascript";

  if (needsUtf8) headers.set("Content-Type", `${normalized}; charset=utf-8`);
}

function productMetaTags(product) {
  const titleText = `${localized(product.name)} | مكتبة البابا كيرلس`;
  const descriptionText = productDescription(product);
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
    brand: {
      "@type": "Brand",
      name: "مكتبة البابا كيرلس"
    },
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
  ensureUtf8ContentType(headers, pathname);
  headers.set("Cache-Control", init.private ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300");
  headers.set("X-Content-Type-Options", "nosniff");
  if (request.method === "HEAD") return new Response(null, { status: init.status || response.status, headers });
  if (headers.get("Content-Type")?.includes("text/html") && init.canonicalUrl) {
    return new Response(injectCanonical(await response.text(), init.canonicalUrl), { status: init.status || response.status, headers });
  }
  return new Response(response.body, { status: init.status || response.status, headers });
}

async function productPageResponse(request, env, product) {
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }
  const tags = productMetaTags(product);
  const safeProduct = JSON.stringify(product).replace(/</g, "\\u003c");
  const name = escapeHtml(localized(product?.name));
  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${tags.title}${tags.description}${tags.extra}
<link rel="preload" href="/assets/fonts/ge-ss-two-bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.min.css"><link rel="stylesheet" href="/product-page.css?v=6">
</head><body class="standalone-product-page">
<header class="site-header" data-elevated="false"><div class="brand-cluster"><a class="brand" href="/" aria-label="مكتبة البابا كيرلس"><span class="brand-logo-wrap"><img src="/assets/optimized/logo-papa-kyrillos-original.webp" alt="" width="160" height="160" decoding="async"></span><span><strong>مكتبة البابا كيرلس</strong><small>مستلزمات الكنائس والخدمة</small></span></a></div><nav class="main-nav" aria-label="التنقل الرئيسي"><a href="/#categories">الأقسام</a><a href="/#catalog">المنتجات</a></nav><div class="header-actions"><a class="cart-toggle" href="/cart" aria-label="فتح السلة"><span>السلة</span><span class="cart-count" data-cart-count>0</span></a></div></header>
<main class="product-route-main"><a class="product-route-back" href="/#catalog">العودة إلى المنتجات</a><div id="product-detail" aria-label="${name}"></div><section class="product-route-related" aria-labelledby="related-title"><h2 id="related-title">منتجات مشابهة</h2><div class="product-grid" data-related-products></div></section></main>
<footer class="product-route-footer"><strong>مكتبة البابا كيرلس</strong><span>مستلزمات الكنائس والخدمة</span><a href="/policies">السياسات</a><a href="https://wa.me/201016125589">تواصل معنا</a></footer>
<div class="toast" data-toast role="status" aria-live="polite"></div><script id="product-data" type="application/json">${safeProduct}</script><script src="/product-page.js?v=7" defer></script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
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
  ensureUtf8ContentType(headers, pathname);
  if (pathname === "/products.json") {
    headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  } else if (pathname === "/category-taxonomy.js") {
    headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  } else if (pathname === "/sitemap.xml" || pathname === "/robots.txt") {
    headers.set("Cache-Control", "no-store");
  } else if (/\/assets\/thumbnails\/(?:320|480|640)\//.test(pathname) || /\/assets\/(?:optimized|detail|products)\//.test(pathname)) {
    headers.set("Cache-Control", "public, max-age=2592000, stale-while-revalidate=86400");
  } else if (/\.[a-f0-9]{8,}\.(?:js|css|woff2|webp|avif)$/i.test(pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (/\.(?:js|css|woff2)$/i.test(pathname)) {
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  }
  return new Response(response.body, { status: response.status, headers });
}

function orderCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin"
  });
  if (origin === allowedOrdersOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrdersOrigin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function orderJsonResponse(request, body, init = {}) {
  const headers = orderCorsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers
  });
}

function orderCorsAllowed(request) {
  const origin = request.headers.get("Origin") || "";
  return !origin || origin === allowedOrdersOrigin;
}

function cleanOrderString(value) {
  return String(value || "").trim();
}

function airtableValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function parseOrderProducts(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function productLinePrice(product, quantity) {
  const price = Number(product?.price);
  if (Number.isFinite(price)) return price;
  const lineTotal = Number(product?.lineTotal);
  if (Number.isFinite(lineTotal) && Number.isFinite(quantity) && quantity > 0) return lineTotal / quantity;
  return null;
}

function formatOrderPrice(value) {
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
}

function formatOrderProductsForAirtable(value) {
  const parsed = parseOrderProducts(value);
  if (!parsed) return airtableValue(value);

  const lines = parsed
    .map((product) => {
      const name = cleanOrderString(product?.name) || cleanOrderString(product?.productId);
      if (!name) return "";
      const quantity = Number(product?.quantity ?? product?.qty ?? 1);
      const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      const price = productLinePrice(product, safeQuantity);
      const priceText = price === null ? "" : formatOrderPrice(price);
      return `${name} | \u0627\u0644\u0643\u0645\u064a\u0629: ${safeQuantity} | \u0627\u0644\u0633\u0639\u0631: ${priceText} \u062c.\u0645`;
    })
    .filter(Boolean);

  return lines.length ? lines.join("\n") : airtableValue(value);
}

function normalizePaymentMethod(value) {
  const method = cleanOrderString(value);
  const mapping = {
    instapay: "InstaPay",
    "Instapay / Bank transfer": "InstaPay",
    "InstaPay / Bank transfer": "InstaPay",
    vodafoneCash: "Vodafone Cash",
    "Vodafone Cash": "Vodafone Cash",
    fawry: "Online Payment",
    Fawry: "Online Payment",
    pickupCash: "Cash",
    "Cash on pickup": "Cash",
    Cash: "Cash",
    paymob: "Online Payment",
    Paymob: "Online Payment",
    "Online Payment": "Online Payment",
    "Bank Transfer": "Bank Transfer"
  };
  return mapping[method] || method;
}

function normalizeDeliveryType(value) {
  const deliveryType = cleanOrderString(value);
  const mapping = {
    pickup: "\u0627\u0633\u062a\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629",
    Pickup: "\u0627\u0633\u062a\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629",
    "Cash on pickup": "\u0627\u0633\u062a\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629",
    "Bosta delivery": "\u0634\u062d\u0646",
    bosta: "\u0634\u062d\u0646",
    Shipping: "\u0634\u062d\u0646"
  };
  return mapping[deliveryType] || deliveryType;
}

function normalizeOrderPayload(payload = {}) {
  return {
    customerName: cleanOrderString(payload.customerName),
    phone: cleanOrderString(payload.phone),
    source: cleanOrderString(payload.source) || "Website",
    products: formatOrderProductsForAirtable(payload.products),
    total: Number(payload.total),
    paymentStatus: cleanOrderString(payload.paymentStatus) || "\u063a\u064a\u0631 \u0645\u062f\u0641\u0648\u0639",
    paymentMethod: normalizePaymentMethod(payload.paymentMethod),
    paymentProof: cleanOrderString(payload.paymentProof),
    pickupDate: cleanOrderString(payload.pickupDate),
    deliveryType: normalizeDeliveryType(payload.deliveryType),
    orderStatus: cleanOrderString(payload.orderStatus) || "\u062c\u062f\u064a\u062f",
    missingInfo: cleanOrderString(payload.missingInfo) || "\u0644\u0627 \u064a\u0648\u062c\u062f",
    notes: cleanOrderString(payload.notes)
  };
}

function validateOrderPayload(order) {
  const missing = [];
  if (!order.customerName) missing.push("customerName");
  if (!order.phone) missing.push("phone");
  if (!order.products || order.products === "[]") missing.push("products");
  if (!Number.isFinite(order.total)) missing.push("total");
  return missing;
}

function airtableOrderFields(order) {
  const fields = {
    "Customer Name": order.customerName,
    Phone: order.phone,
    Source: order.source,
    Products: order.products,
    Total: order.total,
    "Payment Status": order.paymentStatus,
    "Payment Method": order.paymentMethod,
    "Delivery Type": order.deliveryType,
    "Order Status": order.orderStatus,
    "Missing Info": order.missingInfo,
    Notes: order.notes
  };
  if (order.pickupDate) fields["Pickup Date"] = order.pickupDate;
  if (order.paymentProof) fields["Payment Proof"] = [{ url: order.paymentProof }];
  return fields;
}

function safeAirtableError(responseText = "") {
  try {
    const data = JSON.parse(responseText);
    return {
      type: String(data?.error?.type || data?.type || ""),
      message: String(data?.error?.message || data?.message || "")
    };
  } catch {
    return {
      type: "",
      message: responseText.slice(0, 500)
    };
  }
}

const editableOrderFields = {
  paymentStatus: "Payment Status",
  orderStatus: "Order Status",
  pickupDate: "Pickup Date",
  notes: "Notes"
};

const allowedPaymentStatuses = new Set(["غير مدفوع", "تحويل للمراجعة", "مدفوع", "دفع عند الاستلام"]);
const allowedOrderStatuses = new Set(["جديد", "انتظار بيانات", "انتظار الدفع", "قيد التجهيز", "جاهز للاستلام / الشحن", "تم التسليم", "ملغي"]);

function airtableOrdersUrl(env, recordId = "") {
  const baseId = encodeURIComponent(String(env.AIRTABLE_BASE_ID || "").trim());
  const tableName = encodeURIComponent(String(env.AIRTABLE_TABLE_NAME || "").trim());
  const suffix = recordId ? `/${encodeURIComponent(recordId)}` : "";
  return `https://api.airtable.com/v0/${baseId}/${tableName}${suffix}`;
}

function adminOrdersJson(payload, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "X-Content-Type-Options": "nosniff",
      ...(init.headers || {})
    }
  });
}

function hasAirtableConfig(env) {
  return Boolean(env.AIRTABLE_TOKEN && env.AIRTABLE_BASE_ID && env.AIRTABLE_TABLE_NAME);
}

function serializeOrderRecord(record = {}) {
  const fields = record.fields || {};
  return {
    id: record.id || "",
    createdTime: record.createdTime || "",
    orderId: fields["Order ID"] ?? "",
    customerName: fields["Customer Name"] || "",
    phone: fields.Phone || "",
    source: fields.Source || "",
    products: fields.Products || "",
    total: Number(fields.Total) || 0,
    paymentStatus: fields["Payment Status"] || "",
    paymentMethod: fields["Payment Method"] || "",
    paymentProof: Array.isArray(fields["Payment Proof"]) ? fields["Payment Proof"].map((item) => ({ url: item.url || "", filename: item.filename || "" })) : [],
    pickupDate: fields["Pickup Date"] || "",
    deliveryType: fields["Delivery Type"] || "",
    orderStatus: fields["Order Status"] || "",
    missingInfo: fields["Missing Info"] || "",
    notes: fields.Notes || ""
  };
}

async function listAdminOrders(context) {
  const { env } = context;
  if (!hasAirtableConfig(env)) return adminOrdersJson({ error: "server_not_configured", message: "إعدادات Airtable غير مكتملة." }, { status: 500 });

  const records = [];
  let offset = "";
  try {
    do {
      const url = new URL(airtableOrdersUrl(env));
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("sort[0][field]", "Order ID");
      url.searchParams.set("sort[0][direction]", "desc");
      if (offset) url.searchParams.set("offset", offset);
      const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
      const text = await response.text();
      if (!response.ok) {
        const error = safeAirtableError(text);
        console.error("Airtable admin orders read failed", { status: response.status, errorType: error.type, errorMessage: error.message });
        return adminOrdersJson({ error: "airtable_read_failed", message: "تعذر تحميل الأوردرات من Airtable." }, { status: 502 });
      }
      const data = text ? JSON.parse(text) : {};
      records.push(...(data.records || []).map(serializeOrderRecord));
      offset = data.offset || "";
    } while (offset);
    return adminOrdersJson({ orders: records });
  } catch (error) {
    console.error("Unexpected admin orders read failure", { message: error.message });
    return adminOrdersJson({ error: "orders_read_failed", message: "تعذر تحميل الأوردرات حاليًا." }, { status: 500 });
  }
}

function validateAdminOrderPatch(payload = {}) {
  const fields = {};
  const errors = [];
  for (const [key, airtableField] of Object.entries(editableOrderFields)) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    const value = cleanOrderString(payload[key]);
    if (key === "paymentStatus" && !allowedPaymentStatuses.has(value)) errors.push(key);
    else if (key === "orderStatus" && !allowedOrderStatuses.has(value)) errors.push(key);
    else if (key === "pickupDate" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(key);
    else if (key === "notes" && value.length > 10000) errors.push(key);
    else fields[airtableField] = value || null;
  }
  return { fields, errors };
}

async function updateAdminOrder(context, recordId) {
  const { request, env } = context;
  if (!hasAirtableConfig(env)) return adminOrdersJson({ error: "server_not_configured", message: "إعدادات Airtable غير مكتملة." }, { status: 500 });
  if (!/^rec[a-zA-Z0-9]+$/.test(recordId)) return adminOrdersJson({ error: "invalid_record_id", message: "رقم الأوردر غير صالح." }, { status: 400 });

  let payload;
  try { payload = await request.json(); } catch { return adminOrdersJson({ error: "invalid_json", message: "بيانات التحديث غير صحيحة." }, { status: 400 }); }
  const { fields, errors } = validateAdminOrderPatch(payload);
  if (errors.length || !Object.keys(fields).length) return adminOrdersJson({ error: "invalid_fields", fields: errors, message: "قيم التحديث غير صالحة." }, { status: 400 });

  try {
    const response = await fetch(airtableOrdersUrl(env, recordId), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields, typecast: false })
    });
    const text = await response.text();
    if (!response.ok) {
      const error = safeAirtableError(text);
      console.error("Airtable admin order update failed", { recordId, status: response.status, errorType: error.type, errorMessage: error.message });
      return adminOrdersJson({ error: "airtable_update_failed", message: "تعذر حفظ تعديلات الأوردر." }, { status: 502 });
    }
    return adminOrdersJson({ order: serializeOrderRecord(text ? JSON.parse(text) : {}) });
  } catch (error) {
    console.error("Unexpected admin order update failure", { recordId, message: error.message });
    return adminOrdersJson({ error: "order_update_failed", message: "تعذر حفظ التعديلات حاليًا." }, { status: 500 });
  }
}

async function adminOrdersResponse(context, pathname) {
  if (pathname === "/admin/api/orders") {
    if (context.request.method !== "GET") return adminOrdersJson({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET" } });
    return listAdminOrders(context);
  }
  const match = pathname.match(/^\/admin\/api\/orders\/(rec[a-zA-Z0-9]+)$/);
  if (!match) return adminOrdersJson({ error: "not_found" }, { status: 404 });
  if (context.request.method !== "PATCH") return adminOrdersJson({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "PATCH" } });
  return updateAdminOrder(context, match[1]);
}

async function createOrderResponse(context) {
  const { request, env } = context;
  const requestId = request.headers.get("X-Request-Id") || "";

  if (request.method === "OPTIONS") {
    if (!orderCorsAllowed(request)) return new Response(null, { status: 403, headers: orderCorsHeaders(request) });
    return new Response(null, { status: 204, headers: orderCorsHeaders(request) });
  }

  if (request.method !== "POST") {
    return orderJsonResponse(request, { error: "method_not_allowed", message: "Method not allowed" }, { status: 405 });
  }

  if (!orderCorsAllowed(request)) {
    console.warn("Blocked /api/orders CORS origin", {
      requestId,
      origin: request.headers.get("Origin") || ""
    });
    return orderJsonResponse(request, { error: "forbidden", message: "Forbidden origin" }, { status: 403 });
  }

  if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_NAME) {
    console.error("Airtable order configuration is missing", {
      requestId,
      hasToken: Boolean(env.AIRTABLE_TOKEN),
      hasBaseId: Boolean(env.AIRTABLE_BASE_ID),
      hasTableName: Boolean(env.AIRTABLE_TABLE_NAME)
    });
    return orderJsonResponse(
      request,
      {
        error: "server_not_configured",
        message: "\u062a\u0639\u0630\u0631 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0637\u0644\u0628 \u062d\u0627\u0644\u064a\u0627. \u0645\u0646 \u0641\u0636\u0644\u0643 \u062d\u0627\u0648\u0644 \u0644\u0627\u062d\u0642\u0627."
      },
      { status: 500 }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    console.warn("Invalid /api/orders JSON", { requestId, message: error.message });
    return orderJsonResponse(
      request,
      { error: "invalid_json", message: "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0637\u0644\u0628 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629." },
      { status: 400 }
    );
  }

  const order = normalizeOrderPayload(payload);
  const missing = validateOrderPayload(order);
  if (missing.length) {
    console.warn("Invalid /api/orders payload", { requestId, missing });
    return orderJsonResponse(
      request,
      {
        error: "missing_required_fields",
        fields: missing,
        message: "\u0627\u0643\u062a\u0628 \u0627\u0644\u0627\u0633\u0645 \u0648\u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0628\u0627\u064a\u0644 \u0648\u062a\u0623\u0643\u062f \u0623\u0646 \u0627\u0644\u0633\u0644\u0629 \u0628\u0647\u0627 \u0645\u0646\u062a\u062c\u0627\u062a."
      },
      { status: 400 }
    );
  }

  const tableName = encodeURIComponent(String(env.AIRTABLE_TABLE_NAME).trim());
  const airtableUrl = `https://api.airtable.com/v0/${encodeURIComponent(String(env.AIRTABLE_BASE_ID).trim())}/${tableName}`;

  try {
    const airtableResponse = await fetch(airtableUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: [
          {
            fields: airtableOrderFields(order)
          }
        ]
      })
    });
    const responseText = await airtableResponse.text();
    let airtableData = {};
    try {
      airtableData = responseText ? JSON.parse(responseText) : {};
    } catch {
      airtableData = {};
    }

    if (!airtableResponse.ok) {
      const airtableError = safeAirtableError(responseText);
      console.error("Airtable order creation failed", {
        requestId,
        status: airtableResponse.status,
        errorType: airtableError.type,
        errorMessage: airtableError.message
      });
      return orderJsonResponse(
        request,
        {
          error: "airtable_create_failed",
          message: "\u062a\u0639\u0630\u0631 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0637\u0644\u0628. \u0645\u0646 \u0641\u0636\u0644\u0643 \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."
        },
        { status: 502 }
      );
    }

    const recordId = airtableData.records?.[0]?.id || "";
    console.log("Airtable order created", { requestId, recordId });
    return orderJsonResponse(request, { ok: true, requestId, recordId });
  } catch (error) {
    console.error("Unexpected /api/orders failure", { requestId, message: error.message });
    return orderJsonResponse(
      request,
      {
        error: "order_create_failed",
        message: "\u062a\u0639\u0630\u0631 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0637\u0644\u0628. \u0645\u0646 \u0641\u0636\u0644\u0643 \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."
      },
      { status: 500 }
    );
  }
}

const analyticsEventNames = new Set([
  "page_view", "view_category", "view_product", "search", "add_to_cart", "remove_from_cart",
  "view_cart", "begin_checkout", "select_delivery", "select_payment_method", "place_order",
  "order_success", "order_failed", "open_whatsapp", "click_phone", "click_facebook", "click_instagram",
  "javascript_error", "api_error", "checkout_error", "worker_error"
]);

function analyticsJson(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=UTF-8");
  headers.set("Cache-Control", init.private ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function analyticsText(value, max = 160) {
  return String(value == null ? "" : value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?:\+?20)?01\d{9}/g, "[phone]")
    .replace(/\b\d{12,19}\b/g, "[number]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}

function analyticsPage(value) {
  try { return new URL(String(value || "/"), canonicalOrigin).pathname.slice(0, 180); }
  catch { return "/"; }
}

function analyticsIdentifier(value, max = 100) {
  return String(value == null ? "" : value).trim().replace(/[^A-Za-z0-9._:-]/g, "").slice(0, max);
}

function cairoDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function analyticsVisitorHash(visitorId, env) {
  const raw = `${analyticsText(visitorId, 100)}:${String(env.ANALYTICS_HASH_SALT || "pope-kyrillos-analytics")}`;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function storeAnalyticsEvent(env, payload = {}, overrides = {}) {
  if (!env.ANALYTICS_DB) return false;
  const eventName = analyticsEventNames.has(overrides.event || payload.event) ? (overrides.event || payload.event) : "";
  if (!eventName) return false;
  const occurredAt = new Date().toISOString();
  const visitorHash = overrides.visitorHash || await analyticsVisitorHash(payload.visitorId || crypto.randomUUID(), env);
  const price = payload.price == null || payload.price === "" ? null : (Number.isFinite(Number(payload.price)) ? Number(payload.price) : null);
  const quantity = payload.quantity == null || payload.quantity === "" ? null : (Number.isFinite(Number(payload.quantity)) ? Math.max(0, Math.min(10000, Math.round(Number(payload.quantity)))) : null);
  const statusCode = payload.statusCode == null || payload.statusCode === "" ? null : (Number.isFinite(Number(payload.statusCode)) ? Math.round(Number(payload.statusCode)) : null);
  const source = ["Google", "Facebook", "WhatsApp", "Direct", "Instagram", "Other"].includes(payload.source) ? payload.source : analyticsText(payload.source || "Direct", 40);
  const eventErrorType = eventName === "javascript_error" ? "javascript"
    : eventName === "api_error" ? "api"
      : eventName === "checkout_error" || eventName === "order_failed" ? "checkout"
        : eventName === "worker_error" ? "worker" : "";
  await env.ANALYTICS_DB.prepare(`
    INSERT INTO analytics_events (
      occurred_at, day, event_name, event_id, visitor_hash, page, product_id, product_name, category,
      price, quantity, currency, source, search_term, device, browser, error_type, error_message, status_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    occurredAt, cairoDay(), eventName, analyticsIdentifier(payload.eventId, 100), visitorHash, analyticsPage(payload.page),
    analyticsIdentifier(payload.productId, 100), analyticsText(payload.productName, 160), analyticsText(payload.category, 100),
    price, quantity, /^[A-Z]{3}$/.test(String(payload.currency || "EGP")) ? String(payload.currency || "EGP") : "EGP",
    source || "Direct", eventName === "search" ? analyticsText(payload.searchTerm, 80) : "", analyticsText(payload.device, 30),
    analyticsText(payload.browser, 30), analyticsText(overrides.errorType || eventErrorType || payload.errorType, 40),
    analyticsText(overrides.errorMessage || payload.errorMessage, 500), statusCode
  ).run();
  return true;
}

async function analyticsIngestResponse(request, env) {
  if (request.method !== "POST") return analyticsJson({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
  if (!env.ANALYTICS_DB) return analyticsJson({ error: "analytics_not_configured" }, { status: 503 });
  const origin = request.headers.get("Origin");
  if (origin && origin !== canonicalOrigin) return analyticsJson({ error: "origin_not_allowed" }, { status: 403 });
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return analyticsJson({ error: "origin_not_allowed" }, { status: 403 });
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 12000) return analyticsJson({ error: "payload_too_large" }, { status: 413 });
  let payload;
  try { payload = await request.json(); }
  catch { return analyticsJson({ error: "invalid_json" }, { status: 400 }); }
  if (!analyticsEventNames.has(payload?.event) || payload.event === "worker_error") return analyticsJson({ error: "invalid_event" }, { status: 400 });
  try {
    await storeAnalyticsEvent(env, payload);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Analytics ingest failed", { message: analyticsText(error.message, 200) });
    return analyticsJson({ error: "analytics_store_failed" }, { status: 500 });
  }
}

function analyticsRows(result = { results: [] }) {
  return (result.results || []).map((row) => ({ label: String(row.label || "غير محدد"), value: Number(row.value || 0) }));
}

async function analyticsDashboardResponse(request, env) {
  if (request.method !== "GET") return analyticsJson({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET" } });
  if (!env.ANALYTICS_DB) return analyticsJson({ error: "analytics_not_configured", message: "قاعدة Analytics غير مربوطة بعد." }, { status: 503 });
  const url = new URL(request.url);
  const days = [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 7;
  const today = cairoDay();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startDay = cairoDay(start);
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekDay = cairoDay(weekStart);

  const metricStatements = [
    env.ANALYTICS_DB.prepare("SELECT COUNT(DISTINCT visitor_hash) value FROM analytics_events WHERE event_name = 'page_view' AND day = ?").bind(today),
    env.ANALYTICS_DB.prepare("SELECT COUNT(DISTINCT visitor_hash) value FROM analytics_events WHERE event_name = 'page_view' AND day >= ?").bind(weekDay),
    env.ANALYTICS_DB.prepare("SELECT COUNT(DISTINCT CASE WHEN event_id <> '' THEN event_id ELSE CAST(id AS TEXT) END) value FROM analytics_events WHERE event_name = 'place_order' AND day >= ?").bind(startDay),
    env.ANALYTICS_DB.prepare("SELECT COALESCE(SUM(COALESCE(quantity, 1)), 0) value FROM analytics_events WHERE event_name = 'add_to_cart' AND day >= ?").bind(startDay),
    env.ANALYTICS_DB.prepare("SELECT COUNT(*) value FROM analytics_events WHERE event_name = 'begin_checkout' AND day >= ?").bind(startDay),
    env.ANALYTICS_DB.prepare("SELECT COUNT(DISTINCT CASE WHEN event_id <> '' THEN event_id ELSE CAST(id AS TEXT) END) value FROM analytics_events WHERE event_name = 'order_success' AND day >= ?").bind(startDay)
  ];
  const metricResults = await env.ANALYTICS_DB.batch(metricStatements);
  const values = metricResults.map((result) => Number(result.results?.[0]?.value || 0));
  const metrics = {
    visitorsToday: values[0], visitorsWeek: values[1], orders: values[2], addToCart: values[3],
    beginCheckout: values[4], successfulOrders: values[5], conversionRate: values[1] ? values[5] / values[1] : 0
  };

  const listQueries = {
    viewedProducts: ["SELECT COALESCE(NULLIF(product_name, ''), product_id) label, COUNT(*) value FROM analytics_events WHERE event_name = 'view_product' AND day >= ? AND (product_name <> '' OR product_id <> '') GROUP BY label ORDER BY value DESC LIMIT 10", startDay],
    cartProducts: ["SELECT COALESCE(NULLIF(product_name, ''), product_id) label, SUM(COALESCE(quantity, 1)) value FROM analytics_events WHERE event_name = 'add_to_cart' AND day >= ? AND (product_name <> '' OR product_id <> '') GROUP BY label ORDER BY value DESC LIMIT 10", startDay],
    soldProducts: ["SELECT COALESCE(NULLIF(product_name, ''), product_id) label, SUM(COALESCE(quantity, 1)) value FROM analytics_events WHERE event_name = 'order_success' AND day >= ? AND (product_name <> '' OR product_id <> '') GROUP BY label ORDER BY value DESC LIMIT 10", startDay],
    searchTerms: ["SELECT search_term label, COUNT(*) value FROM analytics_events WHERE event_name = 'search' AND day >= ? AND search_term <> '' GROUP BY search_term ORDER BY value DESC LIMIT 10", startDay],
    pages: ["SELECT page label, COUNT(*) value FROM analytics_events WHERE event_name = 'page_view' AND day >= ? GROUP BY page ORDER BY value DESC LIMIT 10", startDay],
    devices: ["SELECT COALESCE(NULLIF(device, ''), 'Other') label, COUNT(*) value FROM analytics_events WHERE event_name = 'page_view' AND day >= ? GROUP BY label ORDER BY value DESC", startDay],
    browsers: ["SELECT COALESCE(NULLIF(browser, ''), 'Other') label, COUNT(*) value FROM analytics_events WHERE event_name = 'page_view' AND day >= ? GROUP BY label ORDER BY value DESC", startDay],
    sources: ["SELECT COALESCE(NULLIF(source, ''), 'Direct') label, COUNT(*) value FROM analytics_events WHERE event_name = 'page_view' AND day >= ? GROUP BY label ORDER BY value DESC", startDay]
  };
  const listKeys = Object.keys(listQueries);
  const listResults = await env.ANALYTICS_DB.batch(listKeys.map((key) => env.ANALYTICS_DB.prepare(listQueries[key][0]).bind(listQueries[key][1])));
  const lists = Object.fromEntries(listKeys.map((key, index) => [key, analyticsRows(listResults[index])]));

  const errorTypes = ["javascript", "api", "checkout", "worker"];
  const errorResults = await env.ANALYTICS_DB.batch(errorTypes.map((type) => env.ANALYTICS_DB.prepare(`
    SELECT occurred_at occurredAt, page, error_message message, status_code statusCode
    FROM analytics_events WHERE error_type = ? ORDER BY occurred_at DESC LIMIT 12
  `).bind(type)));
  const errors = Object.fromEntries(errorTypes.map((type, index) => [type, errorResults[index].results || []]));
  return analyticsJson({ metrics, lists, errors, rangeDays: days });
}

async function recordWorkerError(env, request, error) {
  try {
    await storeAnalyticsEvent(env, { page: new URL(request.url).pathname }, { event: "worker_error", errorType: "worker", errorMessage: error?.message || "Worker error" });
  } catch (analyticsError) {
    console.error("Worker analytics logging failed", { message: analyticsText(analyticsError.message, 200) });
  }
}

async function handleRequest(request, env, ctx) {
    const url = new URL(request.url);
    const context = requestContext(request, env, ctx);

    const forwardedProto = request.headers.get("X-Forwarded-Proto") || "";
    const isHttps = url.protocol === "https:" || forwardedProto === "https";
    const allowAnalyticsLocalTest = env.LOCAL_DEV === "1" || ["127.0.0.1", "localhost"].includes(url.hostname);
    if (!allowAnalyticsLocalTest && (!isHttps || url.hostname !== canonicalHostname)) {
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

      if (url.pathname === "/admin/orders" || url.pathname === "/admin/orders/") {
        return env.ASSETS.fetch(rewriteGetRequest(request, "/admin/orders/index.html"));
      }

      if (url.pathname === "/admin/analytics" || url.pathname === "/admin/analytics/") {
        return env.ASSETS.fetch(rewriteGetRequest(request, "/admin/analytics/index.html"));
      }

      if (url.pathname === "/admin/api/update-products") {
        const response = await updateProducts(context);
        if (response.ok) { productsCache = null; productsCacheTime = 0; productsCacheSha = ""; }
        return response;
      }
      if (url.pathname === "/admin/api/update-taxonomy") return updateTaxonomy(context);
      if (url.pathname === "/admin/api/upload-product-image") return uploadProductImage(context);
      if (url.pathname === "/admin/api/orders" || url.pathname.startsWith("/admin/api/orders/")) return adminOrdersResponse(context, url.pathname);
      if (url.pathname === "/admin/api/analytics") return analyticsDashboardResponse(request, env);
    }

    if (url.pathname === "/api/catalog") return catalogApiResponse(request, env, ctx);
    if (url.pathname.startsWith("/api/products/")) {
      const products = await loadProducts(env, request, { maxAgeMs: 600000 });
      const product = withProductColoringConfig(productByIdOrSlug(products, url.pathname.slice("/api/products/".length)));
      return product ? productApiResponse(request, env, product) : new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/api/meta-catalog-feed.xml") return catalogFeedResponse(request, env, { includePrice: true });
    if (url.pathname === "/api/product-feed-no-price.xml") return catalogFeedResponse(request, env, { includePrice: false });
    if (url.pathname === "/api/create-paymob-intention") return createPaymobIntention(context);
    if (url.pathname === "/api/create-bosta-delivery") return createBostaDelivery(context);
    if (url.pathname === "/api/paymob-webhook") return paymobWebhook(context);
    if (url.pathname === "/api/orders") return createOrderResponse(context);
    if (url.pathname === "/api/best-sellers") {
      const products = await loadProducts(env, request, { maxAgeMs: 60000 });
      return bestSellersResponse(context, products);
    }
    if (url.pathname === "/api/analytics/events") return analyticsIngestResponse(request, env);
    if (url.pathname === "/products.json") return productsJsonResponse(request, env);
    if (url.pathname === "/category-taxonomy.js") return taxonomyJsResponse(request, env);

    if (legacyProductUrl(url) || url.pathname.startsWith("/products/")) {
      const products = await loadProducts(env, request);
      const product = withProductColoringConfig(productFromUrl(products, url));
      if (legacyProductUrl(url) && product) return redirectToProduct(product, url);
      if (url.pathname.startsWith("/products/")) {
        if (!product) return notFoundResponse();
        return productPageResponse(request, env, product);
      }
    }

    if (staticRewrites[url.pathname]) {
      const isPrivate = ["/cart", "/checkout", "/payment", "/payment-success", "/payment-failed", "/payment-pending"].includes(url.pathname);
      return htmlResponse(request, env, staticRewrites[url.pathname], isPrivate ? { private: true } : { canonicalUrl: `${canonicalOrigin}${url.pathname}` });
    }

    if (htmlRoutePaths.has(url.pathname) || url.pathname.startsWith("/category/")) {
      return htmlResponse(request, env, "/index.html", { canonicalUrl: `${canonicalOrigin}${url.pathname === "/" ? "/" : url.pathname}` });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status === 404 && isProductUploadAsset(url.pathname)) {
      const githubAsset = await githubAssetFallbackResponse(url.pathname, env);
      if (githubAsset) return githubAsset;
    }
    return withAssetCacheHeaders(assetResponse, url.pathname);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      ctx.waitUntil(recordWorkerError(env, request, error));
      throw error;
    }
  }
};
