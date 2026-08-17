const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const taxonomySource = fs.readFileSync("category-taxonomy.js", "utf8");

function loadTaxonomy(storedCategories = null, storedVersion = null) {
  const storage = new Map();
  if (storedCategories) storage.set("pope-kyrillos-taxonomy", JSON.stringify(storedCategories));
  if (storedVersion !== null) storage.set("pope-kyrillos-taxonomy-version", String(storedVersion));
  const context = {
    window: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    }
  };
  vm.createContext(context);
  vm.runInContext(taxonomySource, context);
  return context.window.POPE_KYRILLOS_TAXONOMY;
}

test("legacy altar-vessels cache cannot reintroduce duplicate altar-crosses", () => {
  const canonical = loadTaxonomy();
  const legacyStored = JSON.parse(JSON.stringify(canonical.defaultCategories));
  const altarVessels = legacyStored.find((category) => category.id === "altar-vessels");
  const migratedCross = altarVessels.subcategories.find((subcategory) => subcategory.id === "altar-vessel-crosses");
  migratedCross.id = "altar-crosses";

  const runtime = loadTaxonomy(legacyStored, canonical.CURRENT_TAXONOMY_VERSION);
  const occurrences = [];
  runtime.categories.forEach((category, categoryIndex) => {
    category.subcategories.forEach((subcategory, subcategoryIndex) => {
      if (subcategory.id === "altar-crosses") occurrences.push({ categoryIndex, subcategoryIndex, categoryId: category.id });
    });
  });

  assert.deepEqual(occurrences, [{ categoryIndex: 4, subcategoryIndex: 6, categoryId: "crosses" }]);
  assert.ok(runtime.categoryById.get("altar-vessels").subcategories.some((subcategory) => subcategory.id === "altar-vessel-crosses"));

  const reloaded = loadTaxonomy(JSON.parse(JSON.stringify(runtime.categories)), runtime.CURRENT_TAXONOMY_VERSION);
  const reloadedAltarCrosses = reloaded.categories.flatMap((category) => category.subcategories).filter((subcategory) => subcategory.id === "altar-crosses");
  assert.equal(reloadedAltarCrosses.length, 1);
  assert.ok(reloaded.categoryById.get("altar-vessels").subcategories.some((subcategory) => subcategory.id === "altar-vessel-crosses"));
});

test("admin and server validators report all duplicate IDs together", () => {
  const adminSource = fs.readFileSync("admin.js", "utf8");
  const apiSource = fs.readFileSync("functions/api/update-taxonomy.js", "utf8");
  assert.match(adminSource, /duplicateCategoryIds/);
  assert.match(adminSource, /duplicateSubcategoryIds/);
  assert.match(adminSource, /تم العثور على.*IDs مكررة/);
  assert.match(adminSource, /validation\.errors\.join\("\\n"\)/);
  assert.match(apiSource, /Duplicate taxonomy IDs/);
  assert.match(apiSource, /duplicateIds\.join/);
});
