// Local browser QA for meta-consent.js on a built dist/ (static server, no real APIs).
// Usage: node scripts/qa-meta-consent.mjs <distDir>   (needs playwright + serve-handler)
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const handler = require("serve-handler");
const dist = process.argv[2] || "dist";
const results = [];
const check = (name, ok, info = "") => { results.push({ name, ok: Boolean(ok), info }); };
const server = http.createServer((q, s) => handler(q, s, { public: dist, cleanUrls: true })).listen(8812);
const base = "http://localhost:8812";
const browser = await chromium.launch();
const context = await browser.newContext();
const events = []; const metaHosts = []; const errors = [];
await context.route("**/api/meta-events", async (route) => { events.push(JSON.parse(route.request().postData() || "{}")); await route.fulfill({ status: 202, body: "" }); });
context.on("request", (r) => { if (/facebook\.(com|net)|fbcdn/.test(r.url())) metaHosts.push(r.url()); });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const cookies = async () => Object.fromEntries((await context.cookies()).map((c) => [c.name, c.value]));

await page.goto(`${base}/?fbclid=AbCdEfGhIjKl1234`); await wait(800);
check("B1 banner shown before any choice", await page.locator(".pk-consent").isVisible());
check("B1 no events and no marketing cookies before consent", events.length === 0 && !(await cookies())._fbc && !(await cookies())._fbp, JSON.stringify(events));
await page.locator('.pk-consent button[data-consent="denied"]').click(); await wait(300);
await page.evaluate(() => window.StoreAnalytics?.track?.("add_to_cart", { price: 100, quantity: 1 }));
check("B2 reject: no events, consent=denied, no _fbc", events.length === 0 && (await cookies()).pk_mkt_consent === "denied" && !(await cookies())._fbc);

await page.evaluate(() => window.PKMetaConsent.openSettings()); await wait(100);
await page.locator('.pk-consent button[data-consent="granted"]').click(); await wait(300);
const c1 = await cookies();
check("B3 accept: one PageView + _fbc from fbclid", events.filter((e) => e.event === "PageView").length === 1 && /^fb\.1\.\d+\.AbCdEfGhIjKl1234$/.test(c1._fbc || ""), c1._fbc);
check("B3 no _fbp cookie created (not needed for CAPI-only)", !c1._fbp);
events.length = 0;
await page.evaluate(() => { history.pushState({}, "", "/products/a"); history.replaceState({}, "", "/products/a"); history.pushState({}, "", "/products/a?q=x"); history.pushState({}, "", "/products/b"); });
await wait(200);
check("B4 PageView once per real path change", events.filter((e) => e.event === "PageView").length === 2, JSON.stringify(events));
events.length = 0;
await page.evaluate(() => { const t = window.StoreAnalytics.track; t("view_product", { productId: "popek-corian-cross-set-1", productName: "طقم صلبان", price: 150, quantity: 1 }); t("add_to_cart", { productName: "طقم صلبان", price: 150, quantity: 2 }); t("search", { searchTerm: "صل" }); t("search", { searchTerm: "صلي" }); t("search", { searchTerm: "صليب" }); t("begin_checkout", { quantity: 3, price: 450, currency: "EGP" }); t("begin_checkout", { quantity: 3, price: 450, currency: "EGP" }); });
await wait(1900);
const by = (n) => events.filter((e) => e.event === n);
check("B5 ViewContent value only", by("ViewContent").length === 1 && by("ViewContent")[0].value === 150);
check("B5 AddToCart value = price x qty", by("AddToCart").length === 1 && by("AddToCart")[0].value === 300 && by("AddToCart")[0].numItems === 2);
check("B5 Search once, without the term", by("Search").length === 1 && !JSON.stringify(by("Search")).includes("صل"));
check("B5 InitiateCheckout once per cart", by("InitiateCheckout").length === 1 && by("InitiateCheckout")[0].value === 450);

const token = "ab".repeat(32);
events.length = 0;
await page.goto(`${base}/order-success#${token}`); await wait(800);
check("B6 Purchase once on confirmation with token only", by("Purchase").length === 1 && Object.keys(by("Purchase")[0]).sort().join() === "consent,event,token");
events.length = 0;
await page.reload(); await wait(800); await page.goBack().catch(() => {}); await page.goForward().catch(() => {}); await wait(800);
check("B6 refresh/back: no second Purchase", by("Purchase").length === 0, JSON.stringify(events));
events.length = 0;
await page.goto(`${base}/order-success`); await wait(500);
check("B6 confirmation without token: no Purchase", by("Purchase").length === 0);

await page.evaluate(() => window.PKMetaConsent.revoke()); await wait(200);
events.length = 0;
await page.goto(`${base}/`); await wait(500);
await page.evaluate(() => window.StoreAnalytics?.track?.("add_to_cart", { price: 100, quantity: 1 }));
const c2 = await cookies();
check("B7 revoke: _fbc deleted, no events afterwards", !c2._fbc && c2.pk_mkt_consent === "denied" && events.length === 0, JSON.stringify(c2));

check("B8 browser never contacted Meta", metaHosts.length === 0, metaHosts.join(" "));
for (const p of ["/cart", "/checkout", "/payment", "/policies"]) { await page.goto(base + p); await wait(400); }
check("B9 no JS errors from meta-consent on site pages", !errors.some((m) => /PKMeta|meta-consent|pk-consent/.test(m)), errors.join(" | "));

await browser.close(); server.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + r.info}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
