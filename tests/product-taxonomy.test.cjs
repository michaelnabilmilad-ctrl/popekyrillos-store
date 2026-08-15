const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadTaxonomy(storedTaxonomy = null, storedVersion = 2026080801, extraStorage = {}) {
  const storage = new Map(Object.entries({
    ...extraStorage,
    ...(storedTaxonomy ? { "pope-kyrillos-taxonomy": JSON.stringify(storedTaxonomy) } : {}),
    ...(storedVersion === null ? {} : { "pope-kyrillos-taxonomy-version": String(storedVersion) })
  }));
  const context = {
    window: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("category-taxonomy.js", "utf8"), context);
  Object.defineProperty(context.window.POPE_KYRILLOS_TAXONOMY, "testStorage", { value: storage });
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

test("plain Iota hand crosses and plain cross medals are selectable cross subcategories", () => {
  const taxonomy = loadTaxonomy();
  const crosses = taxonomy.categoryById.get("crosses");
  const expected = [
    ["iota-plain-hand-crosses", "صلبان يد يوتا سادة"],
    ["plain-cross-medals", "صلبان ميداليات سادة"]
  ];

  for (const [id, name] of expected) {
    const subcategory = crosses.subcategories.find((item) => item.id === id);
    assert.equal(subcategory?.name, name);
    assert.equal(taxonomy.subcategoryById.get(id)?.mainId, "crosses");
    assert.equal(taxonomy.subcategoryIdFromName(name), id);
  }

  assert.doesNotMatch(JSON.stringify(expected), /مديليات/);
});

test("new cross subcategories merge into an older locally managed taxonomy without removing data", () => {
  const current = loadTaxonomy();
  const stored = JSON.parse(JSON.stringify(Array.from(current.defaultCategories)));
  const crosses = stored.find((category) => category.id === "crosses");
  crosses.subcategories = crosses.subcategories.filter((item) => !["iota-plain-hand-crosses", "plain-cross-medals"].includes(item.id));
  crosses.subcategories.push({ id: "custom-kept", name: "قسم محفوظ" });

  const migrated = loadTaxonomy(stored);
  const migratedIds = Array.from(migrated.categoryById.get("crosses").subcategories, (item) => item.id);
  assert.ok(migratedIds.includes("custom-kept"));
  assert.ok(migratedIds.includes("iota-plain-hand-crosses"));
  assert.ok(migratedIds.includes("plain-cross-medals"));
});

test("an old cached taxonomy is replaced without touching cart or login storage", () => {
  const current = loadTaxonomy();
  const partial = JSON.parse(JSON.stringify(Array.from(current.defaultCategories).slice(0, 5)));
  partial[0].name = "اسم عرض محفوظ";

  const migrated = loadTaxonomy(partial, 1, {
    "pope-kyrillos-cart": "cart-must-stay",
    "firebase:authUser:test": "login-must-stay"
  });
  assert.deepEqual(
    Array.from(migrated.customerCategories(), (category) => category.id),
    ["altar-vessels", "censers-incense", "candles-lamps", "church-vestments", "crosses", "icons-frames", "books-rituals", "occasions-service", "church-equipment"]
  );
  assert.equal(migrated.categoryById.get("altar-vessels").name, "المذبح والأواني المقدسة");
  assert.equal(migrated.testStorage.get("pope-kyrillos-taxonomy-version"), String(migrated.CURRENT_TAXONOMY_VERSION));
  assert.equal(JSON.parse(migrated.testStorage.get("pope-kyrillos-taxonomy")).length, migrated.defaultCategories.length);
  assert.equal(migrated.testStorage.get("pope-kyrillos-cart"), "cart-must-stay");
  assert.equal(migrated.testStorage.get("firebase:authUser:test"), "login-must-stay");

  const migratedWithoutVersion = loadTaxonomy(partial, null, {
    "pope-kyrillos-cart": "cart-still-here",
    "pope-kyrillos-auth:user": "auth-still-here"
  });
  assert.equal(migratedWithoutVersion.customerCategories().length, 9);
  assert.equal(migratedWithoutVersion.testStorage.get("pope-kyrillos-taxonomy-version"), String(migratedWithoutVersion.CURRENT_TAXONOMY_VERSION));
  assert.equal(migratedWithoutVersion.testStorage.get("pope-kyrillos-cart"), "cart-still-here");
  assert.equal(migratedWithoutVersion.testStorage.get("pope-kyrillos-auth:user"), "auth-still-here");
});

test("new empty cross subcategories remain visible in storefront cards and filters", () => {
  const source = fs.readFileSync("script.js", "utf8");
  assert.match(source, /alwaysVisibleSubcategoryIds = new Set\(\["iota-plain-hand-crosses", "plain-cross-medals"\]\)/);
  assert.match(source, /alwaysVisibleSubcategoryIds\.has\(subcategory\.id\)/);
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
  assert.doesNotMatch(source, /legacyMainCategoryArt/);
  assert.match(source, /function mainCategoryTileArt\(categoryId\)/);
});
