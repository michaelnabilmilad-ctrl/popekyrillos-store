const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("script.js", "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

test("available subcategories come from the full taxonomy", () => {
  const renderer = functionSource("orderedLabelsForCategory", "productsForCurrentCategory");
  assert.match(renderer, /return categoryMeta\.subcategories;/);
  const canonicalBranch = renderer.slice(0, renderer.indexOf("const labels ="));
  assert.doesNotMatch(canonicalBranch, /subcategoryProductCount|availableProducts|state\.labelFilter/);
});

test("subcategory controls use full-category counts instead of filtered products", () => {
  const selectRenderer = functionSource("renderLabelFilterOptions", "subcategoryCardImage");
  const cardRenderer = functionSource("renderSubcategoryCards", "updateFilterButtons");

  assert.match(selectRenderer, /fullSubcategoryProductCount/);
  assert.doesNotMatch(selectRenderer, /productsForCurrentCategory\(\)\.filter/);

  assert.match(cardRenderer, /fullCategoryProductCount\(categoryId\)/);
  assert.match(cardRenderer, /fullSubcategoryProductCount\(categoryId, label\.id\)/);
  assert.doesNotMatch(cardRenderer, /filter\(\(card\).*card\.count > 0/s);
});

test("the selected subcategory only controls active state and product filtering", () => {
  const cardRenderer = functionSource("renderSubcategoryCards", "updateFilterButtons");
  const productFilter = functionSource("getFilteredProducts", "syncCatalogFilterControls");

  assert.match(cardRenderer, /const activeLabel = state\.labelFilter \|\| "";/);
  assert.match(cardRenderer, /active: activeLabel === label\.id/);
  assert.match(productFilter, /productMatchesSubcategory\(product, state\.labelFilter\)/);
});
