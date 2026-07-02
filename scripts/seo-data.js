const ARABIC_DIACRITICS = /[\u064b-\u065f\u0670]/g;
const SLUG_ALLOWED = /[^\p{L}\p{N}]+/gu;

function localized(value) {
  if (value && typeof value === "object") {
    return value.ar || value.en || Object.values(value).find(Boolean) || "";
  }
  return value || "";
}

function normalizeArabic(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

function baseSlug(value = "") {
  return normalizeArabic(value)
    .toLowerCase()
    .trim()
    .replace(SLUG_ALLOWED, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function productSlug(product, used = new Set()) {
  const nameSlug = baseSlug(localized(product?.name));
  const idSlug = baseSlug(product?.id || "");
  let candidate = product?.slug ? baseSlug(product.slug) : nameSlug;
  if (!candidate || candidate.length < 2) candidate = idSlug || String(product?.id || "product");

  const root = candidate.slice(0, 120).replace(/-+$/g, "") || idSlug || "product";
  candidate = root;
  let counter = 2;
  while (used.has(candidate)) {
    const suffix = idSlug ? `-${idSlug.slice(-18)}` : `-${counter}`;
    candidate = `${root.slice(0, Math.max(20, 150 - suffix.length))}${suffix}`;
    if (used.has(candidate)) candidate = `${root}-${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function canonicalProductPath(product) {
  return `/products/${encodeURIComponent(product.slug || productSlug(product))}`;
}

function canonicalProductUrl(product, origin = "https://popekyrillos.store") {
  return `${origin}${canonicalProductPath(product)}`;
}

module.exports = {
  baseSlug,
  canonicalProductPath,
  canonicalProductUrl,
  localized,
  productSlug
};
