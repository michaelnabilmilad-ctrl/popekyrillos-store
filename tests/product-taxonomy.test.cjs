const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadTaxonomy(storedTaxonomy = null) {
  const context = {
    window: {},
    localStorage: { getItem: () => storedTaxonomy ? JSON.stringify(storedTaxonomy) : null }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("category-taxonomy.js", "utf8"), context);
  return context.window.POPE_KYRILLOS_TAXONOMY;
}

test("exposes exactly the nine requested customer categories", () => {
  const taxonomy = loadTaxonomy();
  assert.deepEqual(
    Array.from(taxonomy.customerCategories(), (category) => category.id),
    ["altar-vessels", "censers-incense", "candles-lamps", "church-vestments", "crosses", "icons-frames", "books-rituals", "occasions-service", "church-equipment"]
  );
});

test("every product has valid single taxonomy fields and multi-value discovery fields", () => {
  const taxonomy = loadTaxonomy();
  const products = JSON.parse(fs.readFileSync("products.json", "utf8"));
  for (const product of products) {
    assert.ok(taxonomy.categoryById.has(product.mainCategory), `${product.id}: invalid mainCategory`);
    const subcategory = taxonomy.subcategoryById.get(product.subcategory);
    assert.ok(subcategory, `${product.id}: invalid subcategory`);
    assert.equal(subcategory.mainId, product.mainCategory, `${product.id}: subcategory belongs to another main category`);
    assert.equal(product.subCategory, product.subcategory, `${product.id}: admin and storefront taxonomy must match`);
    assert.ok(Array.isArray(product.collections), `${product.id}: collections must be an array`);
    assert.ok(Array.isArray(product.searchKeywords), `${product.id}: searchKeywords must be an array`);
  }
});

test("cross products are not classified under icons and frames", () => {
  const products = JSON.parse(fs.readFileSync("products.json", "utf8"));
  const misplaced = products.filter((product) => product.mainCategory === "icons-frames" && /صليب|صلبان/.test(product.name));
  assert.deepEqual(misplaced, []);
});

test("new plain cross subcategories are selectable, visible and migrate safely", () => {
  const taxonomy = loadTaxonomy();
  const expected = [
    ["iota-plain-hand-crosses", "صلبان يد يوتا سادة"],
    ["plain-cross-medals", "صلبان ميداليات سادة"]
  ];
  for (const [id, name] of expected) {
    assert.equal(taxonomy.subcategoryById.get(id)?.mainId, "crosses");
    assert.equal(taxonomy.subcategoryIdFromName(name), id);
  }

  const stored = JSON.parse(JSON.stringify(Array.from(taxonomy.defaultCategories)));
  const crosses = stored.find((category) => category.id === "crosses");
  crosses.subcategories = crosses.subcategories.filter((item) => !expected.some(([id]) => id === item.id));
  crosses.subcategories.push({ id: "custom-kept", name: "قسم محفوظ" });
  const migratedIds = Array.from(loadTaxonomy(stored).categoryById.get("crosses").subcategories, (item) => item.id);
  assert.ok(migratedIds.includes("custom-kept"));
  assert.ok(expected.every(([id]) => migratedIds.includes(id)));

  const source = fs.readFileSync("script.js", "utf8");
  assert.match(source, /alwaysVisibleSubcategoryIds\.has\(subcategory\.id\)/);
  assert.doesNotMatch(JSON.stringify(expected), /مديليات/);
});

test("legacy gifts URL maps to occasions and tote bag card uses the stable meeting-gifts ID", () => {
  const taxonomy = loadTaxonomy();
  assert.equal(taxonomy.categoryById.get("occasions-service").subcategories.find((item) => item.id === "meeting-gifts").name, "توتي باج وشنط");
  assert.match(fs.readFileSync("script.js", "utf8"), /"gifts-accessories": "occasions-service"/);
});

test("main category cards render symbols instead of product photos", () => {
  const source = fs.readFileSync("script.js", "utf8");
  const start = source.indexOf("function ensureMainCategoryTiles()");
  const end = source.indexOf("function mainCategoryTileArt", start);
  const renderer = source.slice(start, end);
  assert.match(renderer, /mainCategoryTileArt\(category\.id\)/);
  assert.doesNotMatch(renderer, /category-art--photo|<img/);
  assert.match(source, /"altar-tools": "brass"/);
  assert.match(source, /"candles-incense": "candles"/);
  assert.match(source, /"church-vestments": "vestments"/);
  assert.match(source, /"icons-frames": "icons"/);
  assert.match(source, /"books-rituals": "books"/);
});
