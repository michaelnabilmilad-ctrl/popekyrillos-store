// End-to-end check of made-to-order crosses (with and without a name) against scripts/local-sandbox.mjs, with a LOCAL
// copy of the catalog where model 2 (engraving on) is out of stock with quantity 0, and model 5
// (no engraving) is out of stock.
//   node scripts/e2e-made-to-order.cjs http://localhost:8790 <screenshots folder>
// Every request that is not to the local sandbox is aborted, so no real service is touched.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "http://localhost:8790";
const out = process.argv[3] || "e2e-made-to-order";
const CROSS = "popek-corian-cross-set-2"; // engraving on, out of stock in the local copy
const SOLD_OUT = "popek-corian-cross-set-5"; // regular product, out of stock in the local copy
const PLAIN = "atb3ho-10555319877797"; // regular product in stock (price 25)
const NAME = "القمص يوحنا مرقس";
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
  return JSON.parse(localStorage.getItem(key) || "{}").items || [];
});

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  await guard(phone);
  const p = await phone.newPage();
  p.on("pageerror", (e) => errors.push(`shop: ${e.message}`));

  // 1. Product page of an out-of-stock made-to-order cross
  await p.goto(`${base}/products/${CROSS}`);
  await p.waitForSelector(".pe .pe-choice");
  const pageText = await p.textContent("body");
  check("product page: «يُصنع خصيصًا حسب طلبك» shown", pageText.includes("يُصنع خصيصًا حسب طلبك"));
  check("product page: not shown as unavailable, add button enabled", !(await p.$eval("[data-add]", (b) => b.disabled)) && !/غير متاح حاليا/.test(await p.textContent("main").catch(() => pageText)));
  await p.screenshot({ path: shot("01-product-page.png") });
  await p.click("[data-add]");
  await p.waitForTimeout(300);
  check("product page: without a name the out-of-stock cross is added too (made to order)", (await cartItems(p)).length === 1 && !(await cartItems(p))[0].engraving, await p.textContent("[data-message]"));
  await p.click('.pe-choice input[value="name"]', { force: true });
  await p.waitForSelector("[data-pe-body]:not([hidden])");
  await p.fill("[data-pe-input]", NAME);
  await p.waitForFunction(() => document.querySelector("[data-pe-summary]")?.textContent, null, { timeout: 8000 });
  await p.waitForTimeout(400);
  await p.check("[data-pe-confirm]", { force: true });
  await p.click("[data-add]");
  await p.waitForTimeout(400);
  const afterAdd = await cartItems(p);
  check("product page: with a name it goes to the cart as its own line (zero stock)", afterAdd.length === 2 && afterAdd[1].engraving?.name === NAME);
  await p.locator(".pe").screenshot({ path: shot("02-preview-before-order.png") });

  // 2. Shop listing: the card links to the product page instead of "unavailable"
  await p.goto(`${base}/products/${SOLD_OUT}`);
  await p.waitForSelector("[data-add]");
  check("regular out-of-stock product: cannot be added", await p.$eval("[data-add]", (b) => b.disabled) || (await (async () => { await p.click("[data-add]"); await p.waitForTimeout(300); return (await cartItems(p)).length === 1; })()));
  await p.goto(`${base}/products/${PLAIN}`);
  await p.waitForSelector("[data-add]");
  await p.click("[data-add]");
  await p.waitForTimeout(300);
  check("regular in-stock product added", (await cartItems(p)).length === 3);

  // 3. Cart + checkout (cash on pickup, local sandbox only)
  await p.goto(`${base}/cart`);
  await p.waitForSelector(".cart-engraving");
  const cartText = await p.textContent("[data-cart-page-items]");
  check("cart: name, «يُصنع خصيصًا حسب طلبك», and no unavailable warning", cartText.includes(NAME) && cartText.includes("يُصنع خصيصًا حسب طلبك") && !/غير متاح/.test(cartText));
  await p.screenshot({ path: shot("03-cart.png"), fullPage: true });
  await p.goto(`${base}/checkout`);
  await p.check('input[name="deliveryMethod"][value="pickup"]', { force: true });
  await p.fill("[data-checkout-name]", "ضيف تجربة محلية");
  await p.fill("[data-checkout-phone]", "01012345678");
  await p.click('form button[type="submit"]');
  await p.waitForURL(/payment/, { timeout: 15000 });
  await p.click('[data-payment-action="pickupCash"]');
  let s = await state();
  for (let i = 0; i < 30 && s.orders.length < 1; i++) { await p.waitForTimeout(500); s = await state(); }
  await p.waitForTimeout(800);
  await p.screenshot({ path: shot("04-after-order.png"), fullPage: true });
  const order = s.orders[0];
  check("order: created with the out-of-stock cross (plain + named) + regular product, total 1565", s.orders.length === 1 && order.Total === 1565, String(order?.Total));
  check("order: line says «تصنيع مخصوص» with the name and language", /تصنيع مخصوص \| الاسم على الصليب: «القمص يوحنا مرقس» \| لغة الكتابة: العربية/.test(order?.Products || ""));
  check("order lines (ملاحظات): each cross line flagged, the regular line not", /^تصنيع مخصوص \| بدون كتابة اسم/.test(s.orderLines[0]?.notes || "") && /^تصنيع مخصوص \| الاسم على الصليب/.test(s.orderLines[1]?.notes || "") && !/تصنيع مخصوص/.test(s.orderLines[2]?.notes || ""), s.orderLines.map((l) => l.notes).join(" || "));

  // 4. The API refuses a plain (no name) out-of-stock cross and an out-of-stock regular product
  const refused = await p.evaluate(async ({ cross, soldOut }) => {
    const send = async (products) => {
      const requestId = `mto-${Math.random().toString(36).slice(2)}`;
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": requestId }, body: JSON.stringify({ requestId, customerName: "تجربة", phone: "01012345678", address: "القاهرة", paymentMethod: "Cash", deliveryType: "Pickup", products, total: products.reduce((x, y) => x + y.lineTotal, 0) }) });
      return res.status;
    };
    return { plainCross: await send([{ productId: cross, quantity: 1, price: 770, lineTotal: 770 }]), soldOut: await send([{ productId: soldOut, quantity: 1, price: 770, lineTotal: 770 }]) };
  }, { cross: CROSS, soldOut: SOLD_OUT });
  check("server: out-of-stock regular product refused (eligible cross without a name accepted)", refused.plainCross === 200 && refused.soldOut === 409, JSON.stringify(refused));

  // 5. Admin orders page
  const admin = await browser.newContext({ viewport: { width: 1366, height: 1000 }, httpCredentials: { username: "local", password: "local" } });
  await guard(admin);
  const o = await admin.newPage();
  o.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
  await o.goto(`${base}/admin/orders`);
  await o.waitForSelector("[data-order-id]", { timeout: 20000 });
  const listText = await o.textContent("body");
  await o.locator("[data-order-id]").nth(1).click(); // newest first: #2 is the API check above
  await o.waitForFunction(() => /الصلبان المطلوب تصنيعها/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  const detailText = await o.textContent("body");
  await o.screenshot({ path: shot("05-admin-order.png"), fullPage: true });
  check("admin: list badge «تصنيع مخصوص»", listText.includes("تصنيع مخصوص"));
  check("admin: name, language, model, SKU and the unnamed cross shown", detailText.includes("بدون كتابة اسم") && detailText.includes(NAME) && detailText.includes("العربية") && detailText.includes("موديل 2") && detailText.includes("POPEK-CORIAN-CROSS-02"));
  const previewHref = await o.$eval("a[href*='#engrave=']", (a) => a.getAttribute("href")).catch(() => "");
  check("admin: «عرض المعاينة بالاسم ده» link present", previewHref.startsWith(`/products/${CROSS}#engrave=`), previewHref);

  // 6. The preview link opens the same preview, filled with the name, not confirmed
  const v = await admin.newPage();
  v.on("pageerror", (e) => errors.push(`preview: ${e.message}`));
  await v.goto(`${base}${previewHref}`);
  await v.waitForFunction(() => document.querySelector("[data-pe-summary]")?.textContent, null, { timeout: 10000 }).catch(() => {});
  const filled = await v.evaluate(() => ({ name: document.querySelector("[data-pe-input]")?.value, summary: document.querySelector("[data-pe-summary]")?.textContent, confirmed: document.querySelector("[data-pe-confirm]")?.checked }));
  check("preview link: opens the preview with the saved name (not confirmed)", filled.name === NAME && filled.summary.includes(NAME) && filled.confirmed === false, JSON.stringify(filled));
  await v.locator(".pe").screenshot({ path: shot("06-preview-from-admin.png") });

  const after = await state();
  check("no page errors", errors.length === 0, errors.join(" | "));
  check("no request left the sandbox", after.blockedRequests.length === 0, after.blockedRequests.join(", "));
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ results, state: after }, null, 2));
  await browser.close();
  console.log(`${results.filter((x) => x.ok).length}/${results.length} passed`);
  process.exit(results.every((x) => x.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
