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

test("storefront loads live taxonomy before its consumer instead of bundling a stale copy", () => {
  assert.match(script, /const taxonomyReady =/);
  assert.match(html, /<script[^>]+src="\/category-taxonomy\.js\?v=[^"]+"[^>]+defer/);
  assert.ok(html.indexOf("/category-taxonomy.js?v=") < html.indexOf("/script.min.js"));
  const preparation = fs.readFileSync("scripts/prepare-static-assets.js", "utf8");
  assert.match(preparation, /const storefrontSource = read\("script\.js"\)/);
  assert.doesNotMatch(preparation, /read\("category-taxonomy\.js"\).*read\("script\.js"\)/s);
});

test("taxonomy responses must revalidate instead of serving stale category data", () => {
  assert.match(worker, /"Cache-Control": "no-cache, must-revalidate"/);
  assert.match(worker, /status: source \? 200 : 503/);
  assert.match(worker, /githubFetchText\(env, "category-taxonomy\.js"\)/);
  assert.ok(worker.indexOf('githubFetchText(env, "category-taxonomy.js")') < worker.indexOf('env.ASSETS.fetch(rewriteRequest(request, "/category-taxonomy.js"))'));
});

test("catalog requests ignore aborts, retry only transient failures and retain successful data", () => {
  assert.match(script, /error\?\.name === "AbortError"/);
  assert.match(script, /status === 408 \|\| status === 429 \|\| status >= 500/);
  assert.match(script, /if \(reset && !products\.length\) products = fallbackProducts\.slice\(\)/);
  assert.match(script, /endpoint,[\s\S]*status:[\s\S]*exception:[\s\S]*route:/);
});
