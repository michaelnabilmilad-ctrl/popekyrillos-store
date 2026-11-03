// End-to-end run of the priest-name engraving feature against scripts/local-sandbox.mjs.
// Admin enables engraving on one real product, a customer adds the same cross twice with two
// names, checks out, and the admin orders page shows both names. Every request that is not to
// the local sandbox is aborted, so no real service is touched.
//   node scripts/e2e-cross-engraving.cjs http://localhost:8790 <screenshots folder>
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "http://localhost:8790";
const out = process.argv[3] || "e2e-shots";
const PRODUCT = "popek-corian-cross-set-2";
const ZONE = { x: 0.6385, y: 0.6, len: 0.33, thick: 0.05, angle: 90, fontMax: 0.52, fontMin: 0.38, weight: 0.03, padding: 0.08, curve: 0 };
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const state = async () => (await fetch(`${base}/__sandbox/state`)).json();

async function guard(context) {
  const blocked = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    blocked.push(url.hostname);
    return route.abort();
  });
  return blocked;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---------- 1. Admin: enable engraving on one product and publish (to the in-memory data branch)
  const admin = await browser.newContext({ viewport: { width: 1366, height: 1000 }, httpCredentials: { username: "local", password: "local" } });
  await guard(admin);
  const a = await admin.newPage();
  a.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
  a.on("dialog", (d) => d.accept());
  await a.goto(`${base}/admin`);
  await a.waitForFunction(() => document.querySelectorAll("[data-product-row]").length > 5, null, { timeout: 30000 });
  await a.fill("[data-search]", "popek-corian-cross-set-2");
  await a.click(`.row-actions [data-select-product="${PRODUCT}"]`);
  await a.waitForFunction(() => !document.querySelector("[data-editor]")?.hidden, null, { timeout: 15000 });
  await a.click('[data-editor-tab="engraving"]');
  await a.waitForSelector("[data-ae-body] [data-ae='enabled']");
  await a.check("[data-ae-body] [data-ae='enabled']");
  await a.click('[data-ae-image$="model-2-unboxed.webp"]');
  await a.evaluate((zone) => {
    for (const [k, v] of Object.entries(zone)) {
      const input = document.querySelector(`[data-ae-z="${k}"]`);
      if (!input) continue;
      input.value = v;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const finish = document.querySelector('[data-ae-s="finish"]');
    finish.value = "ivory"; finish.dispatchEvent(new Event("change", { bubbles: true }));
  }, ZONE);
  await a.waitForTimeout(1500);
  await a.locator('[data-editor-section="engraving"]').screenshot({ path: path.join(out, "01-admin-engraving-settings.png") });
  await a.click('[data-ae-act="apply"]');
  await a.waitForTimeout(300);
  check("admin: settings applied to the product draft", /حفظ ونشر/.test(await a.textContent("[data-ae-status]")));
  await a.click('[data-action="publish-products"]');
  let published = false;
  for (let i = 0; i < 40 && !published; i++) { await a.waitForTimeout(500); published = (await state()).engravingProducts.length > 0; }
  const afterPublish = await state();
  check("admin: «حفظ ونشر» saved engraving settings on the product", published, JSON.stringify(afterPublish.engravingProducts[0]?.engraving?.zone || {}));
  check("admin: only that product got engraving settings", afterPublish.engravingProducts.length === 1 && afterPublish.engravingProducts[0].id === PRODUCT);

  // ---------- 2. Customer on a phone
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  await guard(phone);
  const p = await phone.newPage();
  p.on("pageerror", (e) => errors.push(`product: ${e.message}`));
  await p.goto(`${base}/products/${PRODUCT}`);
  await p.waitForSelector(".pe .pe-choice");
  await p.locator(".pe").scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(out, "02-product-engraving-choice.png") });
  await p.click('.pe-choice input[value="name"]', { force: true });
  await p.fill("[data-pe-input]", "القمص يوحنا مرقس");
  await p.waitForTimeout(1200);
  await p.locator(".pe").screenshot({ path: path.join(out, "03-arabic-zoom.png") });
  // Add without confirming: blocked with a clear message
  await p.click("[data-add]");
  await p.waitForTimeout(200);
  const blockedMsg = await p.textContent("[data-pe-err]");
  check("customer: add is blocked until the name is confirmed", /أكّد/.test(blockedMsg), blockedMsg);
  await p.click('[data-pe-view="full"]');
  await p.waitForTimeout(1000);
  await p.locator('[data-pe-figure="full"]').screenshot({ path: path.join(out, "04-arabic-full-cross.png") });
  await p.click('[data-pe-view="zoom"]');
  await p.check("[data-pe-confirm]", { force: true });
  await p.click("[data-add]");
  await p.waitForTimeout(300);
  check("customer: Arabic name added", /القمص يوحنا مرقس/.test(await p.textContent("[data-message]")));

  // Same cross, second name in Coptic with the on-screen keypad
  await p.click('.pe-pills input[value="cop"]', { force: true });
  await p.fill("[data-pe-input]", "");
  for (const ch of ["Ⲙ", "Ⲏ", "Ⲛ", "Ⲁ"]) await p.click(`[data-pe-key="${ch}"]`);
  await p.waitForTimeout(1200);
  await p.locator(".pe").screenshot({ path: path.join(out, "05-coptic-zoom.png") });
  await p.check("[data-pe-confirm]", { force: true });
  await p.fill("[data-quantity]", "2");
  await p.click("[data-add]");
  await p.waitForTimeout(300);
  check("customer: Coptic name added (qty 2)", /ⲘⲎⲚⲀ/.test(await p.textContent("[data-message]")));

  // Too long: clear warning, not a tiny font
  await p.click('.pe-pills input[value="ar"]', { force: true });
  await p.fill("[data-pe-input]", "القمص بيشوي يوحنا مرقس عبد المسيح");
  await p.waitForTimeout(1000);
  const longMsg = await p.textContent("[data-pe-err]");
  check("customer: a too-long name shows a warning", /أطول/.test(longMsg), longMsg);
  await p.locator(".pe").screenshot({ path: path.join(out, "06-too-long.png") });
  await p.check("[data-pe-confirm]", { force: true });
  await p.click("[data-add]");
  const cartAfterLong = await p.evaluate(() => JSON.parse(localStorage.getItem(localStorage.getItem("pope-kyrillos-cart:active") || "pope-kyrillos-cart:guest") || "{}").items || []);
  check("customer: the too-long name is not added", cartAfterLong.length === 2, `${cartAfterLong.length} lines`);
  check("cart: same cross, two separate lines", cartAfterLong.every((i) => i.productId === PRODUCT) && new Set(cartAfterLong.map((i) => i.lineId)).size === 2);

  // ---------- 3. Cart and checkout
  await p.goto(`${base}/cart`);
  await p.waitForSelector(".cart-engraving");
  await p.screenshot({ path: path.join(out, "07-cart.png"), fullPage: true });
  const cartText = await p.textContent("[data-cart-page-items]");
  check("cart: both names and languages are shown", /القمص يوحنا مرقس/.test(cartText) && /ⲘⲎⲚⲀ/.test(cartText) && /القبطية/.test(cartText));
  await p.goto(`${base}/checkout`);
  await p.check('input[name="deliveryMethod"][value="pickup"]', { force: true });
  await p.fill("[data-checkout-name]", "عميل تجربة محلية");
  await p.fill("[data-checkout-phone]", "01012345678");
  await p.fill("[data-checkout-governorate]", "القاهرة").catch(() => {});
  await p.fill("[data-checkout-city]", "شبرا").catch(() => {});
  await p.fill("[data-checkout-address]", "عنوان تجربة").catch(() => {});
  await p.screenshot({ path: path.join(out, "08-checkout.png"), fullPage: true });
  await p.click('form button[type="submit"]');
  await p.waitForURL(/payment/, { timeout: 15000 });
  await p.click('[data-payment-action="pickupCash"]');
  let orders = [];
  for (let i = 0; i < 30 && !orders.length; i++) { await p.waitForTimeout(500); orders = (await state()).orders; }
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(out, "09-after-order.png"), fullPage: true });
  const s = await state();
  check("order: created in the local Airtable", s.orders.length === 1, `total ${s.orders[0]?.Total}`);
  const lines = (s.orders[0]?.Products || "").split("\n");
  check("order: two lines, each with its own name", lines.length === 2 && /«القمص يوحنا مرقس»/.test(lines[0]) && /«ⲘⲎⲚⲀ»/.test(lines[1]) && !/ⲘⲎⲚⲀ/.test(lines[0]), lines.join(" || "));
  check("order lines (ملاحظات): names not mixed", s.orderLines.length === 2 && /يوحنا/.test(s.orderLines[0].notes) && /ⲘⲎⲚⲀ/.test(s.orderLines[1].notes) && s.orderLines[1].quantity === 2, s.orderLines.map((l) => l.notes).join(" || "));
  check("order: total = 770 + 2×770", s.orders[0]?.Total === 2310, String(s.orders[0]?.Total));

  // ---------- 4. Admin orders page
  const o = await admin.newPage();
  o.on("pageerror", (e) => errors.push(`orders: ${e.message}`));
  await o.goto(`${base}/admin/orders`);
  await o.waitForSelector("[data-order-id]", { timeout: 20000 });
  await o.click("[data-order-id]");
  await o.waitForFunction(() => /الاسم على الصليب/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  const ordersText = await o.textContent("body");
  check("admin orders: names visible in the order details", /«القمص يوحنا مرقس»/.test(ordersText) && /«ⲘⲎⲚⲀ»/.test(ordersText));
  await o.screenshot({ path: path.join(out, "10-admin-order.png"), fullPage: true });

  // ---------- 5. A product without engraving stays unchanged
  const plain = await phone.newPage();
  await plain.goto(`${base}/products/popek-corian-cross-set-3`);
  await plain.waitForSelector("[data-add]");
  check("other products: no engraving section or scripts", !(await plain.$(".pe")) && !(await plain.$('script[src*="cross-engraving"]')));

  check("no page errors", errors.length === 0, errors.join(" | "));
  check("no request left the sandbox", s.blockedRequests.length === 0, s.blockedRequests.join(", "));
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ results, state: s }, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
