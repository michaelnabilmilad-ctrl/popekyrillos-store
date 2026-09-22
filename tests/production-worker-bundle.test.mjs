import test from "node:test";
import assert from "node:assert/strict";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";

const bundleUrl = new URL("../.wrangler/tmp/order-tracking-production/cloudflare-worker.js", import.meta.url);
const worker = (await import(`${bundleUrl.href}?qa=${Date.now()}`)).default;
const origin = "https://popekyrillos.store";

function request(path, method = "GET", body) {
  return new Request(origin + path, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.2" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function call(fixture, path, method = "GET", body) {
  const response = await worker.fetch(request(path, method, body), fixture.env, { waitUntil() {} });
  return { status: response.status, body: await response.json() };
}

async function createWebsiteOrder(fixture, requestId) {
  const result = await call(fixture, "/api/orders", "POST", {
    requestId,
    customerName: "عميل bundle تجريبي",
    phone: "01012345678",
    address: "القاهرة",
    paymentMethod: "Cash",
    deliveryType: "Pickup",
    total: 120,
    products: [{ name: "كتاب", sku: "BOOK-1", quantity: 1, price: 120 }]
  });
  assert.equal(result.status, 200);
  assert.match(result.body.publicOrderToken, /^[a-f0-9]{64}$/);
  assert.equal(result.body.recordId, undefined);
  return result.body;
}

function websiteOrderBody(requestId, phone = "01012345678") {
  return {
    requestId,
    customerName: "عميل bundle تجريبي",
    phone,
    address: "القاهرة",
    paymentMethod: "Cash",
    deliveryType: "Pickup",
    total: 120,
    products: [{ name: "كتاب", sku: "BOOK-1", quantity: 1, price: 120 }]
  };
}

test("exact Wrangler production bundle exposes lookup/order/cancel and returns deducted stock once", async t => {
  const fixture = airtableFixture();
  fixture.env.ASSETS = { fetch: async () => new Response("asset") };
  t.mock.method(globalThis, "fetch", fixture.fetch);
  const receipt = await createWebsiteOrder(fixture, "bundle-deducted");
  const replay = await call(fixture, "/api/orders", "POST", websiteOrderBody("bundle-deducted"));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.publicOrderToken, receipt.publicOrderToken);
  assert.equal(replay.body.duplicate, true);
  assert.equal(replay.body.recordId, undefined);
  assert.equal(fixture.creates, 1);
  assert.equal(fixture.details.length, 1);
  const wrongPhone = await call(fixture, "/api/orders", "POST", websiteOrderBody("bundle-deducted", "01099999999"));
  assert.equal(wrongPhone.status, 404);
  assert.equal(wrongPhone.body.publicOrderToken, undefined);
  const trackingPage = await worker.fetch(request(`/order/${receipt.publicOrderToken}`), fixture.env, { waitUntil() {} });
  assert.equal(trackingPage.status, 200);
  const order = [...fixture.orders.values()][0];
  order.fields["Order Status"] = "قيد التجهيز";
  fixture.details[0].fields["تم خصم المخزون؟"] = true;
  fixture.stock = 9;

  const lookup = await call(fixture, "/api/customer-orders/lookup", "POST", { orderNumber: 1, phone: "+201012345678" });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.trackingUrl, `/order/${receipt.publicOrderToken}`);
  const path = `/api/customer-orders/${receipt.publicOrderToken}`;
  assert.equal((await call(fixture, path)).body.order.orderStatus, "قيد التجهيز");
  const results = await Promise.all([call(fixture, path + "/cancel", "POST", {}), call(fixture, path + "/cancel", "POST", {}), call(fixture, path + "/cancel", "POST", {})]);
  assert.ok(results.some(result => result.status === 200));
  await call(fixture, path + "/cancel", "POST", {});
  await call(fixture, path);
  assert.equal(order.fields["Order Status"], "ملغي");
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
  assert.equal(fixture.movements[0].type, "مرتجع عميل");
  assert.equal(fixture.details[0].fields["تم إرجاع المخزون؟"], true);
  const customerWrites = fixture.writes.filter(write => write.table === "Orders" && write.method === "PATCH");
  assert.equal(customerWrites.length, 1);
  assert.equal(JSON.parse(customerWrites[0].body).fields["Order Status"], "ملغي");
});

test("exact production bundle creates no return when stock was not deducted or was already returned", async t => {
  const fixture = airtableFixture();
  fixture.env.ASSETS = { fetch: async () => new Response("asset") };
  t.mock.method(globalThis, "fetch", fixture.fetch);
  for (const [requestId, deducted, restored] of [["bundle-not-deducted", false, false], ["bundle-already-returned", true, true]]) {
    const receipt = await createWebsiteOrder(fixture, requestId);
    const order = [...fixture.orders.values()].at(-1);
    order.fields["Order Status"] = "قيد التجهيز";
    const detail = fixture.details.at(-1);
    detail.fields["تم خصم المخزون؟"] = deducted;
    detail.fields["تم إرجاع المخزون؟"] = restored;
    assert.equal((await call(fixture, `/api/customer-orders/${receipt.publicOrderToken}/cancel`, "POST", {})).status, 200);
  }
  assert.equal(fixture.stock, 9);
  assert.equal(fixture.movements.length, 0);
});

test("idempotent Airtable script repairs a failed returned-flag update without a second movement", async t => {
  const fixture = airtableFixture();
  fixture.env.ASSETS = { fetch: async () => new Response("asset") };
  t.mock.method(globalThis, "fetch", fixture.fetch);
  const receipt = await createWebsiteOrder(fixture, "bundle-partial-return");
  const order = [...fixture.orders.values()][0];
  const detail = fixture.details[0];
  order.fields["Order Status"] = "قيد التجهيز";
  detail.fields["تم خصم المخزون؟"] = true;
  fixture.stock = 9;
  fixture.failReturnFlagOnce = true;

  assert.equal((await call(fixture, `/api/customer-orders/${receipt.publicOrderToken}/cancel`, "POST", {})).status, 200);
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
  assert.equal(Boolean(detail.fields["تم إرجاع المخزون؟"]), false);

  fixture.runReturnAutomation(detail);
  assert.equal(fixture.stock, 10);
  assert.equal(fixture.movements.length, 1);
  assert.equal(fixture.movements[0].key, `cancel-return:${detail.id}`);
  assert.equal(detail.fields["تم إرجاع المخزون؟"], true);
});
