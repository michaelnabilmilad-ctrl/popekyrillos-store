const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const worker = fs.readFileSync("cloudflare-worker.js", "utf8");

test("initial category HTML contains skeletons and no stale category cards", () => {
  const section = html.slice(html.indexOf('<section class="section categories"'), html.indexOf('<section class="section catalog"'));
  assert.match(section, /aria-busy="true"/);
  assert.match(section, /category-skeleton/);
  for (const staleName of ["مستلزمات المذبح", "شمع وبخور وأباركة", "تواني وأقمشة", "صلبان وهدايا", "كتب وطقوس"]) {
    assert.doesNotMatch(section, new RegExp(staleName));
  }
  assert.doesNotMatch(section, /category-tile/);
});

test("category UI retries the canonical taxonomy before showing a recoverable error", () => {
  assert.match(script, /let taxonomyReady = false/);
  assert.match(script, /function loadStorefrontTaxonomy/);
  assert.match(script, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(script, /data-taxonomy-retry/);
  assert.match(script, /return taxonomyReady \? taxonomyCategories : \[\]/);
  assert.doesNotMatch(script, /taxonomy\?\.defaultCategories \|\|/);
  assert.doesNotMatch(script, /legacyMainCategoryArt/);
});

test("taxonomy responses revalidate but retain a known-good stale response on transient failure", () => {
  assert.match(worker, /"Cache-Control": "no-cache, must-revalidate"/);
  assert.match(worker, /stale-if-error=86400/);
  assert.match(worker, /if \(!response\.ok\) return taxonomyCache/);
  assert.match(worker, /if \(taxonomyRefreshPromise\) return taxonomyRefreshPromise/);
  assert.match(worker, /status: source \? 200 : 503/);
});

test("existing sessions compare a fresh authoritative version and invalidate taxonomy only", () => {
  assert.match(script, /category-taxonomy-version\.json/);
  assert.match(script, /cache: "no-store"/);
  assert.match(script, /pope-kyrillos-taxonomy-authoritative-version/);
  assert.match(script, /url\.searchParams\.set\("taxonomy", version\)/);
  assert.match(script, /generation !== taxonomyRefreshGeneration/);
  assert.match(script, /POPE_KYRILLOS_TAXONOMY_DIAGNOSTICS/);
  assert.match(script, /dataset\.taxonomyAuthoritativeVersion/);
  assert.doesNotMatch(script, /localStorage\.clear\(/);
  assert.doesNotMatch(script, /sessionStorage\.clear\(/);
  assert.match(worker, /taxonomyVersionResponse/);
  assert.match(worker, /crypto\.subtle\.digest\("SHA-256"/);
});

test("a missing category image degrades to an empty or inline fallback without failing taxonomy", () => {
  assert.match(script, /function mainCategoryFallbackArt/);
  assert.match(script, /return choice\?\.image \|\| ""/);
  assert.match(script, /probe\.onload = \(\) =>/);
  assert.doesNotMatch(script, /throw new Error\([^\n]*category image/i);
});

test("only zero-count subcategories are hidden using complete-catalog counts", () => {
  assert.match(script, /visibleSubcategoryLabelsForCategory/);
  assert.match(script, /subcategoryProductCount\(subcategory\.id\) > 0/);
  assert.match(script, /if \(!catalogSubcategoryCountsLoaded\)/);
  assert.match(worker, /const subcategoryCountParams = new URLSearchParams\(\)/);
  assert.match(worker, /categoryCounts, subcategoryCounts/);
});

