// Admin JSON (orders with customer names, phones and addresses; analytics) must never
// be stored by a browser or a shared cache. Fake Airtable and D1 only.
import test from "node:test";
import assert from "node:assert/strict";
import { adminAuthHeader, createAdminEnv, SITE } from "./helpers/fake-github.mjs";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";

globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };
const worker = (await import(`../cloudflare-worker.js?admin-cache=${Date.now()}`)).default;

test("admin orders and analytics responses are private, no-store", async (t) => {
  const fixture = airtableFixture();
  fixture.record();
  t.mock.method(globalThis, "fetch", fixture.fetch);
  const env = { ...createAdminEnv(), ...fixture.env };
  const get = (path) => worker.fetch(new Request(`${SITE}${path}`, { headers: { Authorization: adminAuthHeader(env), Origin: SITE } }), env, { waitUntil() {} });

  const orders = await get("/admin/api/orders");
  assert.equal(orders.status, 200);
  assert.ok(Array.isArray((await orders.json()).orders));
  assert.equal(orders.headers.get("Cache-Control"), "private, no-store");

  const missing = await get("/admin/api/orders/not-a-record");
  assert.equal(missing.headers.get("Cache-Control"), "private, no-store");

  // Without a D1 binding the dashboard answers through the same analyticsJson helper.
  delete env.ANALYTICS_DB;
  const analytics = await get("/admin/api/analytics?days=7");
  assert.equal(analytics.status, 503);
  assert.equal(analytics.headers.get("Cache-Control"), "private, no-store");
});
