const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const products = require("../products.json");

const yotaProducts = products
  .filter((product) => /^صليب يوتا مادلية موديل (?:[1-9]|1[0-3])$/.test(product.name))
  .sort((a, b) => Number(a.name.match(/(\d+)$/)[1]) - Number(b.name.match(/(\d+)$/)[1]));

test("Yota Models 1-13 have model-number canonical slugs and unique URLs", () => {
  assert.equal(yotaProducts.length, 13);
  yotaProducts.forEach((product, index) => {
    const model = index + 1;
    assert.equal(product.slug, `صليب-يوتا-مادليه-موديل-${model}`);
    assert.equal(decodeURIComponent(new URL(product.url).pathname), `/products/صليب-يوتا-مادليه-موديل-${model}`);
  });
  assert.equal(new Set(yotaProducts.map((product) => product.url)).size, 13);
});

test("the historical shared Model 7 path resolves to Model 7, never Model 13", async () => {
  const worker = await import(`${pathToFileURL(path.resolve("cloudflare-worker.js")).href}?yota-url=${Date.now()}`);
  const resolved = worker.productByIdOrSlug(yotaProducts, "صليب-يوتا-مادليه-موديل-7");
  assert.equal(resolved.name, "صليب يوتا مادلية موديل 7");
});
