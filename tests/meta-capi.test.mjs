// Meta Conversions API relay: consent, validation, data minimisation, rate limits,
// server-verified Purchase and duplicate protection. Uses fake tokens and an in-memory D1.
import test from "node:test";
import assert from "node:assert/strict";
import { d1Database } from "./helpers/customer-order-fixture.mjs";
import { ensureOrderAccess, purchaseSnapshot } from "../functions/_customer-orders.js";
import { buildMetaEvent, metaEventsResponse, resetMetaRateLimits, validateBrowserEvent } from "../functions/_meta-capi.js";

const origin = "https://popekyrillos.store";
const FAKE_TOKEN = "fake-meta-token-for-local-tests";

function env(extra = {}) {
  return { META_CAPI_ENABLED: "true", META_CAPI_TOKEN: FAKE_TOKEN, AIRTABLE_TOKEN: "test-secret", AIRTABLE_BASE_ID: "appTest", AIRTABLE_TABLE_NAME: "Orders", ANALYTICS_DB: d1Database(), ...extra };
}

function req(body, { cookie = "pk_mkt_consent=granted", headers = {}, method = "POST", ip = "198.51.100.7" } = {}) {
  return new Request(`${origin}/api/meta-events`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Test)", "CF-Connecting-IP": ip, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {})
  });
}

function captureMeta(t, { fail = false } = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname !== "graph.facebook.com") throw new Error(`Unexpected external request: ${url.hostname}`);
    calls.push({ url: url.href, body: JSON.parse(init.body) });
    return fail ? new Response("{}", { status: 500 }) : Response.json({ events_received: 1 });
  });
  return calls;
}

async function call(e, body, options) {
  const response = await metaEventsResponse(req(body, options), e, null);
  return response.status;
}

async function realOrder(e, { createdAt = null, total = 240, quantity = 2 } = {}) {
  const order = { address: "القاهرة", deliveryType: "شحن", orderStatus: "جديد", total };
  const items = [{ productName: "طقم صلبان كوريان", sku: "popek-corian-cross-set-1", quantity, unitPrice: total / quantity }];
  const access = await ensureOrderAccess(e, "rec00000000000001", purchaseSnapshot(order, items));
  if (createdAt) await e.ANALYTICS_DB.prepare("UPDATE customer_order_access SET created_at = ? WHERE token = ?").bind(createdAt, access.token).run();
  return access.token;
}

test.beforeEach(() => resetMetaRateLimits());

test("browser body is whitelisted: no names, ids, search terms, URLs or customer fields", () => {
  assert.deepEqual(validateBrowserEvent({ event: "PageView", consent: true }), { event: "PageView" });
  assert.deepEqual(validateBrowserEvent({ event: "AddToCart", consent: true, value: 240, numItems: 2 }), { event: "AddToCart", value: 240, numItems: 2 });
  for (const extra of [{ searchTerm: "صليب" }, { url: "/products/x" }, { productName: "x" }, { contentIds: ["a"] }, { phone: "01012345678" }, { email: "a@b.c" }]) {
    assert.equal(validateBrowserEvent({ event: "Search", consent: true, ...extra }).error, "unexpected_field");
  }
  assert.equal(validateBrowserEvent({ event: "PageView" }).error, "consent_required");
  assert.equal(validateBrowserEvent({ event: "Lead", consent: true }).error, "invalid_event");
  assert.equal(validateBrowserEvent({ event: "AddToCart", consent: true, value: -5, numItems: 1 }).error, "invalid_value");
  assert.equal(validateBrowserEvent({ event: "AddToCart", consent: true, value: 10, numItems: 1.5 }).error, "invalid_num_items");
  assert.equal(validateBrowserEvent({ event: "Purchase", consent: true, value: 99999, token: "a".repeat(64) }).error, "unexpected_field");
});

test("Meta payload carries the minimum: origin-only URL, no product data, UA required, IP off", () => {
  const event = buildMetaEvent({ event: "AddToCart", value: 240, numItems: 2, eventId: "id1", eventTime: 1, userAgent: "UA", fbc: "fb.1.1730000000000.AbCdEfGhIjKl", ip: "" });
  assert.deepEqual(event, {
    event_name: "AddToCart", event_time: 1, event_id: "id1", action_source: "website", event_source_url: `${origin}/`,
    user_data: { client_user_agent: "UA", fbc: "fb.1.1730000000000.AbCdEfGhIjKl" },
    custom_data: { currency: "EGP", value: 240, num_items: 2 }
  });
  assert.equal(buildMetaEvent({ event: "PageView", eventId: "x", eventTime: 1, userAgent: "UA", fbc: "not-a-click-id" }).user_data.fbc, undefined);
  assert.equal(buildMetaEvent({ event: "Search", eventId: "x", eventTime: 1, userAgent: "UA" }).custom_data, undefined);
});

test("nothing reaches Meta when disabled (default), without consent, or from another site", async (t) => {
  const calls = captureMeta(t);
  assert.equal(await call({ ANALYTICS_DB: d1Database() }, { event: "PageView", consent: true }), 202);
  assert.equal(await call(env({ META_CAPI_TOKEN: "" }), { event: "PageView", consent: true }), 202);
  assert.equal(await call(env(), { event: "PageView", consent: true }, { cookie: "" }), 202);
  assert.equal(await call(env(), { event: "PageView", consent: true }, { cookie: "pk_mkt_consent=denied" }), 202);
  assert.equal(await call(env(), { event: "PageView", consent: true }, { headers: { Origin: "https://evil.example" } }), 403);
  assert.equal(await call(env(), { event: "PageView", consent: true }, { headers: { Origin: "", "Sec-Fetch-Site": "cross-site" } }), 403);
  assert.equal(await call(env(), "x".repeat(3000)), 413);
  assert.equal(await call(env(), "{bad"), 400);
  assert.equal((await metaEventsResponse(req(null, { method: "GET" }), env(), null)).status, 405);
  assert.equal(calls.length, 0);
});

test("an accepted event goes to the official dataset with the token in the body, not the URL", async (t) => {
  const calls = captureMeta(t);
  assert.equal(await call(env(), { event: "ViewContent", consent: true, value: 150 }, { cookie: "pk_mkt_consent=granted; _fbc=fb.1.1730000000000.AbCdEfGhIjKl; pk_session=secret" }), 202);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d\/1182812737752728\/events$/);
  assert.ok(!calls[0].url.includes(FAKE_TOKEN));
  assert.equal(calls[0].body.access_token, FAKE_TOKEN);
  const [sent] = calls[0].body.data;
  assert.equal(sent.event_source_url, `${origin}/`);
  assert.deepEqual(Object.keys(sent.user_data).sort(), ["client_user_agent", "fbc"]);
  assert.deepEqual(sent.custom_data, { currency: "EGP", value: 150 });
  assert.ok(!JSON.stringify(calls[0].body).includes("secret"));
  assert.ok(!JSON.stringify(calls[0].body).includes("198.51.100.7"));
});

test("IP is sent only when META_CAPI_SEND_IP is true; test_event_code only when set", async (t) => {
  const calls = captureMeta(t);
  await call(env({ META_CAPI_SEND_IP: "true", META_TEST_EVENT_CODE: "TEST12345" }), { event: "PageView", consent: true });
  assert.equal(calls[0].body.data[0].user_data.client_ip_address, "198.51.100.7");
  assert.equal(calls[0].body.test_event_code, "TEST12345");
});

test("per-IP rate limit stops floods", async (t) => {
  captureMeta(t);
  const e = env();
  let last = 0;
  for (let i = 0; i < 121; i++) last = await call(e, { event: "PageView", consent: true });
  assert.equal(last, 429);
  assert.equal(await call(e, { event: "PageView", consent: true }, { ip: "198.51.100.99" }), 202);
});

test("Purchase needs a real recent order; value and items come from the server, sent once", async (t) => {
  const calls = captureMeta(t);
  const e = env();
  const token = await realOrder(e);
  assert.equal(await call(e, { event: "Purchase", consent: true, token }), 202);
  assert.equal(await call(e, { event: "Purchase", consent: true, token }), 202);
  assert.equal(await call(e, { event: "Purchase", consent: true, token }, { ip: "203.0.113.5" }), 202);
  assert.equal(calls.length, 1);
  const [sent] = calls[0].body.data;
  assert.equal(sent.event_name, "Purchase");
  assert.deepEqual(sent.custom_data, { currency: "EGP", value: 240, num_items: 2 });
  assert.match(sent.event_id, /^p_[a-f0-9]{32}$/);
  const raw = JSON.stringify(calls[0].body);
  for (const leak of [token, "rec00000000000001", "صلبان", "corian", "القاهرة"]) assert.ok(!raw.includes(leak), leak);
});

test("fake, unknown or old order tokens never create a Purchase", async (t) => {
  const calls = captureMeta(t);
  const e = env();
  await realOrder(e);
  assert.equal(await call(e, { event: "Purchase", consent: true, token: "f".repeat(64) }), 202);
  assert.equal(await call(e, { event: "Purchase", consent: true, token: "not-a-token" }), 400);
  const e2 = env();
  const oldToken = await realOrder(e2, { createdAt: "2026-01-01 10:00:00" });
  assert.equal(await call(e2, { event: "Purchase", consent: true, token: oldToken }), 202);
  assert.equal(calls.length, 0);
});

test("a failed send can be retried once and is still never duplicated", async (t) => {
  const e = env();
  const token = await realOrder(e);
  const failing = captureMeta(t, { fail: true });
  await call(e, { event: "Purchase", consent: true, token });
  assert.equal(failing.length, 1);
  t.mock.restoreAll();
  const ok = captureMeta(t);
  await call(e, { event: "Purchase", consent: true, token });
  await call(e, { event: "Purchase", consent: true, token });
  assert.equal(ok.length, 1);
  const row = await e.ANALYTICS_DB.prepare("SELECT status FROM meta_capi_events").first();
  assert.equal(row.status, "sent");
});

test("the endpoint never writes to the order tables", async (t) => {
  captureMeta(t);
  const e = env();
  const token = await realOrder(e);
  const before = JSON.stringify(await e.ANALYTICS_DB.prepare("SELECT * FROM customer_order_access").all());
  await call(e, { event: "Purchase", consent: true, token });
  assert.equal(JSON.stringify(await e.ANALYTICS_DB.prepare("SELECT * FROM customer_order_access").all()), before);
});

test("fake-token floods never write to D1 and hit the per-IP Purchase limit", async (t) => {
  const calls = captureMeta(t);
  const e = env();
  let last = 0;
  for (let i = 0; i < 11; i++) last = await call(e, { event: "Purchase", consent: true, token: i.toString(16).padStart(64, "0") });
  assert.equal(last, 429);
  const tables = (await e.ANALYTICS_DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map((r) => r.name);
  assert.ok(!tables.includes("meta_capi_events"), tables.join());
  assert.equal(calls.length, 0);
});

test("per-instance ceiling caps outbound calls to Meta", async (t) => {
  const calls = captureMeta(t);
  const e = env();
  let limited = 0;
  for (let i = 0; i < 610; i++) if ((await call(e, { event: "PageView", consent: true }, { ip: `198.51.${i >> 8}.${i & 255}` })) === 429) limited++;
  assert.equal(calls.length, 600);
  assert.equal(limited, 10);
});

test("preview/test Worker sends only with a Meta Test Events code", async (t) => {
  const calls = captureMeta(t);
  assert.equal(await call(env({ PREVIEW_MODE: "1" }), { event: "PageView", consent: true }), 202);
  assert.equal(calls.length, 0);
  await call(env({ PREVIEW_MODE: "1", META_TEST_EVENT_CODE: "TEST777" }), { event: "PageView", consent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.test_event_code, "TEST777");
});

test("Meta test Worker config is isolated from production data and secrets", async () => {
  const fs = await import("node:fs");
  const toml = fs.readFileSync(new URL("../wrangler.meta-test.toml", import.meta.url), "utf8");
  const prod = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const prodDbId = prod.match(/database_id = "([^"]+)"/)[1];
  assert.ok(!toml.includes(prodDbId));
  assert.ok(!toml.includes('database_name = "popekyrillos-analytics"'));
  assert.ok(!/\[\[routes\]\]|custom_domain|zone_name/.test(toml));
  assert.match(toml, /PREVIEW_MODE = "1"/);
  assert.match(toml, /META_CAPI_SEND_IP = "false"/);
  assert.ok(!/AIRTABLE|BOSTA|PAYMOB|FIREBASE|GITHUB_TOKEN|ANTHROPIC/.test(toml.replace(/^#.*$/gm, "")));
});
