const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// product-page.js is a browser script; evaluate only its available() helper.
const source = fs.readFileSync("product-page.js", "utf8");
const body = source.slice(source.indexOf("function available(variant)"), source.indexOf("function coloringMarkup()"));
const available = new Function(`${body}; return available;`)();

test("an option without a tracked quantity is buyable, like the catalog, cart and order pricing", () => {
  assert.equal(available({ quantity: null }), true);
  assert.equal(available({ quantity: undefined }), true);
  assert.equal(available({ quantity: "" }), true);
  assert.equal(available({}), true);
});

test("tracked quantities and the available flag still decide", () => {
  assert.equal(available({ quantity: 0 }), false);
  assert.equal(available({ quantity: "0" }), false);
  assert.equal(available({ quantity: 3 }), true);
  assert.equal(available({ quantity: null, available: false }), false);
});
