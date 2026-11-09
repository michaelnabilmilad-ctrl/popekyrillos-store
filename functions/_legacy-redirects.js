// Links from the store's earlier Shopify site that Google and old posts still
// open (Search Console "Not found (404)" list, 2026-11-09). Each one is sent
// to the page that now sells the same thing with a permanent redirect, or
// answered 410 Gone when it was a Shopify system file with no counterpart.
// Pure functions only: the Worker resolves product and category matches.

// Old Shopify product handles whose product was later split or renamed, so
// the slug matcher cannot find them. Keyed by the old handle, value is the
// current product id (ids never change; slugs can).
// The old "أنابيب رفات قديسين زان" sizes 3, 4 and 5 (37 cm, beech) are now one
// product each.
export const LEGACY_PRODUCT_IDS = {
  "أنبوبة-رفات-قديسين-زان-مقاس-3": "custom-1790455760862-copy-1790456039498-copy-1790456126917",
  "أنبوبة-رفات-قديسين-زان-مقاس-4": "custom-1790455760862-copy-1790456039498-copy-1790456126917-copy-1790456229381",
  "أنبوبة-رفات-قديسين-زان-مقاس-5": "custom-1790455760862-copy-1790456039498-copy-1790456126917-copy-1790456229381-copy-1790456405844"
};

// Category ids the site used before the taxonomy migration.
export const LEGACY_CATEGORY_IDS = {
  brass: "altar-vessels",
  candles: "candles-lamps",
  vestments: "church-vestments",
  icons: "icons-frames",
  books: "books-rituals",
  gifts: "occasions-service",
  atb3ho: "occasions-service"
};

// Shopify-only system paths: nothing on the new site replaces them.
const GONE = [
  /^\/cdn(?:\/|$)/,
  /^\/services\//,
  /^\/wpm(?:@|\/|$)/,
  /^\/(?:en\/)?cart\/(?:add|change|update|clear)(?:\.js)?$/,
  /^\/(?:en\/)?search\/suggest(?:\.json)?$/,
  /^\/en\/cart$/
];

// Cheap test so ordinary requests skip this module entirely.
const LEGACY_PREFIX = /^\/(?:en(?:\/|$)|collections(?:\/|$)|pages\/|policies\/|search(?:\/|$)|cdn(?:\/|$)|services\/|wpm|cart\/|category\/[^/]+\/?$|products\/)/;

export function mayBeLegacyPath(pathname) {
  return LEGACY_PREFIX.test(pathname);
}

function decode(segment = "") {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Returns what the Worker should do with a path, or null when the path is not
// an old link (the normal routes then handle it, including real 404s):
//   { redirect: "/path?query" }                  fixed destination
//   { gone: true }                               410
//   { productId }                                redirect to that product
//   { collection: "handle", productHandle }      match a category by name
//   { categoryId }                               redirect to that category
export function legacyRoute(pathname, search = "") {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (GONE.some((pattern) => pattern.test(path))) return { gone: true };

  if (path === "/en") return { redirect: "/" };
  if (/^\/(?:en\/)?policies\/[^/]+$/.test(path)) return { redirect: "/policies" };
  if (/^\/(?:en\/)?pages\/(?:contact|contact-us)$/.test(path)) return { redirect: "/contact" };
  // /pages/about-us has no matching page on the new site yet, so it keeps
  // its 404 rather than redirecting somewhere unrelated.

  if (/^\/(?:en\/)?search$/.test(path)) {
    const query = new URLSearchParams(search).get("q") || "";
    return { redirect: query ? `/products?q=${encodeURIComponent(query)}` : "/products" };
  }

  const collection = path.match(/^\/(?:en\/)?collections(?:\/([^/]+))?(?:\/products\/([^/]+))?$/);
  if (collection) {
    const handle = decode(collection[1] || "");
    const productHandle = decode(collection[2] || "");
    if (!handle || handle === "all" || handle === "frontpage") {
      return productHandle ? { collection: "", productHandle } : { redirect: "/products" };
    }
    return { collection: handle, productHandle };
  }

  const product = path.match(/^\/products\/([^/]+)$/);
  if (product) {
    const productId = LEGACY_PRODUCT_IDS[decode(product[1]).normalize("NFC")];
    return productId ? { productId } : null;
  }

  const category = path.match(/^\/category\/([^/]+)$/);
  if (category && LEGACY_CATEGORY_IDS[decode(category[1])]) return { categoryId: LEGACY_CATEGORY_IDS[decode(category[1])] };

  return null;
}

// Arabic letter variants written either way in old handles and current names.
export function normalizeArabicHandle(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Old Shopify collections seen in Search Console, checked by hand against the
// products they held. Value is the subcategory id that sells them today.
export const LEGACY_COLLECTIONS = {
  "جرابات كتاب مقدس": "book-accessories" // "جراب للكتاب المقدس" lives in فواصل وجرابات الكتب
};

// Finds where an old collection handle should go: the reviewed map first,
// then a category or subcategory whose name is exactly the handle ("علب-بخور"
// → علب بخور). Returns a site path, or "" when nothing matches for sure.
export function collectionPath(handle, taxonomyCategories = [], nameOf = (value) => value) {
  const wanted = normalizeArabicHandle(handle);
  if (!wanted) return "";
  const mappedSubcategory = LEGACY_COLLECTIONS[wanted] || "";
  for (const category of taxonomyCategories) {
    if (!category?.id || category.id === "uncategorized" || category.visible === false) continue;
    if (normalizeArabicHandle(nameOf(category.name)) === wanted) return `/category/${encodeURIComponent(category.id)}`;
    for (const sub of category.subcategories || []) {
      if (!sub?.id || sub.visible === false) continue;
      if (sub.id === mappedSubcategory || normalizeArabicHandle(nameOf(sub.name)) === wanted) {
        return `/category/${encodeURIComponent(category.id)}/${encodeURIComponent(sub.id)}`;
      }
    }
  }
  return "";
}
