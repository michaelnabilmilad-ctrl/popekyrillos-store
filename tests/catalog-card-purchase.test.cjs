const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const script = fs.readFileSync("script.js", "utf8");
const coloringGame = fs.readFileSync("coloring-game.js", "utf8");
const coloringPage = fs.readFileSync("coloring-game.html", "utf8");

test("catalog cards contain their own variant, quantity, price and add controls", () => {
  assert.match(script, /function productCardPurchaseHtml\(product/);
  assert.match(script, /<select data-card-choice required>/);
  assert.match(script, /data-card-quantity/);
  assert.match(script, /data-card-price/);
  assert.match(script, /type="button" data-card-add=/);
  assert.match(script, /card\.querySelector\("\[data-card-price\]"\)\.innerHTML = variantPriceHtml/);
});

test("catalog add action is delegated once and cannot navigate or bubble", () => {
  assert.match(script, /const button = event\.target\.closest\("\[data-card-add\]"\);[\s\S]*?event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.doesNotMatch(script, /if \(isIotaMedalProduct\(product\)\) \{\s*window\.location\.href/);
  assert.doesNotMatch(script, /if \(card\) openProductModal\(card\.dataset\.cardProduct\)/);
  assert.doesNotMatch(script, /class="product-photo-link"/);
  assert.match(script, /cartSelectionLineId\(variant\)/);
  assert.match(script, /state\.cart\.delete\(legacyKey\)/);
  assert.match(script, /تمت إضافة المنتج إلى السلة/);
});

test("coloring is a separate explicit card action and selects the requested design", () => {
  assert.match(script, /\["custom-1782980654479", "yota-01"\]/);
  assert.match(script, /\["custom-1782980654479-copy-1782982056347", "yota-02"\]/);
  assert.match(script, /const coloringDesignId = catalogColoringDesignId\(product\)/);
  assert.match(script, /type="button" data-card-coloring/);
  assert.match(script, /\/coloring-game\?design=/);
  assert.doesNotMatch(script, /coloring-game\?design=\$\{[^\n]+&product=/);
  assert.match(script, /const coloringButton = event\.target\.closest\("\[data-card-coloring\]"\);[\s\S]*?event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(coloringGame, /const requestedDesign = designs\.find/);
  assert.match(coloringGame, /loadDesign\(requestedDesign\)/);
  assert.match(coloringPage, /import \{ COLORING_DESIGNS \} from "\/coloringDesigns\.js"/);
});
