const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "admin.js"), "utf8");

test("full Edit is delegated and resolves products by stable id", () => {
  assert.match(source, /document\.addEventListener\("click", handleActionClick\)/);
  assert.match(source, /event\.target\.closest\("\[data-select-product\]"\)/);
  assert.match(source, /openFullProductEditor\(editButton\.dataset\.selectProduct\)/);
  assert.match(source, /state\.products\.find\(\(item\) => item\.id === productId\)/);
  assert.doesNotMatch(source, /querySelectorAll\("\[data-select-product\]"\)\.forEach/);
});

test("full Edit buttons are non-submit controls carrying the product id", () => {
  assert.match(
    source,
    /<button type="button" data-select-product="\$\{escapeAttribute\(product\.id\)\}">تعديل<\/button>/
  );
});

test("opening the full editor reveals the populated interface", () => {
  assert.match(source, /renderEditor\(\);[\s\S]*?scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});
