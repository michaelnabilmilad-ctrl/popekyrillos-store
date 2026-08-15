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

test("category UI never renders default taxonomy when the canonical source is unavailable", () => {
  assert.match(script, /const taxonomyReady =/);
  assert.match(script, /تعذر تحميل الأقسام\. حاول تحديث الصفحة/);
  assert.match(script, /return taxonomyReady \? taxonomyCategories : \[\]/);
  assert.doesNotMatch(script, /taxonomy\?\.defaultCategories \|\|/);
  assert.doesNotMatch(script, /legacyMainCategoryArt/);
});

test("taxonomy responses must revalidate instead of serving stale category data", () => {
  assert.match(worker, /"Cache-Control": "no-cache, must-revalidate"/);
  assert.match(worker, /status: source \? 200 : 503/);
});

