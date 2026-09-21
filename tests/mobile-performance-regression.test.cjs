const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const source = fs.readFileSync("script.js", "utf8");

test("best-seller space is present before hydration so categories do not shift", () => {
  const section = html.match(/<section class="section popular-products"[\s\S]*?<\/section>/)?.[0] || "";
  assert.ok(section);
  assert.doesNotMatch(section, /\shidden(?:\s|>)/);
  assert.match(section, /aria-busy="true"/);
  assert.equal((section.match(/popular-product-skeleton/g) || []).length, 9);
  assert.match(source, /if \(!bestSellerProductsLoaded\)/);
});

test("mobile product cards declare their actual two-column rendered width", () => {
  assert.match(source, /sizes="\(max-width: 680px\) calc\(50vw - 19px\)/);
  assert.doesNotMatch(source, /sizes="\(max-width: 720px\) 92vw/);
});

test("homepage logos use responsive generated sources", () => {
  assert.match(html, /logo-papa-kyrillos-64\.webp/);
  assert.match(html, /logo-papa-kyrillos-128\.webp 128w/);
  assert.match(html, /logo-papa-kyrillos-320\.webp 320w/);
});
