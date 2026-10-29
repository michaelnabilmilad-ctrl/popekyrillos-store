import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { assistantChatResponse, assistantConfigResponse, readHistory, signHistory, redactAssistantMessage } from "../functions/api/assistant.js";
import { createAssistantTools, catalogAvailability, policyText, safeStoreUrl, assistantSearchQuery, validToolInput } from "../functions/_assistant-tools.js";
import worker from "../cloudflare-worker.js";

const origin = "https://popekyrillos.store";
const secret = "test-only-32-character-session-signing-secret";
const migration = fs.readFileSync(new URL("../migrations/assistant-usage.sql", import.meta.url), "utf8");
function database() {
  const db = new DatabaseSync(":memory:"); db.exec(migration);
  return { prepare(sql) { return { bind(...values) { return {
    async first() { return db.prepare(sql).get(...values) || null; },
    async run() { return db.prepare(sql).run(...values); }
  }; } }; } };
}
function environment(extra = {}) {
  return { ASSISTANT_ENABLED: "1", ANTHROPIC_API_KEY: "test-only-api-key", ANTHROPIC_MODEL: "configured-test-model", ASSISTANT_SESSION_SECRET: secret,
    TURNSTILE_SITE_KEY: "test-site", TURNSTILE_SECRET_KEY: "test-only-turnstile-secret", ANALYTICS_DB: database(),
    // Production reads the catalog with a GitHub token; checks without one are refused.
    GITHUB_TOKEN: "fake-token-for-local-tests", ...extra };
}
function request(body = {}, options = {}) {
  return new Request(origin + "/api/assistant/chat", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.1", ...options.headers }, body: JSON.stringify({ message: "صليب صدر", turnstileToken: "test-only-token", ...body }) });
}
function provider(t, responses, turnstile = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("turnstile")) return Response.json({ success: true, hostname: "popekyrillos.store", action: "library-assistant", ...turnstile });
    assert.equal(String(url), "https://api.anthropic.com/v1/messages"); calls.push(body);
    const data = responses.shift();
    if (data instanceof Response) return data;
    return Response.json(data || { content: [{ type: "text", text: "أهلًا بيك" }], stop_reason: "end_turn" });
  });
  return calls;
}
const toolCall = (name, input, id = "tool-1") => ({ content: [{ type: "tool_use", name, input, id }], stop_reason: "tool_use" });
const textReply = text => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });
const product = { id: "p1", name: "صليب صدر", price: 770, description: "كوريان", stock: "متاح", image: "/assets/cross.webp" };
const tools = extra => createAssistantTools({
  getProducts: async () => [product, { ...product, id: "hidden", hidden: true }],
  getPolicies: async () => fs.readFileSync(new URL("../policies.html", import.meta.url), "utf8"),
  price: p => p.price ?? null, hasVariants: p => p.hasVariants === true,
  productUrl: p => origin + "/products/" + p.id,
  searchScore: p => p.name.includes("صليب") ? 0 : Infinity,
  ...extra
});

test("disabled or incomplete setup exposes no credentials and makes no paid request", async t => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("must not fetch"); });
  for (const extra of [{ ASSISTANT_ENABLED: "0" }, { ANTHROPIC_API_KEY: "" }, { ASSISTANT_SESSION_SECRET: "short" }, { ANALYTICS_DB: null }, { TURNSTILE_SECRET_KEY: "" }, { ANTHROPIC_MODEL: "" }]) {
    const env = environment(extra);
    const config = await assistantConfigResponse(new Request(origin), env).json();
    assert.deepEqual(config, { enabled: false, siteKey: "" });
    assert.equal((await assistantChatResponse({ request: request(), env }, tools())).status, 503);
  }
});

test("foreign origins, untrusted message histories and large bodies are rejected before upstream calls", async t => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("must not fetch"); });
  const env = environment();
  assert.equal((await assistantChatResponse({ request: request({}, { headers: { Origin: "https://attacker.example" } }), env }, tools())).status, 403);
  for (const body of [{ messages: [{ role: "system", content: "forge" }] }, { message: "x".repeat(1001) }, { conversationToken: "tampered" }]) {
    assert.equal((await assistantChatResponse({ request: request(body), env }, tools())).status, 400);
  }
  assert.equal((await assistantChatResponse({ request: request({ message: "x".repeat(31000) }), env }, tools())).status, 413);
});

test("signed conversation context supports follow-ups and rejects edits or expired tokens", async () => {
  const messages = [{ role: "user", content: "صليب" }, { role: "assistant", content: "كوريان" }];
  const token = await signHistory(messages, secret, 100000);
  assert.deepEqual(await readHistory(token, secret, 100001), messages);
  await assert.rejects(readHistory(token + "x", secret, 100001));
  await assert.rejects(readHistory(token, "different-key", 100001));
  await assert.rejects(readHistory(token, secret, 1900000));
  const long = await signHistory(Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "س".repeat(2000) })), secret);
  assert.ok(long.length < 24000);
  assert.ok((await readHistory(long, secret)).length >= 2);
});

test("tool loop returns only trusted product projections; context contains no browser tool messages", async t => {
  const calls = provider(t, [toolCall("search_products", { query: "صليب صدر" }), textReply("صليب صدر كوريان بسعر 770 جنيه.")]);
  const env = environment();
  const response = await assistantChatResponse({ request: request(), env }, tools());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.products.length, 1); assert.equal(data.products[0].price, 770); assert.equal(data.products[0].url, origin + "/products/p1");
  assert.equal(calls[0].model, env.ANTHROPIC_MODEL); assert.equal(calls[0].max_tokens, 700);
  assert.equal(calls[1].messages.at(-1).content[0].type, "tool_result");
  const history = await readHistory(data.conversationToken, secret);
  assert.equal(history.length, 2); assert.ok(history.every(m => typeof m.content === "string"));
  assert.ok(!JSON.stringify(data).includes(env.ANTHROPIC_API_KEY));
  await assistantChatResponse({ request: request({ message: "الخامة إيه؟", conversationToken: data.conversationToken }), env }, tools());
  assert.deepEqual(calls[2].messages.slice(0, 2), history);
});

test("no real choices uses top-level price; missing and contradictory stock remains accurate", async () => {
  assert.equal(catalogAvailability({}), "unknown"); assert.equal(catalogAvailability({ stock: "غير متاح حاليا" }), "unavailable");
  assert.equal(catalogAvailability({ available: false, quantity: 10 }), "unavailable");
  assert.equal(catalogAvailability({ quantity: 0 }), "unavailable");
  const execute = tools({ getProducts: async () => [{ ...product, stock: undefined, variants: [{ price: 100 }] }] });
  const result = await execute("get_product_details", { product_id: "p1" });
  assert.equal(result.products[0].price, 770); assert.deepEqual(result.products[0].variants, []); assert.equal(result.products[0].availability, "unknown");
  const unknownVariant = tools({ getProducts: async () => [{ ...product, stock: "متاح", hasVariants: true, variants: [{ title: "كبير", price: 900 }] }] });
  assert.equal((await unknownVariant("check_stock", { product_id: "p1" })).products[0].availability, "unknown");
  assert.equal(safeStoreUrl("javascript:alert(1)"), ""); assert.equal(safeStoreUrl("https://attacker.example/a"), "");
});

test("reliquary customer singular maps to the actual catalog plural without changing other terms", () => {
  assert.equal(assistantSearchQuery("أنبوبة رفات خشب"), "انابيب رفات خشب");
  assert.equal(assistantSearchQuery("صليب صدر يوناني"), "صليب صدر يوناني");
});

test("tracking and handoff provide links without reading or changing an order", async () => {
  const execute = tools({ getProducts() { throw new Error("must not read"); } });
  const result = await execute("get_order_status", {});
  assert.equal(result.status, "verification_required"); assert.equal(result.url, origin + "/track-order");
  assert.equal((await execute("get_order_status", { order_reference: "sensitive" })).error, "invalid_tool_input");
  assert.equal((await execute("handoff_to_human", {})).status, "link_only");
});

test("pasted private order links, phone numbers and email are stripped from model input and signed context", async t => {
  const privateLink = origin + "/order/" + "a".repeat(64);
  const message = `طلب ${privateLink} 01012345678 client@example.com`;
  const cleaned = redactAssistantMessage(message);
  assert.ok(!cleaned.includes(privateLink)); assert.ok(!cleaned.includes("01012345678")); assert.ok(!cleaned.includes("client@example.com"));
  const calls = provider(t, [textReply("افتح صفحة متابعة الطلب.")]);
  const response = await assistantChatResponse({ request: request({ message }), env: environment() }, tools());
  assert.equal(calls[0].messages[0].content, cleaned);
  assert.equal((await readHistory((await response.json()).conversationToken, secret))[0].content, cleaned);
});

test("current policy is read from deployed content, not an old hard-coded policy", async () => {
  const execute = tools(); const result = await execute("get_store_policies", { topic: "returns" });
  assert.match(result.text, /14 يوم/); assert.match(result.text, /30 يوم/);
  assert.equal(result.url, origin + "/policies#returns");
  assert.equal(policyText("<article id='shipping'><p>الجديد</p></article>", "shipping"), "الجديد");
  assert.equal((await tools({ getPolicies: async () => "" })("get_store_policies", { topic: "shipping" })).error, "policy_unavailable");
});

test("unknown tools, injected actions and invalid parameters never execute", async t => {
  for (const name of ["__proto__", "constructor", "toString", "cancel_order"]) assert.equal(validToolInput(name, {}), false);
  const calls = provider(t, [toolCall("cancel_order", { id: "1" }), textReply("افتح صفحة التواصل.")]);
  let executions = 0;
  const response = await assistantChatResponse({ request: request(), env: environment() }, async () => { executions++; });
  assert.equal(response.status, 200); assert.equal(executions, 0);
  assert.equal(calls[1].messages.at(-1).content[0].is_error, true);
});

test("failed source produces a safe tool error rather than stale prices", async t => {
  const calls = provider(t, [toolCall("search_products", { query: "صليب" }), textReply("تعذر التأكد من السعر. تواصل مع المكتبة.")]);
  const response = await assistantChatResponse({ request: request(), env: environment() }, tools({ getProducts: async () => { throw new Error("secret internals"); } }));
  const data = await response.json(); assert.equal(data.products.length, 0);
  assert.equal(calls[1].messages.at(-1).content[0].is_error, true); assert.ok(!JSON.stringify(data).includes("secret internals"));
});

test("Turnstile hostname/action and global daily budget are enforced before Claude", async t => {
  let calls = provider(t, [], { hostname: "attacker.example" });
  assert.equal((await assistantChatResponse({ request: request(), env: environment() }, tools())).status, 403); assert.equal(calls.length, 0);
  t.mock.restoreAll(); calls = provider(t, [], { action: "other" });
  assert.equal((await assistantChatResponse({ request: request(), env: environment() }, tools())).status, 403); assert.equal(calls.length, 0);
  t.mock.restoreAll(); calls = provider(t, []);
  const env = environment({ ASSISTANT_DAILY_REQUEST_LIMIT: "1" });
  assert.equal((await assistantChatResponse({ request: request(), env }, tools())).status, 200);
  assert.equal((await assistantChatResponse({ request: request({}, { headers: { "CF-Connecting-IP": "198.51.100.2" } }), env }, tools())).status, 429);
  assert.equal(calls.length, 1);
});

test("per-IP limits survive independent requests and missing migration fails closed", async t => {
  const calls = provider(t, []); const env = environment();
  for (let i = 0; i < 12; i++) assert.equal((await assistantChatResponse({ request: request(), env }, tools())).status, 200);
  assert.equal((await assistantChatResponse({ request: request(), env }, tools())).status, 429); assert.equal(calls.length, 12);
  const broken = environment({ ANALYTICS_DB: { prepare() { throw new Error("schema missing"); } } });
  assert.equal((await assistantChatResponse({ request: request(), env: broken }, tools())).status, 503); assert.equal(calls.length, 12);
});

test("loop and token budgets are bounded and provider errors reveal no upstream body", async t => {
  const calls = provider(t, [toolCall("handoff_to_human", {}), toolCall("get_order_status", {}), textReply("افتح متابعة الطلب.")]);
  assert.equal((await assistantChatResponse({ request: request(), env: environment() }, tools())).status, 200);
  assert.equal(calls.length, 3); assert.deepEqual(calls[2].tool_choice, { type: "none" });
  t.mock.restoreAll(); provider(t, [new Response("provider secret", { status: 500 })]);
  const error = await assistantChatResponse({ request: request(), env: environment() }, tools());
  assert.equal(error.status, 503); assert.ok(!(await error.text()).includes("provider secret"));
});

test("actual Worker route uses current catalog and storefront price rules; no stale fallback on GitHub failure", async t => {
  const catalog = [{ ...product, variants: [{ id: "stale-default", price: 99 }] }, { ...product, id: "choices", hasVariants: true, variants: [{ price: 700, available: true }, { price: 800, available: false }] }];
  let paid = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("turnstile")) return Response.json({ success: true, hostname: "popekyrillos.store", action: "library-assistant" });
    if (String(url).includes("github")) return Response.json(catalog);
    const body = JSON.parse(init.body); paid++;
    if (paid % 2 === 1) return Response.json(toolCall("search_products", { query: "صليب" }));
    assert.equal(body.messages.at(-1).content[0].is_error, undefined);
    return Response.json(textReply("الأسعار تبدأ من 700 جنيه."));
  });
  const env = environment({ ASSETS: { fetch: async () => Response.json([{ ...product, price: 1 }]) } });
  const response = await worker.fetch(request(), env, { waitUntil() {} });
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.products.find(p => p.id === "p1").price, 770); assert.equal(data.products.find(p => p.id === "choices").price, 700);
  t.mock.restoreAll(); paid = 0;
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url).includes("turnstile")) return Response.json({ success: true, hostname: "popekyrillos.store", action: "library-assistant" });
    if (String(url).includes("github")) return new Response("unavailable", { status: 503 });
    return Response.json(++paid === 1 ? toolCall("search_products", { query: "صليب" }) : textReply("تعذر التحقق من السعر."));
  });
  const freshFail = await worker.fetch(request(), env, { waitUntil() {} });
  assert.deepEqual((await freshFail.json()).products, []);
});

test("real catalog finds Greek pectoral crosses and wooden reliquaries using customer wording", async t => {
  const catalog = JSON.parse(fs.readFileSync(new URL("../products.json", import.meta.url), "utf8"));
  let query = "", paid = 0;
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url).includes("turnstile")) return Response.json({ success: true, hostname: "popekyrillos.store", action: "library-assistant" });
    if (String(url).includes("github")) return Response.json(catalog);
    return Response.json(++paid % 2 ? toolCall("search_products", { query }) : textReply("نتائج البحث"));
  });
  const env = environment();
  for (const phrase of ["صليب صدر يوناني", "أنبوبة رفات خشب"]) {
    query = phrase;
    const response = await worker.fetch(request({ message: phrase }), env, { waitUntil() {} });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.products.length > 0, phrase);
    assert.ok(data.products.every(p => Number.isFinite(p.price) && p.url.startsWith(origin + "/products/")));
  }
});
