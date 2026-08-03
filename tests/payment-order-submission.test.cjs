const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const worker = fs.readFileSync("cloudflare-worker.js", "utf8");
const checkout = fs.readFileSync("checkout-flow.js", "utf8");

test("website orders write each cart line to the current Order Details schema", () => {
  assert.match(worker, /AIRTABLE_ORDER_DETAILS_TABLE\) \|\| "تفاصيل الطلبات"/);
  assert.match(worker, /"Order link": \[orderRecordId\]/);
  assert.match(worker, /Product: item\.productName/);
  assert.match(worker, /Quantity: item\.quantity/);
  assert.match(worker, /Price: item\.unitPrice/);
  assert.match(worker, /fields\["Wood Type"\] = item\.woodType/);
  assert.match(worker, /createAirtableOrderDetails\(env, recordId, normalizedItems\.items/);
  assert.match(worker, /Address: order\.address/);
  assert.match(checkout, /address: orderAddress\(\)/);
});

test("payment preserves the cart on failure and shows the safe server response", () => {
  assert.match(checkout, /error\.status = response\.status/);
  assert.match(checkout, /status\.textContent = `\$\{responseStatus\}: \$\{errorMessage\}/);
  const requestIndex = checkout.indexOf("const orderResult = await createWebsiteOrder");
  const clearIndex = checkout.indexOf("await clearCheckoutCartAfterSuccessfulOrder()", requestIndex);
  const failureIndex = checkout.indexOf("const errorMessage = error?.message", clearIndex);
  assert.ok(requestIndex >= 0 && clearIndex > requestIndex && failureIndex > clearIndex);
  assert.doesNotMatch(checkout.slice(failureIndex, checkout.indexOf("};", failureIndex)), /clearCheckoutCartAfterSuccessfulOrder/);
});
