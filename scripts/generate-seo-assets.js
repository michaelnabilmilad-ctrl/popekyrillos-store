const fs = require("fs");
const path = require("path");
const { canonicalProductPath, canonicalProductUrl, localized, productSlug } = require("./seo-data");

const root = path.resolve(__dirname, "..");
const productsPath = path.join(root, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
const canonicalOrigin = "https://popekyrillos.store";
const today = new Date().toISOString().slice(0, 10);

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
  fs.writeFileSync(productsPath, `${JSON.stringify(enrichedProducts, null, 2)}\n`, "utf8");
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

const categoryIds = [...new Set(enrichedProducts.map((product) => product.category).filter(Boolean))];
const staticUrls = [
  { loc: `${canonicalOrigin}/`, lastmod: today, priority: "1.0" },
  { loc: `${canonicalOrigin}/products`, lastmod: today, priority: "0.8" },
  { loc: `${canonicalOrigin}/contact`, lastmod: today, priority: "0.6" },
  { loc: `${canonicalOrigin}/policies`, lastmod: today, priority: "0.6" },
  { loc: `${canonicalOrigin}/shipping-policy`, lastmod: today, priority: "0.5" },
  { loc: `${canonicalOrigin}/privacy-policy`, lastmod: today, priority: "0.5" },
  { loc: `${canonicalOrigin}/refund-policy`, lastmod: today, priority: "0.5" }
];
const categoryUrls = categoryIds.map((category) => ({
  loc: `${canonicalOrigin}/category/${encodeURIComponent(category)}`,
  lastmod: today,
  priority: "0.7"
}));
const productUrls = enrichedProducts.map((product) => ({
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

console.log(`SEO assets generated for ${enrichedProducts.length} products.`);
