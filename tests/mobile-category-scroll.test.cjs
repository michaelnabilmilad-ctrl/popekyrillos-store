const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("script.js", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

test("a category change jumps to the catalog start and aligns again after its products render", () => {
  const scroller = functionSource("scrollToCatalogStart", "scrollToFirstCatalogProduct");
  assert.match(scroller, /behavior: "instant"/);
  assert.doesNotMatch(scroller, /behavior: "smooth"/);
  assert.match(scroller, /Promise\.resolve\(rendered\)\.finally/);
  assert.match(scroller, /userInput !== catalogScrollUserInput/);

  const apply = functionSource("applyCatalogFilter", "applyCatalogFilterFromUrl");
  assert.match(apply, /const rendered = loadCatalogPage\(\{ reset: true \}\)/);
  assert.match(apply, /scrollToCatalogStart\([^)]*rendered\)/);
  assert.doesNotMatch(apply, /scrollIntoView/);
});

test("the back button loads the products of the category it returns to", () => {
  const fromUrl = functionSource("applyCatalogFilterFromUrl", "openProductFromUrl");
  assert.match(fromUrl, /if \(filterChanged\) rendered = loadCatalogPage\(\{ reset: true \}\)/);
  assert.match(fromUrl, /scrollToCatalogStart\("catalog", rendered\)/);
});

test("the categories drawer and carousels open at their first item", () => {
  assert.match(functionSource("openShopMenu", "closeShopMenu"), /shopMenu\.scrollTop = 0/);
  assert.match(functionSource("renderSubcategoryCards", "updateFilterButtons"), /if \(categoryChanged\) subcategoryCards\.scrollLeft = 0/);
  assert.match(functionSource("ensureMainCategoryTiles", "renderSubcategoryCards"), /if \(replacesSkeleton\) categoryGrid\.scrollLeft = 0/);
});

test("mobile carousels snap their first item at the real start, inside the side padding", () => {
  assert.match(styles, /\.category-grid\{display:flex;[^}]*padding:2px 14px 10px;[^}]*scroll-padding-inline:14px/);
  assert.match(styles, /\.subcategory-card-grid\[data-collapsible="true"\]\[data-expanded="false"\]\{display:flex;[^}]*padding:0 14px 10px;[^}]*scroll-padding-inline:14px/);
});
