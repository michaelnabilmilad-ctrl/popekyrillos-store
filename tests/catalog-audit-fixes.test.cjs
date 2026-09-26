const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const storefront = fs.readFileSync("script.js", "utf8");
const worker = fs.readFileSync("cloudflare-worker.js", "utf8");
const taxonomy = fs.readFileSync("category-taxonomy.js", "utf8");
const seo = fs.readFileSync("scripts/generate-seo-assets.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

test("customer-facing processional cross name has one canonical source label", () => {
  assert.doesNotMatch(taxonomy, /صلبان مواكب/);
  assert.match(taxonomy, /صلبان الزفة/);
  assert.match(taxonomy, /item\?\.id === "processional-crosses"/);
});

test("homepage product count is dynamic", () => {
  assert.doesNotMatch(html, />\+120</);
  assert.match(html, /data-active-product-count/);
  assert.match(storefront, /function updateActiveProductCount/);
  assert.match(storefront, /function activeCatalogProductCount/);
  assert.match(storefront, /const categoryCount = fullCategoryProductCount\(category\.id\)/);
  assert.match(storefront, /const labelCount = fullSubcategoryProductCount\(category\.id, label\.id\)/);
});

test("catalog renders every visible product record without group-based or identity-based deduplication", () => {
  const catalogEndpoint = worker.slice(worker.indexOf("async function catalogApiResponse"), worker.indexOf("async function productApiResponse"));
  assert.doesNotMatch(worker, /function uniqueCatalogProducts|function catalogDuplicateKey/);
  assert.doesNotMatch(storefront, /function dedupeCatalogProducts|function duplicateCatalogKey/);
  assert.match(worker, /const navigationProducts = allProducts\.filter\(isCatalogProductVisible\)/);
  assert.match(worker, /sortCatalogProducts\(allProducts\.filter\(\(product\) => catalogProductMatches/);
  assert.match(storefront, /return products\.filter\(\(product\) => product\?\.active !== false/);
  assert.match(storefront, /staticCatalogProducts = Array\.isArray\(payload\)/);
  assert.doesNotMatch(catalogEndpoint, /groupId|groupSlug|product\?\.group|product\.group/);
});

test("category SEO noindexes empty routes and sitemap excludes inactive products", () => {
  assert.match(worker, /matched\.length \? "index, follow" : "noindex, follow"/);
  assert.match(worker, /categoryPageResponse/);
  assert.match(seo, /const activeProducts = enrichedProducts\.filter\(isActiveProduct\)/);
  assert.match(seo, /categories\.filter\(\(category\) => \(categoryCounts\[category\.id\] \|\| 0\) > 0\)/);
});

test("gallery alternatives describe the product and image position", () => {
  assert.match(storefront, /صورة \$\{index \+ 1\} من \$\{productDisplayName\}/);
  assert.doesNotMatch(storefront, /alt="Image"/);
});
