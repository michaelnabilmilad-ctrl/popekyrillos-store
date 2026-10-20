// /api/orders used to save the prices, the total and the payment/order status sent by the
// browser, so an edited request could place an order with a lower price or marked as paid.
// Lines are now priced from the live catalog with the cart page's own rules, the statuses are
// set by the server, and new orders are rate limited. Fake catalog and fake Airtable only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { priceOrderItems, paymentStatusForMethod } from "../functions/_order-pricing.js";
import { createOrderResponse } from "../cloudflare-worker.js";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";

const origin = "https://popekyrillos.store";
const catalog = [
  { id: "book-1", sku: "BOOK-1", name: "كتاب", price: 120, stock: "متاح", variants: [] },
  { id: "daf", name: "دف نحاس", price: 900, stock: "متاح", variants: [
    { id: "daf-9", price: 900, compareAtPrice: 1050, options: { "المقاس": "9 سم" }, available: true, quantity: 3 },
    { id: "daf-16", price: 1400, options: { "المقاس": "16 سم" }, available: true },
    { id: "daf-20", price: 1800, options: { "المقاس": "20 سم" }, available: false }
  ] },
  { id: "medal-1", name: "صليب يوتا مادلية موديل 2", price: 18, stock: "متاح", variants: [] },
  { id: "gone", name: "منتج غير متاح", price: 50, stock: "غير متاح حاليا", variants: [] }
];
const item = (fields) => ({ websiteProductId: "", sku: "", variantId: "", quantity: 1, ...fields });

test("lines are priced from the catalog with the cart page's rules", () => {
  const { lines, total, errors } = priceOrderItems([
    item({ websiteProductId: "book-1", quantity: 2 }),
    item({ websiteProductId: "daf", variantId: "daf-16" }),
    item({ websiteProductId: "daf", variantId: "daf-9" }),
    item({ websiteProductId: "medal-1", variantId: "medal-wood-beech", quantity: 3 }),
    item({ sku: "BOOK-1" })
  ], catalog);
  assert.deepEqual(errors, []);
  assert.deepEqual(lines.map((line) => line.unitPrice), [120, 1400, 900, 27, 120]);
  assert.equal(lines[2].basePrice, 1050, "the shown discount is kept");
  assert.equal(total, 240 + 1400 + 900 + 81 + 120);
});

test("a variant id that no longer exists is priced like the cart page (first variant), never from the request", () => {
  const { lines } = priceOrderItems([item({ websiteProductId: "daf", variantId: "removed" })], catalog);
  assert.equal(lines[0].unitPrice, 900);
});

test("missing, unavailable, out-of-stock and odd quantities are refused", () => {
  const { errors } = priceOrderItems([
    item({ websiteProductId: "nope" }),
    item({ websiteProductId: "gone" }),
    item({ websiteProductId: "daf", variantId: "daf-20" }),
    item({ websiteProductId: "daf", variantId: "daf-9", quantity: 4 }),
    item({ websiteProductId: "book-1", quantity: 1.5 }),
    item({ websiteProductId: "book-1", quantity: 0 })
  ], catalog);
  assert.deepEqual(errors.map((error) => error.code), ["product_not_found", "unavailable", "unavailable", "not_enough_stock", "invalid_quantity", "invalid_quantity"]);
});

test("payment status follows the payment method only", () => {
  for (const method of ["InstaPay", "Vodafone Cash", "Online Payment"]) assert.equal(paymentStatusForMethod(method), "تحويل للمراجعة");
  assert.equal(paymentStatusForMethod("Cash"), "غير مدفوع");
});

async function setup(t) {
  const f = airtableFixture();
  f.catalog = catalog;
  t.mock.method(globalThis, "fetch", f.fetch);
  let n = 0;
  f.order = (overrides = {}, headers = {}) => {
    const payload = {
      requestId: `test-${++n}`, customerName: "عميل تجريبي", phone: "01012345678", address: "القاهرة",
      paymentMethod: "InstaPay", deliveryType: "Shipping",
      products: [{ productId: "book-1", sku: "BOOK-1", name: "كتاب", quantity: 2, price: 120, lineTotal: 240 }],
      total: 240, paymentStatus: "تحويل للمراجعة", orderStatus: "جديد", ...overrides
    };
    return createOrderResponse({ env: f.env, request: new Request(origin + "/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Request-Id": payload.requestId, "CF-Connecting-IP": "192.0.2.10", ...headers }, body: JSON.stringify(payload)
    }) });
  };
  f.created = () => [...f.orders.values()].map((order) => order.fields);
  return f;
}

test("an honest order is saved exactly as before, with catalog prices", async (t) => {
  const f = await setup(t);
  const response = await f.order();
  assert.equal(response.status, 200);
  const [saved] = f.created();
  assert.equal(saved.Total, 240);
  assert.equal(saved["Payment Status"], "تحويل للمراجعة");
  assert.equal(saved["Order Status"], "جديد");
  assert.match(saved.Products, /السعر النهائي: 120 ج\.م/);
  assert.equal(f.details[0].fields["سعر القطعة"], 120);
});

test("a lowered line price or total is refused and nothing reaches Airtable", async (t) => {
  const f = await setup(t);
  const cheap = await f.order({ products: [{ productId: "book-1", sku: "BOOK-1", name: "كتاب", quantity: 2, price: 1, lineTotal: 2 }], total: 2 });
  assert.equal(cheap.status, 409);
  assert.equal((await cheap.json()).error, "price_changed");
  const wrongTotal = await f.order({ total: 10 });
  assert.equal(wrongTotal.status, 409);
  assert.equal(f.creates, 0);
  assert.equal(f.writes.length, 0);
});

test("a cheap line with the right-looking total still gets catalog prices only", async (t) => {
  const f = await setup(t);
  // The browser claims 1 EGP per item but sends the real total: saved with the catalog price.
  const response = await f.order({ products: [{ productId: "book-1", sku: "BOOK-1", name: "كتاب", quantity: 2, price: 1, lineTotal: 2 }], total: 240 });
  assert.equal(response.status, 200);
  assert.equal(f.created()[0].Total, 240);
  assert.equal(f.details[0].fields["سعر القطعة"], 120);
});

test("statuses and payment proof from the request are ignored", async (t) => {
  const f = await setup(t);
  assert.equal((await f.order({ paymentMethod: "Cash", deliveryType: "Pickup", paymentStatus: "مدفوع", orderStatus: "تم التسليم", paymentProof: "fake" })).status, 200);
  const [saved] = f.created();
  assert.equal(saved["Payment Status"], "غير مدفوع");
  assert.equal(saved["Order Status"], "جديد");
  assert.ok(!saved["Payment Proof"], "no proof field written");
});

test("unknown payment methods and cash with shipping are refused", async (t) => {
  const f = await setup(t);
  assert.equal((await f.order({ paymentMethod: "Free" })).status, 400);
  assert.equal((await f.order({ paymentMethod: "Cash", deliveryType: "Shipping" })).status, 400);
  assert.equal((await f.order({ deliveryType: "Teleport" })).status, 400);
  assert.equal(f.creates, 0);
});

test("an unavailable or unknown product is refused with a review-your-cart message", async (t) => {
  const f = await setup(t);
  const response = await f.order({ products: [{ productId: "gone", name: "منتج غير متاح", quantity: 1, price: 50 }], total: 50 });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "cart_changed");
  assert.equal(f.creates, 0);
});

test("new orders are rate limited per phone, retries of the same order are never counted", async (t) => {
  const f = await setup(t);
  for (let i = 0; i < 5; i++) assert.equal((await f.order()).status, 200, `order ${i + 1}`);
  const sixth = await f.order();
  assert.equal(sixth.status, 429);
  assert.equal((await sixth.json()).error, "too_many_orders");
  assert.equal(f.creates, 5);
  // A different customer on the same network is not blocked by this phone's limit.
  assert.equal((await f.order({ phone: "01198765432" })).status, 200);
  // The phone is stored only as a salted hash.
  const subjects = f.env.ANALYTICS_DB.sqlite.prepare("SELECT subject FROM website_order_attempts").all().map((row) => row.subject);
  assert.ok(subjects.length > 0 && subjects.every((subject) => !subject.includes("0101234")));
});

test("retrying the same request id returns the same order without counting or creating again", async (t) => {
  const f = await setup(t);
  const payload = { requestId: "same-order" };
  assert.equal((await f.order(payload)).status, 200);
  for (let i = 0; i < 6; i++) assert.equal((await f.order(payload)).status, 200);
  assert.equal(f.creates, 1);
  assert.equal(f.env.ANALYTICS_DB.sqlite.prepare("SELECT COUNT(*) AS n FROM website_order_attempts WHERE subject LIKE 'phone:%'").get().n, 1);
});

test("the cart page still sends the same order format the server prices", () => {
  const checkout = fs.readFileSync(new URL("../checkout-flow.js", import.meta.url), "utf8");
  assert.match(checkout, /productId,\r?\n/);
  assert.match(checkout, /variantId: item\.variant\?\.id \|\| ""/);
  assert.match(checkout, /total: cartTotal\(\)/);
});
