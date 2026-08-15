const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const script = fs.readFileSync("script.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

test("main category tiles and filters use the shared taxonomy source", () => {
  const renderer = script.match(/function ensureMainCategoryTiles\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(renderer, /visibleMainCategories\(\)\.map/);
  assert.doesNotMatch(renderer, /taxonomyCategories\.map/);
  assert.match(script, /return taxonomyReady \? taxonomyCategories : \[\]/);
  assert.doesNotMatch(script, /taxonomy\?\.defaultCategories/);
  assert.doesNotMatch(script, /const catalogCategoryOrder/);
});

test("category counts stay hidden until complete counts or static products load", () => {
  assert.match(script, /if \(!catalogCategoryCountsLoaded\) return null/);
  assert.match(script, /ensureMainCategoryTiles\(\);\n  syncCatalogFilterControls/);
  assert.match(script, /Object\.prototype\.hasOwnProperty\.call\(catalogCategoryCounts, categoryId\)/);
});

test("main category grid never hides or clips category cards", () => {
  const gridRule = styles.match(/\.category-grid \{[\s\S]*?\}/)?.[0] || "";
  assert.match(gridRule, /display: grid/);
  assert.doesNotMatch(gridRule, /overflow:\s*hidden|opacity:\s*0|visibility:\s*hidden|display:\s*none|transform:|translate/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
