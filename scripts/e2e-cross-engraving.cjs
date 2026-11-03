// End-to-end run of the priest-name engraving feature against scripts/local-sandbox.mjs.
//   node scripts/e2e-cross-engraving.cjs http://localhost:8790 <screenshots folder>
// 1. Admin: engraving cannot be switched on before a colour and a checked writing area; then
//    it is set on ONE real product and published to the sandbox's in-memory data branch.
// 2. Phone layout at 320/360/375/390/430 px: nothing covers the preview or the form, zoom and
//    full-cross views, no sideways scrolling, the keyboard and the sticky add-to-cart bar.
// 3. Purchases: guest (no name, long Arabic name, Coptic with marks, same cross twice, a normal
//    product, quantity change, reload) and a signed-in customer (local stand-in for Firebase).
// 4. The server refuses a tampered name; the admin orders page shows every name.
// Every request that is not to the local sandbox is aborted, so no real service is touched.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { installFakeFirebase, USER } = require("./e2e-fake-firebase.cjs");

const base = process.argv[2] || "http://localhost:8790";
const out = process.argv[3] || "e2e-shots";
const PRODUCT = "popek-corian-cross-set-2";
const PLAIN = "atb3ho-10555319877797"; // a normal product (book), price 25
const ZONE = { x: 0.6385, y: 0.6, len: 0.33, thick: 0.05, angle: 90, fontMax: 0.52, fontMin: 0.38, weight: 0.03, padding: 0.08, curve: 0 };
const TEST_COLOR = "#f2ede2"; // test-only choice for this black cross; the real colour is Michael's call
const NAMES = { arLong: "القمص بيشوي يوحنا مرقس", cop: "Ⲁ̀ⲃⲃⲁ Ⲙⲏⲛⲁ", regAr: "أبونا داود", regEn: "Fr. Mark" };
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const state = async () => (await fetch(`${base}/__sandbox/state`)).json();
const shot = (name) => path.join(out, name);

async function guard(context) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    return route.abort();
  });
}
const cartItems = (page) => page.evaluate(() => {
  const key = localStorage.getItem("pope-kyrillos-cart:active") || "pope-kyrillos-cart:guest";
  return { key, items: JSON.parse(localStorage.getItem(key) || "{}").items || [] };
});

async function openEngraving(p, id = PRODUCT) {
  await p.goto(`${base}/products/${id}`);
  await p.waitForSelector(".pe .pe-choice");
  await p.click('.pe-choice input[value="name"]', { force: true });
  await p.waitForSelector("[data-pe-body]:not([hidden])");
}
async function addName(p, name, lang = "ar", qty = 1) {
  await p.click(`.pe-pills input[value="${lang}"]`, { force: true });
  await p.fill("[data-pe-input]", name);
  await p.waitForFunction(() => document.querySelector("[data-pe-summary]")?.textContent || document.querySelector("[data-pe-err]")?.textContent, null, { timeout: 8000 });
  await p.waitForTimeout(400);
  await p.check("[data-pe-confirm]", { force: true });
  await p.fill("[data-quantity]", String(qty));
  await p.click("[data-add]");
  await p.waitForTimeout(300);
  return p.textContent("[data-message]");
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---------- 1. Admin
  const admin = await browser.newContext({ viewport: { width: 1366, height: 1000 }, httpCredentials: { username: "local", password: "local" } });
  await guard(admin);
  const a = await admin.newPage();
  a.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
  a.on("dialog", (d) => d.accept());
  await a.goto(`${base}/admin`);
  await a.waitForFunction(() => document.querySelectorAll("[data-product-row]").length > 5, null, { timeout: 30000 });
  await a.fill("[data-search]", PRODUCT);
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
    finish.value = "filled"; finish.dispatchEvent(new Event("change", { bubbles: true }));
  }, ZONE);
  check("admin: no writing colour is pre-selected", (await a.inputValue("[data-ae-color]")) === "");
  await a.click('[data-ae-act="apply"]');
  const noColor = await a.textContent("[data-ae-status]");
  check("admin: cannot enable before choosing the writing colour", /لون الكتابة/.test(noColor), noColor);
  await a.selectOption("[data-ae-color]", TEST_COLOR);
  await a.click('[data-ae-act="apply"]');
  const noZone = await a.textContent("[data-ae-status]");
  check("admin: cannot enable before checking the writing area", /مراجعة مكان الكتابة/.test(noZone) && !/لون الكتابة/.test(noZone), noZone);
  await a.check('[data-ae="confirmed"]');
  // Moving the area again clears the check
  await a.evaluate(() => { const s = document.querySelector('[data-ae-z="x"]'); s.value = "0.6386"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  check("admin: moving the writing area asks to check it again", !(await a.isChecked('[data-ae="confirmed"]')));
  await a.evaluate(() => { const s = document.querySelector('[data-ae-z="x"]'); s.value = "0.6385"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  await a.check('[data-ae="confirmed"]');
  await a.waitForTimeout(1500);
  await a.locator('[data-editor-section="engraving"]').screenshot({ path: shot("01-admin-engraving-settings.png") });
  await a.click('[data-ae-act="apply"]');
  await a.waitForTimeout(300);
  check("admin: settings applied to the product draft", /حفظ ونشر/.test(await a.textContent("[data-ae-status]")));
  await a.click('[data-action="publish-products"]');
  let published = false;
  for (let i = 0; i < 40 && !published; i++) { await a.waitForTimeout(500); published = (await state()).engravingProducts.length > 0; }
  const afterPublish = await state();
  const saved = afterPublish.engravingProducts[0]?.engraving;
  check("admin: «حفظ ونشر» saved the settings with colour and checked area", published && saved?.zone?.color === TEST_COLOR && saved?.zone?.confirmed === true && saved?.enabled === true, JSON.stringify(saved?.zone || {}));
  check("admin: only that product has engraving (not all crosses)", afterPublish.engravingProducts.length === 1 && afterPublish.engravingProducts[0].id === PRODUCT);

  // ---------- 2. Phone layout at five widths
  const layout = [];
  for (const width of [320, 360, 375, 390, 430]) {
    const height = width <= 360 ? 640 : width === 430 ? 932 : width === 390 ? 844 : 667;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent });
    await guard(ctx);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`layout ${width}: ${e.message}`));
    await openEngraving(p);
    await p.fill("[data-pe-input]", "القمص يوحنا مرقس");
    await p.waitForTimeout(1200);
    const typingBar = await p.$eval(".product-buy-bar", (b) => b.classList.contains("is-visible"));
    await p.click(".pe-head h2");
    await p.locator(".pe-view").evaluate((n) => n.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const bar = document.querySelector(".product-buy-bar");
      const vis = bar.classList.contains("is-visible");
      const covered = [];
      // The site's own sticky header sits at the top; content scrolling under it is normal.
      const headerBottom = Math.max(0, ...[...document.querySelectorAll("header, .site-header")].map((h) => (["sticky", "fixed"].includes(getComputedStyle(h).position) ? h.getBoundingClientRect().bottom : 0)));
      for (const sel of ["[data-pe-input]", "[data-pe-zoom]", ".pe-view button", ".pe-confirm", ".pe-note"]) {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        for (const fy of [0.15, 0.5, 0.85]) {
          const x = r.left + r.width / 2, y = r.top + r.height * fy;
          if (y < headerBottom + 1 || y > innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && !el.contains(hit) && !hit.contains(el) && !hit.closest(".pe")) covered.push(`${sel} by ${hit.className || hit.tagName}`);
        }
      }
      const zoom = document.querySelector("[data-pe-zoom]").getBoundingClientRect();
      const wide = [...document.querySelectorAll("body *")].filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(n).position !== "fixed" && !n.closest(".product-route-thumbs,[aria-hidden=true]"); }).map((n) => n.className || n.tagName).slice(0, 5);
      return { barVisible: vis, covered, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, zoomInside: zoom.left >= 0 && zoom.right <= innerWidth + 0.5, wide };
    });
    await p.screenshot({ path: shot(`m-${width}-1-zoom.png`) });
    await p.click('[data-pe-view="full"]');
    await p.waitForTimeout(900);
    await p.locator('[data-pe-figure="full"]').evaluate((n) => n.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(300);
    const full = await p.evaluate(() => { const r = document.querySelector("[data-pe-full]").getBoundingClientRect(); return { inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.height > 0 && r.height <= innerHeight, h: Math.round(r.height), bar: document.querySelector(".product-buy-bar").classList.contains("is-visible") }; });
    await p.screenshot({ path: shot(`m-${width}-2-full.png`) });
    await p.click('[data-pe-view="zoom"]');
    const backToZoom = await p.isVisible("[data-pe-zoom]");
    // Keyboard open (emulated: focused field, visible area shrinks to about half)
    await p.focus("[data-pe-input]");
    await p.setViewportSize({ width, height: Math.round(height * 0.52) });
    await p.locator("[data-pe-input]").evaluate((n) => n.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(300);
    const kb = await p.evaluate(() => { const r = document.querySelector("[data-pe-input]").getBoundingClientRect(); return { inputVisible: r.top >= 0 && r.bottom <= innerHeight, bar: document.querySelector(".product-buy-bar").classList.contains("is-visible") }; });
    if (width === 390) await p.screenshot({ path: shot("m-390-3-keyboard.png") });
    await p.setViewportSize({ width, height });
    await p.click(".pe-head h2");
    // Sticky bar further down the page
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(500);
    const stickyShown = await p.$eval(".product-buy-bar", (b) => b.classList.contains("is-visible"));
    if (width === 390) await p.screenshot({ path: shot("m-390-4-sticky-bar.png") });
    await p.click("[data-buy-bar-add]");
    await p.waitForTimeout(900);
    const sticky = await p.evaluate(() => { const err = document.querySelector("[data-pe-err]"); const r = document.querySelector(".pe").getBoundingClientRect(); return { err: err.textContent, kind: err.dataset.kind, peInView: r.top < innerHeight && r.bottom > 0 }; });
    if (width === 390) await p.screenshot({ path: shot("m-390-5-sticky-bar-needs-confirm.png") });
    const ok = !typingBar && !m.barVisible && !m.covered.length && m.overflow <= 0 && m.zoomInside && full.inside && !full.bar && backToZoom && kb.inputVisible && !kb.bar && stickyShown && /أكّد/.test(sticky.err) && sticky.peInView;
    layout.push({ width, typingBar, ...m, full, backToZoom, keyboard: kb, stickyShown, sticky });
    check(`phone ${width}px: no overlap, full preview, zoom/full, no sideways scroll, keyboard, sticky bar`, ok, JSON.stringify({ typingBar, ...m, full, kb, stickyShown, sticky: sticky.kind }));
    await ctx.close();
  }

  // ---------- 3a. Guest purchase
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  await guard(phone);
  const p = await phone.newPage();
  p.on("pageerror", (e) => errors.push(`guest: ${e.message}`));
  await p.goto(`${base}/products/${PRODUCT}`);
  await p.waitForSelector(".pe .pe-choice");
  const priceText = await p.textContent("[data-price]");
  check("price unchanged and no fee wording shown", /770|٧٧٠/.test(priceText) && !/رسوم/.test(await p.textContent(".pe")), priceText);
  await p.click("[data-add]"); // no engraving
  await p.waitForTimeout(300);
  check("guest: cross added without any name", /أضيف|تمت|السلة/.test(await p.textContent("[data-message]")));
  await p.click('.pe-choice input[value="name"]', { force: true });
  check("guest: long Arabic name added", (await addName(p, NAMES.arLong)).includes(NAMES.arLong));
  await p.locator(".pe").screenshot({ path: shot("10-guest-long-arabic.png") });
  await p.fill("[data-quantity]", "1");
  check("guest: Coptic name with marks added", (await addName(p, NAMES.cop, "cop")).includes(NAMES.cop.normalize("NFC")));
  await p.locator(".pe").screenshot({ path: shot("11-guest-coptic-marks.png") });
  // too long still refused
  await p.click('.pe-pills input[value="ar"]', { force: true });
  await p.fill("[data-pe-input]", "القمص بيشوي يوحنا مرقس عبد المسيح");
  await p.waitForTimeout(900);
  check("guest: a too-long name is refused with a clear warning", /أطول/.test(await p.textContent("[data-pe-err]")));
  await p.goto(`${base}/products/${PLAIN}`);
  await p.waitForSelector("[data-add]");
  check("normal product: no engraving section or scripts", !(await p.$(".pe")) && !(await p.$('script[src*="cross-engraving"]')));
  await p.click("[data-add]");
  await p.waitForTimeout(300);
  let cart = await cartItems(p);
  const crossLines = cart.items.filter((i) => i.productId === PRODUCT);
  check("cart: same cross 3 times = 3 separate lines (no name, Arabic, Coptic)", crossLines.length === 3 && new Set(crossLines.map((i) => i.lineId || "")).size === 3, crossLines.map((i) => i.engraving?.name || "—").join(" | "));
  await p.goto(`${base}/cart`);
  await p.waitForSelector(".cart-engraving");
  const arLine = (await cartItems(p)).items.find((i) => i.engraving?.name === NAMES.arLong);
  const arKey = await p.evaluate((lineId) => [...document.querySelectorAll("[data-cart-delta='1']")].find((b) => b.dataset.cartKey.endsWith(lineId))?.dataset.cartKey, arLine.lineId);
  await p.click(`[data-cart-delta="1"][data-cart-key="${arKey}"]`);
  await p.waitForTimeout(400);
  cart = await cartItems(p);
  const qty = (fn) => cart.items.find(fn)?.qty;
  check("cart: changing the Arabic line's quantity changes only that line", qty((i) => i.engraving?.name === NAMES.arLong) === 2 && qty((i) => i.engraving?.lang === "cop") === 1 && qty((i) => i.productId === PRODUCT && !i.engraving) === 1);
  await p.reload();
  await p.waitForSelector(".cart-engraving");
  const cartText = await p.textContent("[data-cart-page-items]");
  check("cart: after reload the names, languages and quantities are still there", cartText.includes(NAMES.arLong) && cartText.includes(NAMES.cop.normalize("NFC")) && /القبطية/.test(cartText) && (await cartItems(p)).items.length === 4);
  await p.screenshot({ path: shot("12-guest-cart.png"), fullPage: true });
  await p.goto(`${base}/checkout`);
  await p.check('input[name="deliveryMethod"][value="pickup"]', { force: true });
  await p.fill("[data-checkout-name]", "ضيف تجربة محلية");
  await p.fill("[data-checkout-phone]", "01012345678");
  await p.screenshot({ path: shot("13-guest-checkout.png"), fullPage: true });
  await p.click('form button[type="submit"]');
  await p.waitForURL(/payment/, { timeout: 15000 });
  await p.click('[data-payment-action="pickupCash"]');
  let s = await state();
  for (let i = 0; i < 30 && s.orders.length < 1; i++) { await p.waitForTimeout(500); s = await state(); }
  await p.waitForTimeout(800);
  await p.screenshot({ path: shot("14-guest-after-order.png"), fullPage: true });
  const guestOrder = s.orders[0];
  const gl = (guestOrder?.Products || "").split("\n");
  const lineWith = (re) => gl.filter((l) => re.test(l));
  check("guest order: created, total 770 + 2×770 + 770 + 25", s.orders.length === 1 && guestOrder.Total === 3105, String(guestOrder?.Total));
  check("guest order: Arabic name on its own line with quantity 2", lineWith(/«القمص بيشوي يوحنا مرقس» \| لغة الكتابة: العربية/).length === 1 && /الكمية: 2/.test(lineWith(/بيشوي/)[0] || ""), gl.join(" || "));
  check("guest order: Coptic name kept exactly (Unicode with marks)", lineWith(new RegExp(`«${NAMES.cop.normalize("NFC")}» \\| لغة الكتابة: القبطية`)).length === 1);
  check("guest order: plain cross and normal product have no name", gl.filter((l) => !/الاسم على الصليب/.test(l)).length === 2);
  const gNotes = s.orderLines.filter((l) => l.order === guestOrder?.id || true).slice(0, 4).map((l) => l.notes);
  check("guest order lines (ملاحظات): one name per line, never mixed", gNotes.filter((n) => /بيشوي/.test(n)).length === 1 && gNotes.filter((n) => n.includes(NAMES.cop.normalize("NFC"))).length === 1 && !gNotes.some((n) => /بيشوي/.test(n) && n.includes("Ⲙⲏⲛⲁ")), gNotes.join(" || "));

  // ---------- 3b. Signed-in customer (local stand-in for Firebase)
  const reg = await browser.newContext({ ...devices["iPhone 13"] });
  await guard(reg);
  await installFakeFirebase(reg);
  const r = await reg.newPage();
  r.on("pageerror", (e) => errors.push(`registered: ${e.message}`));
  await r.goto(`${base}/cart`);
  await r.waitForTimeout(1500);
  await openEngraving(r);
  await addName(r, NAMES.regAr);
  await addName(r, NAMES.regEn, "en");
  await r.goto(`${base}/cart`);
  await r.waitForSelector(".cart-engraving", { timeout: 15000 });
  await r.waitForTimeout(1500);
  const rc = await cartItems(r);
  const remote = await r.evaluate((uid) => JSON.parse(localStorage.getItem("__fakeFirestore") || "{}")[`customerCarts/${uid}`] || null, USER.uid);
  const remoteNames = JSON.stringify(remote || {});
  check("signed-in: cart saved under the account with both names", rc.key.includes(USER.uid) && rc.items.filter((i) => i.engraving).length === 2, rc.key);
  check("signed-in: the account's server cart keeps the names", remoteNames.includes(NAMES.regAr) && remoteNames.includes(NAMES.regEn), remoteNames.slice(0, 200));
  await r.reload();
  await r.waitForSelector(".cart-engraving", { timeout: 15000 });
  check("signed-in: names still there after reload", (await r.textContent("[data-cart-page-items]")).includes(NAMES.regAr));
  await r.screenshot({ path: shot("15-registered-cart.png"), fullPage: true });
  await r.goto(`${base}/checkout`);
  await r.check('input[name="deliveryMethod"][value="pickup"]', { force: true });
  await r.fill("[data-checkout-name]", "عميل مسجل تجربة");
  await r.fill("[data-checkout-phone]", "01112345678");
  await r.click('form button[type="submit"]');
  await r.waitForURL(/payment/, { timeout: 15000 });
  await r.click('[data-payment-action="pickupCash"]');
  for (let i = 0; i < 30 && s.orders.length < 2; i++) { await r.waitForTimeout(500); s = await state(); }
  const regOrder = s.orders.find((o) => o.id !== guestOrder?.id);
  const rl = (regOrder?.Products || "").split("\n");
  check("signed-in order: two lines with their own names and languages", rl.length === 2 && rl.some((l) => /«أبونا داود» \| لغة الكتابة: العربية/.test(l)) && rl.some((l) => /«Fr\. Mark» \| لغة الكتابة: English/.test(l)) && regOrder.Total === 1540, rl.join(" || "));

  // ---------- 4. Server checks (a tampered request straight to the API)
  const tamper = await r.evaluate(async ({ product, plain }) => {
    const send = async (products) => {
      const requestId = `tamper-${Math.random().toString(36).slice(2)}`;
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": requestId }, body: JSON.stringify({ requestId, customerName: "تجربة", phone: "01012345678", address: "القاهرة", paymentMethod: "InstaPay", deliveryType: "Shipping", products, total: products.reduce((t, p) => t + p.lineTotal, 0) }) });
      return { status: res.status, body: await res.text() };
    };
    const eng = (name, lang) => ({ enabled: true, name, lang, zoneVersion: 1, customizationId: "x" });
    return {
      onNormal: await send([{ productId: plain, quantity: 1, price: 25, lineTotal: 25, engraving: eng("أبونا مينا", "ar") }]),
      badChars: await send([{ productId: product, quantity: 1, price: 770, lineTotal: 770, engraving: eng("Mina<script>", "en") }]),
      tooLong: await send([{ productId: product, quantity: 1, price: 770, lineTotal: 770, engraving: eng("القمص بيشوي يوحنا مرقس عبد المسيح", "ar") }])
    };
  }, { product: PRODUCT, plain: PLAIN });
  const after = await state();
  check("server: refuses a name on a normal product, bad characters and a too-long name", tamper.onNormal.status === 409 && /engraving_invalid/.test(tamper.onNormal.body) && tamper.tooLong.status === 409 && /engraving_invalid/.test(tamper.tooLong.body) && tamper.badChars.status >= 400 && /engraving/.test(tamper.badChars.body) && after.orders.length === 2, JSON.stringify(Object.fromEntries(Object.entries(tamper).map(([k, v]) => [k, `${v.status} ${v.body.slice(0, 60)}`]))));

  // ---------- 5. Admin orders page
  const o = await admin.newPage();
  o.on("pageerror", (e) => errors.push(`orders: ${e.message}`));
  await o.goto(`${base}/admin/orders`);
  await o.waitForSelector("[data-order-id]", { timeout: 20000 });
  let ordersText = "";
  for (const index of [1, 0]) {
    await o.locator("[data-order-id]").nth(index).click();
    await o.waitForTimeout(800);
    await o.waitForFunction(() => /الاسم على الصليب|الأسماء المطلوب/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    ordersText += await o.textContent("body");
    await o.screenshot({ path: shot(`16-admin-order-${index === 1 ? "guest" : "registered"}.png`), fullPage: true });
  }
  check("admin orders: every name visible", [NAMES.arLong, NAMES.cop.normalize("NFC"), NAMES.regAr, NAMES.regEn].every((n) => ordersText.includes(n)));

  // ---------- 6. Other crosses unchanged
  const plainCross = await phone.newPage();
  await plainCross.goto(`${base}/products/popek-corian-cross-set-3`);
  await plainCross.waitForSelector("[data-add]");
  check("other crosses: no engraving section or scripts", !(await plainCross.$(".pe")) && !(await plainCross.$('script[src*="cross-engraving"]')));

  check("no page errors", errors.length === 0, errors.join(" | "));
  check("no request left the sandbox", after.blockedRequests.length === 0, after.blockedRequests.join(", "));
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ results, layout, state: after }, null, 2));
  await browser.close();
  console.log(`${results.filter((x) => x.ok).length}/${results.length} passed`);
  process.exit(results.every((x) => x.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
