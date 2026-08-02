const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const productPage = fs.readFileSync("product-page.js", "utf8");
const worker = fs.readFileSync("cloudflare-worker.js", "utf8");
const checkout = fs.readFileSync("checkout-flow.js", "utf8");

test("standalone product add button cannot submit, navigate, or bubble", () => {
  assert.match(productPage, /<button class="button primary" type="button" data-add/);
  assert.match(productPage, /if\(event\.target\.closest\("\[data-add\]"\)\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*addToCart\(\);\s*return;/);
  const addFunction = productPage.match(/function addToCart\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(addFunction, /router\.push|navigate\(|window\.location|location\.href|redirect/);
  assert.doesNotMatch(productPage, /<(?:a|Link)[^>]*>\s*<button[^>]*data-add/);
});

test("the same complete selection merges while different coloring selections remain separate", () => {
  assert.match(productPage, /function selectionKey\(variantId, coloringDesign\)/);
  assert.match(productPage, /const lineId = selectionKey\(variantId, coloringDesign\)/);
  assert.match(productPage, /item\.lineId\|\|selectionKey\(item\.variantId, item\.coloringDesign\|\|null\)/);
  assert.match(checkout, /cartKey\(productId, variantId, item\.lineId \|\| ""\)/);
  assert.match(productPage, /تمت إضافة المنتج إلى السلة/);
});

test("product page cache key is bumped for the fixed behavior", () => {
  assert.match(worker, /product-page\.js\?v=13/);
});
