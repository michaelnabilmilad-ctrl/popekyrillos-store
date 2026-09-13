const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function taxonomy() {
  const storage = new Map();
  const context = {
    window: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("category-taxonomy.js", "utf8"), context);
  return context.window.POPE_KYRILLOS_TAXONOMY;
}

test("Greek Collection is a top-level category with the requested children", () => {
  const greek = taxonomy().categoryById.get("greek-collection");
  assert.equal(greek.name, "المجموعة اليونانية");
  assert.deepEqual(Array.from(greek.subcategories, (item) => item.id), [
    "greek-vessels",
    "greek-wedding-crowns",
    "greek-clergy-crosses"
  ]);
});

test("storefront and catalog API use collections without changing primary taxonomy", () => {
  const storefront = fs.readFileSync("script.js", "utf8");
  const worker = fs.readFileSync("cloudflare-worker.js", "utf8");
  assert.match(storefront, /productCategoryMemberships\(product\)/);
  assert.match(storefront, /productCollectionIds\(product\)\.includes\(subcategory\)/);
  assert.match(worker, /category === "greek-collection" && collectionIds\.length/);
  assert.match(worker, /counts\["greek-collection"\]\[collectionId\]/);
});

test("Admin saves Greek assignment in collections and keeps primary category controls", () => {
  const html = fs.readFileSync("admin.html", "utf8");
  const admin = fs.readFileSync("admin.js", "utf8");
  assert.match(html, /data-field="mainCategory"/);
  assert.match(html, /data-field="subCategory"/);
  assert.match(html, /data-field="isGreekCollection"/);
  assert.match(html, /data-field="greekCollection"/);
  assert.match(admin, /product\.collections = unique/);
  assert.match(admin, /primaryTaxonomyCategoriesForAdmin\(\)/);
  assert.doesNotMatch(
    admin.match(/function fillMainCategoryFilter\(\) \{[\s\S]*?\n  \}/)?.[0] || "",
    /taxonomyCategoriesForAdmin\(\)\.map/
  );
});

test("Admin exposes a dedicated counted Greek collection filter", () => {
  const html = fs.readFileSync("admin.html", "utf8");
  const admin = fs.readFileSync("admin.js", "utf8");
  assert.match(html, /data-collection-filter/);
  assert.match(html, /كل المجموعات/);
  for (const id of ["greek-collection", "greek-vessels", "greek-wedding-crowns", "greek-clergy-crosses"]) {
    assert.match(html, new RegExp(`value="${id}"`));
  }
  assert.match(admin, /function fillCollectionFilter\(\)/);
  assert.match(admin, /state\.collectionFilter === "greek-collection" \? Boolean\(collectionId\)/);
  assert.match(admin, /collectionId === state\.collectionFilter/);
});

test("one product keeps its identity and primary taxonomy when assigned to Greek vessels", () => {
  const product = {
    id: "shared-product-id",
    sku: "SHARED-SKU",
    stock: "متاح",
    price: 1250,
    mainCategory: "altar-vessels",
    subcategory: "censers",
    subCategory: "censers",
    collections: []
  };
  const before = { id: product.id, sku: product.sku, stock: product.stock, price: product.price, mainCategory: product.mainCategory, subcategory: product.subcategory };
  product.collections = ["greek-vessels"];
  assert.deepEqual(
    { id: product.id, sku: product.sku, stock: product.stock, price: product.price, mainCategory: product.mainCategory, subcategory: product.subcategory },
    before
  );
  assert.ok(product.collections.includes("greek-vessels"));
});
