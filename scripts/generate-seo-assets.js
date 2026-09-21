const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { canonicalProductPath, canonicalProductUrl, localized, productSlug } = require("./seo-data");

const root = path.resolve(__dirname, "..");
const productsPath = path.join(root, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
const canonicalOrigin = "https://popekyrillos.store";
const today = new Date().toISOString().slice(0, 10);

function hasAvailableVariant(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return product?.stock !== "غير متاح حاليا" && product?.available !== false;
  return variants.some((variant) => {
    const raw = variant?.quantity;
    const quantity = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    return quantity !== null && Number.isInteger(quantity) && quantity >= 0 ? quantity > 0 : variant?.available !== false;
  });
}

function isActiveProduct(product) {
  return product?.active !== false && product?.hidden !== true && product?.deleted !== true
    && product?.published !== false && hasAvailableVariant(product);
}

const taxonomySandbox = { window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.runInNewContext(fs.readFileSync(path.join(root, "category-taxonomy.js"), "utf8"), taxonomySandbox);
const categories = taxonomySandbox.window.POPE_KYRILLOS_TAXONOMY.defaultCategories;

const usedSlugs = new Set();
let changed = false;
const enrichedProducts = products.map((product) => {
  const slug = productSlug(product, usedSlugs);
  const url = canonicalProductUrl({ ...product, slug }, canonicalOrigin);
  if (product.slug === slug && product.url === url) return product;
  changed = true;
  return { ...product, slug, url };
});

if (changed) {
  const serialized = `${JSON.stringify(enrichedProducts, null, 2)}\n`;
  [productsPath, path.join(root, "firebase-functions", "products.json"), path.join(root, "dist", "products.json")]
    .filter((target) => fs.existsSync(path.dirname(target)))
    .forEach((target) => fs.writeFileSync(target, serialized, "utf8"));
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lastmod(product) {
  const parsed = Date.parse(product.updatedAt || product.createdAt || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : today;
}

const activeProducts = enrichedProducts.filter(isActiveProduct);
const categoryNameToId = new Map(categories.map((category) => [localized(category.name), category.id]));
const legacyCategoryIds = { brass: "altar-vessels", candles: "candles-lamps", vestments: "church-vestments", icons: "icons-frames", books: "books-rituals", gifts: "occasions-service" };
const namedCategoryIds = { "المذبح والأواني المقدسة": "altar-vessels", "مستلزمات المذبح والخدمة": "altar-vessels", "الشمع والبخور": "candles-lamps", "الشمع والقناديل": "candles-lamps", "الملابس والمفارش الكنسية": "church-vestments", "الملابس والأقمشة الكنسية": "church-vestments", "الصلبان": "crosses", "الأيقونات والبراويز": "icons-frames", "الكتب والطقوس": "books-rituals", "المناسبات والخدمة": "occasions-service", "تجهيزات الكنيسة": "church-equipment", "تجهيز الكنائس والطلبات الخاصة": "church-equipment" };
const mainCategoryId = (product) => categoryNameToId.get(localized(product.mainCategory)) || namedCategoryIds[localized(product.mainCategory)] || legacyCategoryIds[product.category] || product.mainCategory || "uncategorized";
const categoryCounts = activeProducts.reduce((counts, product) => {
  const id = mainCategoryId(product);
  counts[id] = (counts[id] || 0) + 1;
  (product.collections || []).filter((id) => String(id).startsWith("greek-")).forEach(() => { counts["greek-collection"] = (counts["greek-collection"] || 0) + 1; });
  return counts;
}, {});
const staticUrls = [
  { loc: `${canonicalOrigin}/`, lastmod: today, priority: "1.0" },
  { loc: `${canonicalOrigin}/products`, lastmod: today, priority: "0.8" },
  { loc: `${canonicalOrigin}/contact`, lastmod: today, priority: "0.6" },
  { loc: `${canonicalOrigin}/policies`, lastmod: today, priority: "0.6" },
  { loc: `${canonicalOrigin}/shipping-policy`, lastmod: today, priority: "0.5" },
  { loc: `${canonicalOrigin}/privacy-policy`, lastmod: today, priority: "0.5" },
  { loc: `${canonicalOrigin}/refund-policy`, lastmod: today, priority: "0.5" }
];
const categoryUrls = categories.filter((category) => (categoryCounts[category.id] || 0) > 0).flatMap((category) => {
  const urls = [{ loc: `${canonicalOrigin}/category/${encodeURIComponent(category.id)}`, lastmod: today, priority: "0.7" }];
  category.subcategories.forEach((subcategory) => {
    const hasProducts = activeProducts.some((product) => (mainCategoryId(product) === category.id && String(product.subcategory || product.subCategory || product.label || "") === subcategory.id) || (product.collections || []).includes(subcategory.id));
    if (hasProducts) urls.push({ loc: `${canonicalOrigin}/category/${encodeURIComponent(category.id)}/${encodeURIComponent(subcategory.id)}`, lastmod: today, priority: "0.6" });
  });
  return urls;
});
const productUrls = activeProducts.map((product) => ({
  loc: canonicalProductUrl(product, canonicalOrigin),
  lastmod: lastmod(product),
  priority: "0.8"
}));
const seen = new Set();
const urls = [...staticUrls, ...categoryUrls, ...productUrls].filter(({ loc }) => {
  if (seen.has(loc)) return false;
  seen.add(loc);
  return true;
});

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
  .map(
    ({ loc, lastmod: mod, priority }) =>
      `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${xmlEscape(mod)}</lastmod>\n    <priority>${priority}</priority>\n  </url>`
  )
  .join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(root, "sitemap.xml"), sitemap, "utf8");

const robots = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /payment\nDisallow: /payment-success\nDisallow: /payment-failed\nDisallow: /payment-pending\nDisallow: /api/\nDisallow: /admin/api/\n\nSitemap: ${canonicalOrigin}/sitemap.xml\n`;
fs.writeFileSync(path.join(root, "robots.txt"), robots, "utf8");

console.log(`SEO assets generated for ${activeProducts.length} active products.`);
