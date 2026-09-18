const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const storefront = fs.readFileSync("script.js", "utf8");
const checkout = fs.readFileSync("checkout-flow.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("styles.css", "utf8");

test("the newest cart record wins even when it represents an empty cart", () => {
  for (const source of [storefront, checkout]) {
    assert.match(source, /exists:\s*true/);
    assert.match(source, /filter\(\(record\) => record\.exists \|\| record\.updatedAt > 0\)/);
    assert.doesNotMatch(source, /filter\(\(record\) => cartHasItems\(record\.cart\)\)\s*\.sort/);
    assert.match(source, /Math\.max\(Date\.now\(\), storedUpdatedAt \+ 1, cartWriteClock \+ 1\)/);
  }
});

test("a failed responsive thumbnail falls back once without retaining broken srcset candidates", () => {
  assert.match(storefront, /this\.onerror=null;this\.removeAttribute\('srcset'\);this\.removeAttribute\('sizes'\)/);
  assert.match(storefront, /hero-products-collage\.webp/);
});

test("category routes reserve the subcategory row before async catalog rendering", () => {
  assert.match(html, /is-category-route/);
  assert.match(css, /\.is-category-route \.subcategory-card-grid\s*\{\s*min-height:\s*300px/);
  assert.match(css, /\.is-category-route \.subcategory-card-grid\[hidden\][\s\S]*visibility:\s*hidden/);
});

test("checkout remote cart synchronization is moved off the critical render path", () => {
  assert.match(checkout, /function scheduleCheckoutCartSync\(\)/);
  assert.match(checkout, /requestIdleCallback\(run, \{ timeout: 4000 \}\)/);
  assert.match(checkout, /if \(!cartEntries\(\)\.length && !isCartPage\(\)\)[\s\S]*restoreSignedInCheckoutCart\(\)/);
  assert.match(checkout, /if \(!syncedBeforeRender\) scheduleCheckoutCartSync\(\)/);
});

test("mobile hero uses the deployed hero asset", () => {
  assert.doesNotMatch(css, /hero-papa-kyrillos-products-mobile\.webp/);
  assert.match(css, /hero-papa-kyrillos-products\.webp/);
});
