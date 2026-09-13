const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const admin = fs.readFileSync("admin.js", "utf8");
const endpoint = fs.readFileSync("functions/api/update-products.js", "utf8");

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

for (const scenario of ["search", "Greek Collection", "censers", "Quick Edit"]) {
  test(`${scenario} filtering cannot become the persisted source`, () => {
    assert.match(admin, /body: JSON\.stringify\(\{\s*products,/);
    assert.match(admin, /const products = normalizeProducts\(state\.products\);/);
  });
}
