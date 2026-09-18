const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const storefront = fs.readFileSync("script.js", "utf8");
const worker = fs.readFileSync("cloudflare-worker.js", "utf8");

test("quick view state never impersonates the durable product details route", () => {
  const setter = storefront.slice(storefront.indexOf("function quickViewUrl"), storefront.indexOf("function escapeHtml"));
  assert.match(setter, /searchParams\.set\("quickview"/);
  assert.doesNotMatch(setter.slice(setter.indexOf("function setProductUrl")), /productShareUrl\(productId\)/);
  assert.match(storefront, /openProductFromUrl\(\);/);
});

test("durable product URLs render a complete page shell at the edge", () => {
  assert.match(worker, /url\.pathname\.startsWith\("\/products\/"\)/);
  assert.match(worker, /return productPageResponse\(request, env, product\)/);
  const page = worker.slice(worker.indexOf("async function productPageResponse"), worker.indexOf("function notFoundResponse"));
  for (const required of ["<header", "<main", "id=\"product-detail\"", "<footer"]) assert.match(page, new RegExp(required));
});

test("non-hashed HTML, JavaScript and CSS are revalidated", () => {
  assert.match(worker, /no-cache, must-revalidate/);
  assert.doesNotMatch(worker, /else if \(\/\\\.\(\?:js\|css\|woff2\)\$\/i\.test\(pathname\)\)/);
});
