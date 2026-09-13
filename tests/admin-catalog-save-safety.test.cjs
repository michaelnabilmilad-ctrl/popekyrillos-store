const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const admin = fs.readFileSync("admin.js", "utf8");
const endpoint = fs.readFileSync("functions/api/update-products.js", "utf8");
const mergeSource = endpoint.slice(
  endpoint.indexOf("function mergeCatalog"),
  endpoint.indexOf("export async function onRequest")
);
const mergeCatalog = vm.runInNewContext(`${mergeSource}; mergeCatalog`);
const fullCatalog = Array.from({ length: 110 }, (_, index) => ({
  id: `product-${index + 1}`,
  name: index === 0 ? "يوناني" : `Product ${index + 1}`,
  mainCategory: index < 6 ? "altar-vessels" : "other",
  subCategory: index < 6 ? "censers" : "other",
  collections: index === 0 ? ["greek-vessels"] : []
}));

test("Admin filters are display-only and publishing uses the complete canonical state", () => {
  assert.match(admin, /function filteredProducts\(\)[\s\S]*?return state\.products\.filter/);
  assert.match(admin, /const products = normalizeProducts\(state\.products\);/);
  assert.doesNotMatch(admin, /const products = normalizeProducts\(filteredProducts\(\)\)/);
});

test("Quick Edit updates a stable product inside the complete state", () => {
  assert.match(admin, /state\.products\.find\(\(item\) => item\.id === state\.quickEditId\)/);
  assert.match(admin, /product\.collections = unique/);
});

test("publishing declares explicit deletes and clears them only after success", () => {
  assert.match(admin, /deletedProductIds: new Set\(\)/);
  assert.match(admin, /deletedProductIds: \[\.\.\.state\.deletedProductIds\]/);
  assert.match(admin, /state\.deletedProductIds\.add\(product\.id\)/);
});

test("save endpoint rejects omitted IDs and merges by stable product ID", () => {
  assert.match(endpoint, /Catalog safety check rejected the save/);
  assert.match(endpoint, /undeclaredMissing\.length/);
  assert.match(endpoint, /incomingById\.get\(String\(product\.id\)\) \|\| product/);
  assert.match(endpoint, /operation === "full-replacement"/);
  assert.match(endpoint, /confirm === "REPLACE_FULL_CATALOG"/);
});

test("search-filtered save keeps every product", () => {
  const edited = fullCatalog.map((product) => product.id === "product-1" ? { ...product, name: "يوناني معدل" } : product);
  assert.equal(mergeCatalog(fullCatalog, edited).length, 110);
});

test("Greek-only payload is rejected instead of deleting the normal catalog", () => {
  assert.throws(() => mergeCatalog(fullCatalog, fullCatalog.filter((product) => product.collections.length)), /safety check rejected/);
});

test("censer-only payload is rejected instead of deleting other categories", () => {
  assert.throws(() => mergeCatalog(fullCatalog, fullCatalog.filter((product) => product.subCategory === "censers")), /safety check rejected/);
});

test("Quick Edit of one stable ID leaves total count unchanged", () => {
  const edited = fullCatalog.map((product) => product.id === "product-1" ? { ...product, price: 123 } : product);
  const saved = mergeCatalog(fullCatalog, edited);
  assert.equal(saved.length, 110);
  assert.equal(saved.find((product) => product.id === "product-1").price, 123);
});
