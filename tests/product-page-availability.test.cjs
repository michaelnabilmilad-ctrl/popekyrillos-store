const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// product-page.js is a browser script; evaluate only its availability helpers
// against a given page product (a top-level const in the page).
const source = fs.readFileSync("product-page.js", "utf8");
const slice = (name, next) => source.slice(source.indexOf(`function ${name}(`), source.indexOf(next, source.indexOf(`function ${name}(`)));
const body = slice("available", "function coloringMarkup()");
const pageHelpers = (product) => new Function("product", `${body}; return available;`)(product);
const product = { name: "بخور كنسي فاخر", price: 215, stock: "متاح" };

test("an option without a tracked quantity is buyable, like the catalog, cart and order pricing", () => {
  const available = pageHelpers(product);
  assert.equal(available({ price: 215, quantity: null }), true);
  assert.equal(available({ price: 215, quantity: undefined }), true);
  assert.equal(available({ price: 215, quantity: "" }), true);
  assert.equal(available({ price: 215 }), true);
});

test("tracked quantities, flags and price still decide", () => {
  const available = pageHelpers(product);
  assert.equal(available({ price: 215, quantity: 0 }), false);
  assert.equal(available({ price: 215, quantity: "0" }), false);
  assert.equal(available({ price: 215, quantity: 3 }), true);
  assert.equal(available({ price: 215, quantity: null, available: false }), false);
  assert.equal(available({ price: 215, quantity: 10, available: false }), false);
  assert.equal(pageHelpers({ ...product, price: 0 })({ price: 0, quantity: null }), false);
  assert.equal(pageHelpers({ ...product, stock: "غير متاح حاليا" })({ price: 215, quantity: 5 }), false);
});
