// Access gate of the separate Meta test Worker (workers.dev): fails closed, needs a typed key,
// signed expiring cookie, brute-force limit, and is never active in production.
import test from "node:test";
import assert from "node:assert/strict";
import { resetTestAccessFailures, testAccessGate } from "../functions/_test-access.js";

const KEY = "fake-test-access-key-0123456789abcdef";
const base = "https://popekyrillos-store-meta-test.example.workers.dev";
const env = (extra = {}) => ({ META_CAPI_PREVIEW: "1", META_TEST_ACCESS_KEY: KEY, ...extra });
const get = (path, headers = {}) => new Request(base + path, { headers: { Accept: "text/html", ...headers } });
const login = (key, ip = "203.0.113.5") => new Request(base + "/__test-access", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": ip },
  body: new URLSearchParams({ key }).toString()
});

test("production Worker is never gated", async () => {
  assert.equal(await testAccessGate(get("/"), { META_TEST_ACCESS_KEY: KEY }), null);
});

test("fails closed without a strong access key", async () => {
  assert.equal((await testAccessGate(get("/"), env({ META_TEST_ACCESS_KEY: "" }))).status, 503);
  assert.equal((await testAccessGate(get("/"), env({ META_TEST_ACCESS_KEY: "short" }))).status, 503);
});

test("no cookie: pages redirect to login, API returns 401", async () => {
  const page = await testAccessGate(get("/"), env());
  assert.equal(page.status, 303);
  assert.equal(page.headers.get("Location"), "/__test-access");
  const api = await testAccessGate(new Request(base + "/api/meta-events", { method: "POST", body: "{}" }), env());
  assert.equal(api.status, 401);
  assert.equal((await testAccessGate(get("/__test-access"), env())).status, 200);
});

test("wrong key refused; right key gives signed HttpOnly cookie that opens the site", async () => {
  resetTestAccessFailures();
  assert.equal((await testAccessGate(login("wrong"), env())).status, 401);
  const ok = await testAccessGate(login(KEY), env());
  assert.equal(ok.status, 303);
  const cookie = ok.headers.get("Set-Cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.ok(!cookie.includes(KEY), "cookie must not contain the key");
  const value = cookie.split(";")[0];
  assert.equal(await testAccessGate(get("/", { Cookie: value }), env()), null);
  const post = new Request(base + "/api/meta-events", { method: "POST", headers: { Cookie: value }, body: "{}" });
  assert.equal(await testAccessGate(post, env()), null, "Meta events from the logged-in browser pass");
});

test("forged, expired or other-key cookies are refused", async () => {
  resetTestAccessFailures();
  const value = (await testAccessGate(login(KEY), env())).headers.get("Set-Cookie").split(";")[0];
  const forged = value.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
  assert.equal((await testAccessGate(get("/", { Cookie: forged }), env())).status, 303);
  const later = Date.now() + 9 * 3600 * 1000;
  assert.equal((await testAccessGate(get("/", { Cookie: value }), env(), later)).status, 303);
  assert.equal((await testAccessGate(get("/", { Cookie: value }), env({ META_TEST_ACCESS_KEY: KEY + "x" }))).status, 303);
});

test("brute force is limited per IP and cross-site login is refused", async () => {
  resetTestAccessFailures();
  for (let i = 0; i < 10; i += 1) await testAccessGate(login("bad" + i, "198.51.100.9"), env());
  assert.equal((await testAccessGate(login(KEY, "198.51.100.9"), env())).status, 429);
  const cross = new Request(base + "/__test-access", { method: "POST", headers: { Origin: "https://evil.example" }, body: "key=" + KEY });
  assert.equal((await testAccessGate(cross, env())).status, 403);
});
