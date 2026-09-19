import test from "node:test";
import assert from "node:assert/strict";
import { customerOrdersResponse, ensureOrderAccess, normalizeEgyptianPhone, canCustomerCancelOrder, acquireOrderLock, releaseOrderLock, writeOrderUnderLock, historicalItems } from "../functions/_customer-orders.js";
import { createOrderResponse } from "../cloudflare-worker.js";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";

const origin = "https://popekyrillos.store";
async function setup(t) {
  const f = airtableFixture();
  t.mock.method(globalThis, "fetch", f.fetch);
  f.api = async (path, body, options = {}) => {
    const request = new Request(origin + path, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1", ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const response = await customerOrdersResponse({ request, env: f.env }, path);
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  f.path = async order => `/api/customer-orders/${(await ensureOrderAccess(f.env, order.id)).token}`;
  return f;
}
test("Egyptian phone normalization is strict and supports prefixes/Arabic digits", () => {
  for (const phone of ["01012345678", "+20 10 1234 5678", "00201012345678", "201012345678", "٠١٠١٢٣٤٥٦٧٨"]) assert.equal(normalizeEgyptianPhone(phone), "01012345678");
  for (const phone of ["", "123", "+101012345678", "01012345678x", "010123456789", "++201012345678"]) assert.equal(normalizeEgyptianPhone(phone), "");
});
test("cancellation uses the existing Arabic allowlist and rejects every late/unknown state", () => {
  for (const status of ["جديد", "انتظار بيانات", "انتظار الدفع", "قيد التجهيز"]) assert.equal(canCustomerCancelOrder({ orderStatus: status }), true);
  for (const status of ["جاهز للاستلام / الشحن", "تم الشحن", "خرج للتوصيل", "تم التسليم", "ملغي", "processing", "", "قيد المراجعة"]) assert.equal(canCustomerCancelOrder({ orderStatus: status }), false);
});
test("legacy lookup verifies phone, lazily assigns a stable token, retains all saved prices and excludes unrelated records", async t => {
  const f = await setup(t); const old = f.record(); f.addDetail(old); f.addDetail(f.record());
  const wrong = await f.api("/api/customer-orders/lookup", { orderNumber: 1, phone: "01099999999" });
  assert.equal(wrong.status, 404); assert.deepEqual(Object.keys(wrong.body), ["message"]);
  const found = await f.api("/api/customer-orders/lookup", { orderNumber: "١", phone: "00201012345678" });
  assert.equal(found.status, 200); assert.match(found.body.trackingUrl, /^\/order\/[a-f0-9]{64}$/);
  const again = await f.api("/api/customer-orders/lookup", { orderNumber: 1, phone: "+201012345678" });
  assert.equal(again.body.trackingUrl, found.body.trackingUrl);
  const page = await f.api(found.body.trackingUrl.replace("/order/", "/api/customer-orders/"));
  assert.equal(page.status, 200); assert.equal(page.body.order.items.length, 1);
  assert.equal(page.body.order.items[0].productName, "كتاب أصلي"); assert.equal(page.body.order.items[0].unitPrice, 120);
  assert.equal(page.body.order.items[0].productImage, "");
  assert.equal(page.body.order.address, "القاهرة"); assert.equal(page.body.order.shippingCost, null);
  assert.equal(page.headers.get("Cache-Control"), "private, no-store");
  assert.doesNotMatch(JSON.stringify(page.body), /recProduct|appTest|test-secret|rec0/);
  assert.equal(f.writes.length, 0);
});
test("processing cancellation remains in Airtable, appends attribution and returns stock only once for duplicate/concurrent requests", async t => {
  const f = await setup(t); const order = f.record(); const detail = f.addDetail(order); const path = await f.path(order);
  const responses = await Promise.all([f.api(path + "/cancel", {}), f.api(path + "/cancel", {}), f.api(path + "/cancel", {})]);
  assert.ok(responses.some(row => row.status === 200));
  assert.equal((await f.api(path + "/cancel", {})).status, 200);
  assert.equal(f.orders.size, 1); assert.equal(order.fields["Order Status"], "ملغي");
  assert.match(order.fields.Notes, /ملاحظة محفوظة.*إلغاء بواسطة العميل/);
  assert.equal(f.stock, 10); assert.equal(f.movements.length, 1); assert.equal(detail.fields["تم إرجاع المخزون؟"], true);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].table, "Orders");
  const page = (await f.api(path)).body.order;
  assert.equal(page.canCancel, false); assert.equal(page.history[0].changedBy, "customer");
});
test("orders with no deduction, and already returned lines, never increase stock", async t => {
  const f = await setup(t);
  for (const [deducted, restored] of [[false, false], [true, true]]) {
    const order = f.record(); f.addDetail(order, deducted, restored);
    assert.equal((await f.api(await f.path(order) + "/cancel", {})).status, 200);
  }
  assert.equal(f.stock, 9); assert.equal(f.movements.length, 0);
});
test("shipped state rejects cancellation including an old browser and a change during the first read", async t => {
  const f = await setup(t); const order = f.record(); f.addDetail(order); const path = await f.path(order);
  assert.equal((await f.api(path)).body.order.canCancel, true);
  order.fields["Order Status"] = "تم الشحن";
  assert.equal((await f.api(path + "/cancel", {})).status, 409);
  order.fields["Order Status"] = "قيد التجهيز";
  let reads = 0;
  f.beforeRead = async () => { if (++reads === 2) order.fields["Order Status"] = "خرج للتوصيل"; };
  assert.equal((await f.api(path + "/cancel", {})).status, 409);
  assert.equal(f.writes.length, 0); assert.equal(f.stock, 9);
});
test("website admin writes and customer cancellations share one durable lock", async t => {
  const f = await setup(t); const order = f.record(); const path = await f.path(order);
  const owner = await acquireOrderLock(f.env, order.id);
  assert.equal((await f.api(path + "/cancel", {})).status, 409);
  await writeOrderUnderLock(f.env, order, { "Order Status": "جاهز للاستلام / الشحن" }, "admin");
  await releaseOrderLock(f.env, order.id, owner);
  assert.equal((await f.api(path + "/cancel", {})).status, 409);
  assert.equal(f.writes.length, 1);
});
test("ambiguous Airtable PATCH never permits a retry to create a second transition", async t => {
  const f = await setup(t); const order = f.record(); f.addDetail(order); const path = await f.path(order); f.failPatchAfterCommit = true;
  const first = await f.api(path + "/cancel", {});
  assert.equal(first.status, 503); assert.doesNotMatch(JSON.stringify(first.body), /secret|recPrivate|stack/);
  assert.equal((await f.api(path + "/cancel", {})).body.alreadyCancelled, true);
  assert.equal(f.writes.length, 1); assert.equal(f.stock, 10);
  await assert.rejects(acquireOrderLock(f.env, order.id), /تحديث الطلب/);
});
test("optional legacy fields and missing products do not crash or fabricate zero prices", async t => {
  const f = await setup(t); const order = f.record("جديد", { Products: "", Notes: "", Total: null, Phone: "01012345678" });
  const page = await f.api(await f.path(order));
  assert.equal(page.status, 200); assert.deepEqual(page.body.order.items, []); assert.equal(page.body.order.total, null);
  const detail = f.addDetail(order); delete detail.fields["سعر القطعة"]; delete detail.fields["الإجمالي"];
  const item = historicalItems(order, [detail])[0]; assert.equal(item.unitPrice, null); assert.equal(item.lineTotal, null);
});
test("invalid capabilities, order-number-only and cross-origin requests reveal nothing; lookup is rate limited", async t => {
  const f = await setup(t); const order = f.record(); const path = await f.path(order);
  assert.equal((await f.api("/api/customer-orders/" + "0".repeat(64))).status, 404);
  assert.equal((await f.api("/api/customer-orders/lookup", { orderNumber: 1 })).status, 404);
  assert.equal((await f.api(path + "/cancel", {}, { headers: { Origin: "https://evil.example" } })).status, 403);
  let response;
  for (let i = 0; i < 13; i++) response = await f.api("/api/customer-orders/lookup", { orderNumber: 1, phone: "01099999999" });
  assert.equal(response.status, 429); assert.equal(f.writes.length, 0);
});
test("new checkout returns a public receipt, freezes snapshots and replays safely without internal IDs", async t => {
  const f = await setup(t);
  const payload = { requestId: "checkout-unique", customerName: "عميل", phone: "01012345678", address: "القاهرة", paymentMethod: "InstaPay", deliveryType: "Shipping", total: 120, products: [{ name: "كتاب وقت الشراء", sku: "BOOK-1", quantity: 1, price: 120, image: "https://popekyrillos.store/book.webp" }] };
  const submit = () => createOrderResponse({ env: f.env, request: new Request(origin + "/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": payload.requestId }, body: JSON.stringify(payload) }) });
  const first = await submit(); assert.equal(first.status, 200); const receipt = await first.json();
  assert.equal(receipt.orderId, "1"); assert.match(receipt.publicOrderToken, /^[a-f0-9]{64}$/); assert.equal(receipt.recordId, undefined);
  const retry = await submit(); assert.equal(retry.status, 200); assert.equal((await retry.json()).publicOrderToken, receipt.publicOrderToken); assert.equal(f.creates, 1); assert.equal(f.details.length, 1);
  const order = [...f.orders.values()][0];
  order.fields.Products = "اسم تم تعديله لاحقًا | الكمية: 1 | السعر: 150 ج.م";
  const page = await f.api(`/api/customer-orders/${receipt.publicOrderToken}`);
  assert.equal(page.body.order.items[0].productName, "كتاب وقت الشراء"); assert.equal(page.body.order.items[0].unitPrice, 120); assert.equal(page.body.order.items[0].sku, "BOOK-1");
  payload.phone = "01099999999";
  assert.notEqual((await submit()).status, 200);
  assert.equal(f.env.ANALYTICS_DB.sqlite.prepare("SELECT status FROM website_order_requests").get().status, "completed");
  assert.equal(f.details.length, 1);
});

test("receipt transport failure after completed checkout never reopens detail creation", async t => {
  const f = await setup(t);
  const payload = { requestId: "lost-receipt", customerName: "عميل", phone: "01012345678", address: "القاهرة", paymentMethod: "Cash", deliveryType: "Pickup", total: 120, products: [{ name: "كتاب", sku: "BOOK-1", quantity: 1, price: 120 }] };
  const submit = () => createOrderResponse({ env: f.env, request: new Request(origin + "/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) });
  f.beforeRead = async () => { throw new Error("Temporary read error"); };
  assert.equal((await submit()).status, 502);
  assert.equal(f.env.ANALYTICS_DB.sqlite.prepare("SELECT status FROM website_order_requests").get().status, "completed");
  f.beforeRead = null;
  const retry = await submit(); assert.equal(retry.status, 200);
  const receipt = await retry.json(); assert.equal(receipt.duplicate, true);
  assert.equal(f.creates, 1); assert.equal(f.details.length, 1);
  const page = (await f.api(`/api/customer-orders/${receipt.publicOrderToken}`)).body.order;
  assert.equal(page.shippingCost, 0); assert.equal(page.pickupBranch, "القاهرة");
});

test("concurrent legacy token issuance converges without changing any Airtable order", async t => {
  const f = await setup(t); const order = f.record();
  const rows = await Promise.all(Array.from({ length: 8 }, () => ensureOrderAccess(f.env, order.id)));
  assert.equal(new Set(rows.map(row => row.token)).size, 1);
  const another = await ensureOrderAccess(f.env, f.record().id);
  assert.notEqual(another.token, rows[0].token);
  assert.equal(f.writes.length, 0);
});

test("customer-supplied status is ignored and whitespace/invalid bodies receive safe errors", async t => {
  const f = await setup(t); const order = f.record("تم التسليم"); const path = await f.path(order);
  assert.equal((await f.api(path + "/cancel", { orderStatus: "جديد", stockRestored: false })).status, 409);
  assert.equal((await f.api("/api/customer-orders/lookup", null)).status, 400);
  assert.equal(f.writes.length, 0);
});
