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
  assert.match(css, /\.is-category-route \.subcategory-card-grid\[hidden\][\s\S]*display:\s*grid\s*!important[\s\S]*visibility:\s*hidden/);
});

test("category routes reserve the async product grid with responsive skeleton cards", () => {
  assert.match(html, /data-products aria-busy="true"/);
  assert.equal((html.match(/class="product-card catalog-product-skeleton"/g) || []).length, 8);
  assert.match(css, /\.catalog-product-skeleton-media[\s\S]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /\.catalog-product-skeleton-body[\s\S]*min-height:\s*260px/);
  assert.match(css, /\.category-skeleton\s*\{[\s\S]*?min-height:\s*226px/);
  assert.match(css, /@media \(max-width:\s*680px\)[\s\S]*?\.category-skeleton\s*\{\s*min-height:\s*132px/);
  assert.match(storefront, /productGrid\.setAttribute\("aria-busy", "false"\)/);
  assert.match(storefront, /!catalogSubcategoryCountsLoaded && productGrid\.querySelector\("\.catalog-product-skeleton"\)/);
  assert.match(storefront, /category-count-placeholder/);
  assert.match(css, /@media \(min-width:\s*1121px\)[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\) auto/);
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
