// End-to-end run of the priest-name engraving feature against scripts/local-sandbox.mjs.
//   node scripts/e2e-cross-engraving.cjs http://localhost:8790 <screenshots folder>
// 1. Admin: engraving cannot be switched on before a colour and a checked writing area. Model 2
//    (black cross) gets the «صليب أسود» template: white writing, Arabic only. Model 9 gets the
//    «بديل عاج» template (Arabic, English, Coptic in CS New Athanasius); since no ivory photo
//    exists yet, its colour is then changed to white in admin so the test can see it.
// 1b. White on black: letter height on a phone screen and contrast for short and long names.
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
const MULTI = "popek-corian-cross-set-9"; // stands in for an ivory cross (3 languages)
// Ivory test: no ivory product photo exists yet, so model 9 stands in for an ivory cross and the
// admin picks, from the device, a frame of the shop's own video of a real ivory hand cross (old
// writing removed digitally). It only ever lives in this sandbox; the site never gets it.
const IVORY_TEST_PHOTO = process.env.IVORY_TEST_PHOTO || "/mnt/project-files/cross-engraving/prototype/images/sample-ivory-TEST-cleaned-crop.png";
const MULTI_ZONE = { x: 0.5693, y: 0.6353, len: 0.444, thick: 0.0785, angle: 93.4, fontMax: 0.6, fontMin: 0.42, weight: 0.06, padding: 0.11, curve: 0 };
const NAMES = { arLong: "القمص بيشوي يوحنا مرقس", arSecond: "أبونا مينا", cop: "Ⲁ̀ⲃⲃⲁ Ⲙⲏⲛⲁ", regAr: "أبونا داود", regEn: "Fr. Mark" };
let MAX_AR = 24; // replaced by the limit measured in admin
const LEGIBILITY = ["أبونا مينا", "القمص يوحنا مرقس", "الأنبا أنطونيوس", "القمص بيشوي يوحنا مرقس", "القس أنطونيوس عبد المسيح", "القمص بيشوي يوحنا مرقس عبد المسيح"];
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
  if (await p.$(`.pe-pills input[value="${lang}"]`)) await p.click(`.pe-pills input[value="${lang}"]`, { force: true });
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
  a.on("console", (m) => { if (m.type() === "error" && !/ERR_|Failed to load resource/.test(m.text())) errors.push(`admin console: ${m.text()}`); });
  await a.goto(`${base}/admin`);
  await a.waitForFunction(() => document.querySelectorAll("[data-product-row]").length > 5, null, { timeout: 30000 });
  const setZone = (zone) => a.evaluate((z) => {
    for (const [k, v] of Object.entries(z)) {
      const input = document.querySelector(`[data-ae-z="${k}"]`);
      if (!input) continue;
      input.value = v;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, zone);
  const openProduct = async (id) => {
    await a.fill("[data-search]", id);
    await a.click(`.row-actions [data-select-product="${id}"]`);
    await a.waitForFunction(() => !document.querySelector("[data-editor]")?.hidden, null, { timeout: 15000 });
    await a.click('[data-editor-tab="engraving"]');
    await a.waitForSelector("[data-ae-body] [data-ae='enabled']");
  };
  const protect = async () => {
    await a.click('[data-ae-act="protect"]');
    await a.waitForFunction(() => /اتجهزت|تعذر/.test(document.querySelector("[data-ae-protect-status]")?.textContent || ""), null, { timeout: 60000 });
    return a.textContent("[data-ae-protect-status]");
  };
  // Compares the protected copy with its source photo: the writing area must be untouched, the
  // line beside it and the tiled marks must be there.
  const auditWatermark = (source, protectedPath, zone) => a.evaluate(async ({ source, protectedPath, zone }) => {
    const E = window.CrossEngraving;
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
    const [s, w] = await Promise.all([load(source), load(protectedPath)]);
    const W = w.naturalWidth, H = w.naturalHeight;
    const px = (img) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(img, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const A = px(s), B = px(w);
    const { z, band, offset, clear } = E.watermarkGeometry(zone, W, H);
    const cos = Math.cos(z.rot), sin = Math.sin(z.rot);
    const diff = (a, b) => { const x = Math.round(z.cx + a * cos - b * sin), y = Math.round(z.cy + a * sin + b * cos); if (x < 0 || y < 0 || x >= W || y >= H) return null; const k = (y * W + x) * 4; return (Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2])) / 3; };
    const avg = (pts) => { const v = pts.map(([a, b]) => diff(a, b)).filter((d) => d !== null); return v.reduce((t, d) => t + d, 0) / Math.max(1, v.length); };
    const grid = (a0, a1, b0, b1, n = 40) => { const out = []; for (let i = 0; i <= n; i++) for (let j = 0; j <= 8; j++) out.push([a0 + (a1 - a0) * i / n, b0 + (b1 - b0) * j / 8]); return out; };
    const zoneDiff = avg(grid(-z.L / 2, z.L / 2, -z.S / 2, z.S / 2));
    const bandA = avg(grid(-z.L / 2, z.L / 2, offset - band * 0.35, offset + band * 0.35));
    const bandB = avg(grid(-z.L / 2, z.L / 2, -offset - band * 0.35, -offset + band * 0.35));
    let marked = 0, total = 0;
    for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) { const k = (y * W + x) * 4; total++; if ((Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2])) / 3 > 30) marked++; }
    // smallest close-up customers see (cart thumbnail) must contain the line beside the name
    const halfThumb = Math.max(z.S * 1.264, z.L * 1.12 / 3) / 2;
    return { zoneDiff: Math.round(zoneDiff * 10) / 10, bandA: Math.round(bandA), bandB: Math.round(bandB), markedShare: Math.round(marked / total * 1000) / 10, bandInsideThumb: offset + band / 2 <= halfThumb + 0.5, sameSize: s.naturalWidth / s.naturalHeight === W / H, band: Math.round(band), clear: Math.round(clear) };
  }, { source, protectedPath, zone });
  const langsChecked = () => a.evaluate(() => ["ar", "en", "cop"].filter((l) => document.querySelector(`[data-ae-lang="${l}"]`).checked));
  const publish = async (count) => {
    await a.click('[data-action="publish-products"]');
    for (let i = 0; i < 40; i++) { await a.waitForTimeout(500); if ((await state()).engravingProducts.length >= count) break; }
    return state();
  };

  const start = await state();
  check("start: no product has engraving switched on (nothing is enabled automatically)", start.engravingProducts.length === 0 && start.uploadedFiles.length === 0, JSON.stringify(start.engravingProducts.map((x) => x.id)));
  // Model 2: black cross
  await openProduct(PRODUCT);
  await a.check("[data-ae-body] [data-ae='enabled']");
  await a.click('[data-ae-image$="model-2-unboxed.webp"]');
  await setZone(ZONE);
  check("admin: no writing colour is pre-selected", (await a.inputValue("[data-ae-color]")) === "");
  await a.click('[data-ae-act="apply"]');
  const noColor = await a.textContent("[data-ae-status]");
  check("admin: cannot enable before choosing the writing colour", /لون الكتابة/.test(noColor), noColor);
  await a.click('[data-ae-template="black"]');
  check("admin: «صليب أسود» template = white, Arabic only, free note", (await a.inputValue("[data-ae-color]")) === "#ffffff" && JSON.stringify(await langsChecked()) === '["ar"]' && await a.isChecked('[data-ae="freeNote"]'));
  await a.click('[data-ae-act="apply"]');
  const noZone = await a.textContent("[data-ae-status]");
  check("admin: cannot enable before checking the writing area", /مراجعة مكان الكتابة/.test(noZone) && !/لون الكتابة/.test(noZone), noZone);
  check("admin: cannot enable before confirming the preview photo suits", /تأكيد إن صورة المعاينة مناسبة/.test(noZone), noZone);
  check("admin: cannot enable before the watermarked customer photo is made", /العلامة المائية/.test(noZone), noZone);
  check("admin: product page photo itself is never offered as the customer preview", !(await a.isVisible("[data-ae-cust]")));
  const protectMsg = await protect();
  check("admin: watermarked customer copy made and shown before enabling", /اتجهزت/.test(protectMsg) && await a.isVisible("[data-ae-cust]"), protectMsg);
  await a.waitForTimeout(1500);
  await a.locator("[data-ae-cust]").screenshot({ path: shot("00-admin-customer-view-watermarked.png") });
  await a.check('[data-ae="photoConfirmed"]');
  await a.check('[data-ae="confirmed"]');
  await a.evaluate(() => { const s = document.querySelector('[data-ae-z="x"]'); s.value = "0.645"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  check("admin: moving the writing area asks to check it again", !(await a.isChecked('[data-ae="confirmed"]')));
  const askedAgain = await a.waitForFunction(() => /جهّزها تاني/.test(document.querySelector("[data-ae-protect-status]")?.textContent || "") && document.querySelector("[data-ae-cust]").hidden, null, { timeout: 15000 }).then(() => true, () => false);
  check("admin: moving the writing area asks for a new watermarked copy", askedAgain, await a.textContent("[data-ae-protect-status]"));
  await a.evaluate(() => { const s = document.querySelector('[data-ae-z="x"]'); s.value = "0.6385"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  await a.check('[data-ae="confirmed"]');
  await a.click('[data-ae-act="measure"]');
  await a.waitForFunction(() => document.querySelector("[data-ae-measure]")?.dataset.measured, null, { timeout: 60000 });
  const measuredBlack = JSON.parse(await a.$eval("[data-ae-measure]", (n) => n.dataset.measured));
  check("admin: maximum letters measured from the writing area (Arabic only on this cross)", measuredBlack.ar > 0 && Object.keys(measuredBlack).join() === "ar", JSON.stringify(measuredBlack));
  await a.waitForTimeout(1800);
  await a.locator('[data-editor-section="engraving"]').screenshot({ path: shot("01-admin-black-cross-template.png") });
  await a.click('[data-ae-act="apply"]');
  await a.waitForTimeout(300);
  check("admin: settings applied to the product draft", /حفظ ونشر/.test(await a.textContent("[data-ae-status]")));
  let st = await publish(1);
  const black = st.engravingProducts.find((x) => x.id === PRODUCT)?.engraving;
  check("admin: black cross saved as white, Arabic only, free, measured limit", black?.zone?.color === "#ffffff" && JSON.stringify(black?.languages) === '["ar"]' && black?.freeNote === true && black?.zone?.confirmed === true && black?.photoConfirmed === true && black?.enabled === true && black?.zone?.maxChars?.ar === measuredBlack.ar, JSON.stringify({ color: black?.zone?.color, languages: black?.languages, freeNote: black?.freeNote, maxAr: black?.zone?.maxChars?.ar }));
  MAX_AR = black?.zone?.maxChars?.ar || 24;
  {
    const audit = await auditWatermark("/" + black.previewSource, "/" + black.previewImage, black.zone);
    check("watermark (black cross): writing area untouched, line beside it on both sides, marks over the photo, inside the smallest close-up", audit.zoneDiff < 3 && audit.bandA > 25 && audit.bandB > 25 && audit.markedShare > 3 && audit.bandInsideThumb && audit.sameSize, JSON.stringify(audit));
  }

  // Model 9: an engraving-only preview photo uploaded in admin (a copy of the shop's own photo of
  // this cross), «بديل عاج» template, then the colour edited (no ivory photo exists yet)
  await openProduct(MULTI);
  await a.check("[data-ae-body] [data-ae='enabled']");
  await a.setInputFiles("[data-ae-upload]", IVORY_TEST_PHOTO);
  await a.waitForFunction(() => /جهازك|تعذر/.test(document.querySelector("[data-ae-upload-status]")?.textContent || ""), null, { timeout: 30000 });
  const uploadMsg = await a.textContent("[data-ae-upload-status]");
  const uploadedPick = await a.$eval('[data-ae-image][aria-pressed="true"]', (b) => b.dataset.aeImage).catch(() => "");
  const uploadsBefore = (await state()).uploadedFiles.length;
  check("admin: a photo from the device is used locally and not uploaded as it is", /جهازك/.test(uploadMsg) && uploadedPick === "local" && uploadsBefore === 1, `${uploadMsg} ${uploadedPick} uploads=${uploadsBefore}`);
  await setZone(MULTI_ZONE);
  await a.click('[data-ae-template="ivory"]');
  const ivoryOk = (await a.inputValue("[data-ae-color]")) === "#18130e" && JSON.stringify(await langsChecked()) === '["ar","en","cop"]' && (await a.inputValue("[data-ae-coptic]")) === "athanasius";
  check("admin: «بديل عاج» template = black, 3 languages, CS New Athanasius", ivoryOk);
  await a.selectOption("[data-ae-color]", "#ffffff");
  const colourEditable = (await a.inputValue("[data-ae-color]")) === "#ffffff";
  await a.selectOption("[data-ae-color]", "#18130e");
  check("admin: watermarked copy made from the device photo", /اتجهزت/.test(await protect()));
  await a.check('[data-ae="photoConfirmed"]');
  await a.check('[data-ae="confirmed"]');
  await a.click('[data-ae-act="measure"]');
  await a.waitForFunction(() => document.querySelector("[data-ae-measure]")?.dataset.measured || /تعذر/.test(document.querySelector("[data-ae-measure]")?.textContent || ""), null, { timeout: 90000 }).catch(async () => console.log("measure note:", await a.textContent("[data-ae-measure]")));
  console.log("measure note:", await a.textContent("[data-ae-measure]"));
  const measuredMulti = JSON.parse(await a.$eval("[data-ae-measure]", (n) => n.dataset.measured));
  check("admin: limits measured per language with the chosen fonts (different widths)", measuredMulti.ar > 0 && measuredMulti.en > 0 && measuredMulti.cop > 0 && new Set(Object.values(measuredMulti)).size > 1, JSON.stringify(measuredMulti));
  await a.waitForTimeout(2200);
  await a.locator('[data-editor-section="engraving"]').screenshot({ path: shot("02-admin-three-languages.png") });
  await a.click('[data-ae-act="apply"]');
  await a.waitForTimeout(300);
  st = await publish(2);
  const multi = st.engravingProducts.find((x) => x.id === MULTI)?.engraving;
  check("admin: ivory cross saved with black writing, Arabic/English/Coptic, CS New Athanasius (colour stays editable)", colourEditable && multi?.zone?.color === "#18130e" && JSON.stringify(multi?.languages) === '["ar","en","cop"]' && multi?.copticFont === "athanasius" && multi?.freeNote === true, JSON.stringify({ color: multi?.zone?.color, languages: multi?.languages, copticFont: multi?.copticFont }));
  const multiEntry = st.engravingProducts.find((x) => x.id === MULTI);
  check("admin: the uploaded preview photo is not added to the product's photos", /engraving-/.test(multi?.previewImage || "") && !(multiEntry?.images || []).some((i) => /engraving-/.test(i)) && (multiEntry?.images || []).length === 2, JSON.stringify({ preview: multi?.previewImage, images: multiEntry?.images }));
  check("admin: only those two products have engraving (not all crosses)", st.engravingProducts.length === 2);
  check("storage: only the two watermarked copies were uploaded (no clean original)", st.uploadedFiles.length === 2 && st.uploadedFiles.every((f) => /\/engraving-[^/]*protected-preview[^/]*\.webp$/.test(f)) && multi?.previewSource === "local", JSON.stringify({ files: st.uploadedFiles, source: multi?.previewSource }));
  {
    const audit = await auditWatermark(`data:image/png;base64,${fs.readFileSync(IVORY_TEST_PHOTO).toString("base64")}`, "/" + multi.previewImage, multi.zone);
    check("watermark (device photo): writing area untouched, line beside it, marks over the photo", audit.zoneDiff < 3 && audit.bandA > 25 && audit.bandB > 25 && audit.markedShare > 3 && audit.bandInsideThumb, JSON.stringify(audit));
  }

  // ---------- 1b. White on black: legibility on a phone
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent });
    await guard(ctx);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`legibility: ${e.message}`));
    const imgRequests = [];
    p.on("request", (r) => { if (r.resourceType() === "image" || /\.webp/.test(r.url())) imgRequests.push(new URL(r.url()).pathname); });
    await p.goto(`${base}/products/${PRODUCT}`);
    await p.waitForSelector(".pe .pe-choice");
    await p.waitForTimeout(800);
    const beforeName = imgRequests.length;
    await p.click('.pe-choice input[value="name"]', { force: true });
    await p.waitForSelector("[data-pe-body]:not([hidden])");
    await p.fill("[data-pe-input]", "أبونا مينا");
    await p.waitForTimeout(1500);
    const previewLoads = imgRequests.slice(beforeName);
    const settings = await p.evaluate(() => JSON.parse(document.getElementById("product-data").textContent).engraving);
    check("customer page: the preview loads only the watermarked copy, never the clean photo", previewLoads.some((u) => u.includes(settings.previewImage.split("/").pop())) && !previewLoads.some((u) => /model-2-unboxed/.test(u)), JSON.stringify(previewLoads));
    await p.click('[data-pe-view="full"]');
    await p.waitForTimeout(900);
    await p.locator('[data-pe-figure="full"]').screenshot({ path: shot("wm-1-phone-full-cross.png") });
    await p.click('[data-pe-view="zoom"]');
    await p.waitForTimeout(600);
    await p.locator('[data-pe-figure="zoom"]').screenshot({ path: shot("wm-2-phone-zoom.png") });
    const head = await p.textContent(".pe-head");
    check("black cross page: «الكتابة مجانية» shown, Arabic only (no language choice)", /الكتابة مجانية/.test(head) && !(await p.$(".pe-pills")));
    const rows = [];
    for (const [i, name] of LEGIBILITY.entries()) {
      await p.fill("[data-pe-input]", name);
      await p.waitForTimeout(1300);
      const m = await p.evaluate(async (text) => {
        const E = window.CrossEngraving;
        const product = JSON.parse(document.getElementById("product-data").textContent);
        const settings = E.normalizeSettings(product.engraving);
        const imageSrc = "/" + settings.previewImage.replace(/^\//, "");
        const [r1, r0] = [await E.render({ imageSrc, zone: settings.zone, text, lang: "ar" }), await E.render({ imageSrc, zone: settings.zone, text: "", lang: "ar" })];
        const draw = (r) => { const c = document.createElement("canvas"); c.width = 900; c.height = 300; E.drawZoom(c, r, {}); return c.getContext("2d").getImageData(0, 0, 900, 300).data; };
        const a1 = draw(r1), a0 = draw(r0);
        let minY = 300, maxY = -1, minX = 900, maxX = -1, ink = 0, inkLum = 0, bgLum = 0, bg = 0;
        for (let y = 0; y < 300; y++) for (let x = 0; x < 900; x++) {
          const k = (y * 900 + x) * 4;
          const l1 = 0.2126 * a1[k] + 0.7152 * a1[k + 1] + 0.0722 * a1[k + 2];
          const l0 = 0.2126 * a0[k] + 0.7152 * a0[k + 1] + 0.0722 * a0[k + 2];
          if (Math.abs(l1 - l0) > 40) { ink++; inkLum += l1; bgLum += l0; minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
        }
        const shown = document.querySelector("[data-pe-zoom]").getBoundingClientRect().width / 900;
        const rel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const L1 = rel(inkLum / Math.max(1, ink)), L0 = rel(bgLum / Math.max(1, ink));
        return { fits: r1.fit?.fits, sizeOfMax: Math.round((r1.fit?.ratio || 0) * 100), textHeightPx: Math.round((maxY - minY + 1) * shown), textWidthPx: Math.round((maxX - minX + 1) * shown), contrast: Math.round(((Math.max(L1, L0) + 0.05) / (Math.min(L1, L0) + 0.05)) * 10) / 10, err: document.querySelector("[data-pe-err]").textContent };
      }, name);
      rows.push({ name, chars: [...name].length, ...m });
      await p.locator(".pe-figure[data-pe-figure=zoom]").screenshot({ path: shot(`w-${i + 1}-zoom-${[...name].length}chars.png`) });
    }
    await p.click('[data-pe-view="full"]');
    await p.waitForTimeout(900);
    await p.locator('[data-pe-figure="full"]').screenshot({ path: shot("w-6-full-cross-longest.png") });
    await p.fill("[data-pe-input]", "القمص بيشوي يوحنا مرقس عبد المسيح بشاي أنطونيوس");
    await p.waitForTimeout(1000);
    const tooLong = await p.textContent("[data-pe-err]");
    fs.writeFileSync(path.join(out, "legibility.json"), JSON.stringify(rows, null, 2));
    console.log(rows.map((r) => `   ${r.name} (${r.chars}): height ${r.textHeightPx}px, width ${r.textWidthPx}px, size ${r.sizeOfMax}% of max, contrast ${r.contrast}:1, fits ${r.fits}`).join("\n"));
    const within = rows.filter((r) => r.chars <= MAX_AR), over = rows.filter((r) => r.chars > MAX_AR);
    check(`white on black: names within this cross's measured limit (${MAX_AR}) fit, contrast ≥ 7:1, letters ≥ 9px tall on a 390px phone`, within.length >= 3 && within.every((r) => r.fits && r.contrast >= 7 && r.textHeightPx >= 9 && !r.err), JSON.stringify(rows.map((r) => [r.chars, r.textHeightPx, r.contrast, r.err ? "warn" : "ok"])));
    check("white on black: names over the limit get a clear warning", over.every((r) => /أطول/.test(r.err)), JSON.stringify(over.map((r) => r.chars)));
    check("white on black: a longer name gets a clear warning instead of a tiny font", /أطول/.test(tooLong), tooLong);
    await ctx.close();
  }

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

  // ---------- 1c. Ivory stand-in: black writing in Arabic, English and Coptic on a phone
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    await guard(ctx);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`ivory: ${e.message}`));
    await openEngraving(p, MULTI);
    const rows = [];
    for (const [lang, name] of [["ar", "القمص يوحنا مرقس"], ["en", "Fr. John Mark"], ["cop", "ⲠⲒⲀ̀ⲄⲒⲞⲤ ⲘⲀⲢⲔⲞⲤ"]]) {
      await p.click(`.pe-pills input[value="${lang}"]`, { force: true });
      await p.fill("[data-pe-input]", name);
      await p.waitForTimeout(1500);
      const r = await p.evaluate(() => ({ err: document.querySelector("[data-pe-err]").textContent, summary: document.querySelector("[data-pe-summary]").textContent, dir: document.querySelector("[data-pe-input]").dir }));
      rows.push({ lang, ...r });
      await p.click('[data-pe-view="zoom"]');
      await p.waitForTimeout(500);
      await p.locator('[data-pe-figure="zoom"]').screenshot({ path: shot(`iv-${lang}-zoom.png`) });
      await p.click('[data-pe-view="full"]');
      await p.waitForTimeout(900);
      await p.locator('[data-pe-figure="full"]').screenshot({ path: shot(`iv-${lang}-full.png`) });
      await p.click('[data-pe-view="zoom"]');
    }
    check("ivory (black writing): Arabic, English and Coptic each preview without errors, right direction", rows.every((r) => !r.err && r.summary) && rows[0].dir === "rtl" && rows[1].dir === "ltr", JSON.stringify(rows));
    await ctx.close();
  }

  // ---------- 2b. Coptic in CS New Athanasius, served by the site itself, on a computer and a phone
  for (const [label, opts] of [["desktop", { viewport: { width: 1366, height: 900 } }], ["phone", { ...devices["iPhone 13"] }]]) {
    const ctx = await browser.newContext(opts);
    await guard(ctx);
    const p = await ctx.newPage();
    const fontResponses = [];
    p.on("response", (r) => { if (/cs-new-athanasius\.ttf/.test(r.url())) fontResponses.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    p.on("pageerror", (e) => errors.push(`coptic ${label}: ${e.message}`));
    await openEngraving(p, MULTI);
    await p.click('.pe-pills input[value="cop"]', { force: true });
    await p.fill("[data-pe-input]", "ⲠⲒⲀ̀ⲄⲒⲞⲤ ⲘⲀⲢⲔⲞⲤ");
    await p.waitForTimeout(1500);
    const c = await p.evaluate(() => {
      const E = window.CrossEngraving, L = window.CopticLegacy;
      const letters = [..."ⲀⲂⲄⲆⲈⲌⲎⲐⲒⲔⲖⲘⲚⲜⲞⲠⲢⲤⲦⲨⲪⲬⲮⲰϢϤϦϨϪϬϮ"];
      const allLetters = [...letters, ...letters.map((x) => x.toLowerCase())].filter((x) => !L.toNewAthanasius(x).ok);
      return { legacyReady: E.legacyReady.cop, spec: E.drawSpec("ⲘⲎⲚⲀ", "cop", { legacy: true }), loaded: document.fonts.check('40px "CSNewAthanasius"'), unsupportedLetters: allLetters, roundTrip: L.fromNewAthanasius(L.toNewAthanasius("Ⲁ̀ⲃⲃⲁ Ⲙⲏⲛⲁ").text) === "Ⲁ̀ⲃⲃⲁ Ⲙⲏⲛⲁ".normalize("NFC"), summary: document.querySelector("[data-pe-summary]").textContent };
    });
    await p.locator(".pe-figure[data-pe-figure=zoom]").screenshot({ path: shot(`c-${label}-coptic-athanasius.png`) });
    await p.fill("[data-pe-input]", "ⲘⲎⲚⲀ Ⲋ");
    await p.waitForTimeout(900);
    const sou = await p.evaluate(() => ({ err: document.querySelector("[data-pe-err]").textContent, summary: document.querySelector("[data-pe-summary]").textContent, onKeypad: [...document.querySelectorAll("[data-pe-key]")].some((b) => b.dataset.peKey === "Ⲋ") }));
    check(`Coptic on ${label}: a letter the font lacks (Ⲋ) is named in a warning, not swapped or drawn in another font`, /«Ⲋ»/.test(sou.err) && /مش موجود في خط/.test(sou.err) && !sou.summary && !sou.onKeypad, JSON.stringify(sou));
    if (label === "phone") await p.locator(".pe").screenshot({ path: shot("c-phone-unsupported-letter-warning.png") });
    check(`Coptic on ${label}: CS New Athanasius loaded from the site (not a local file), all letters supported, canvas uses it, order keeps Unicode`, c.legacyReady && c.loaded && c.spec.legacy === true && !c.unsupportedLetters.length && c.roundTrip && fontResponses.some((r) => /^200 \/assets\/fonts\/engraving\/cs-new-athanasius\.ttf$/.test(r)) && /ⲠⲒⲀ̀ⲄⲒⲞⲤ/.test(c.summary), JSON.stringify({ ...c, fontResponses }));
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
  check("price unchanged (770) and no fee added", /770|٧٧٠/.test(priceText) && !/رسوم/.test(await p.textContent(".pe")), priceText);
  await p.click("[data-add]"); // no engraving
  await p.waitForTimeout(300);
  check("guest: cross added without any name", /أضيف|تمت|السلة/.test(await p.textContent("[data-message]")));
  await p.click('.pe-choice input[value="name"]', { force: true });
  check("guest: long Arabic name added", (await addName(p, NAMES.arLong)).includes(NAMES.arLong));
  await p.locator(".pe").screenshot({ path: shot("10-guest-long-arabic.png") });
  check("guest: same cross again with a second Arabic name", (await addName(p, NAMES.arSecond)).includes(NAMES.arSecond));
  await openEngraving(p, MULTI);
  check("3-language cross: Arabic, English and Coptic offered", (await p.$$eval(".pe-pills input", (n) => n.map((i) => i.value).join(","))) === "ar,en,cop");
  check("guest: Coptic name with marks added", (await addName(p, NAMES.cop, "cop")).includes(NAMES.cop.normalize("NFC")));
  await p.locator(".pe").screenshot({ path: shot("11-guest-coptic-athanasius.png") });
  await p.goto(`${base}/products/${PLAIN}`);
  await p.waitForSelector("[data-add]");
  check("normal product: no engraving section or scripts", !(await p.$(".pe")) && !(await p.$('script[src*="cross-engraving"]')));
  await p.click("[data-add]");
  await p.waitForTimeout(300);
  let cart = await cartItems(p);
  const crossLines = cart.items.filter((i) => i.productId === PRODUCT);
  check("cart: same cross 3 times = 3 separate lines (no name, 2 different names)", crossLines.length === 3 && new Set(crossLines.map((i) => i.lineId || "")).size === 3, crossLines.map((i) => i.engraving?.name || "—").join(" | "));
  await p.goto(`${base}/cart`);
  await p.waitForSelector(".cart-engraving");
  const arLine = (await cartItems(p)).items.find((i) => i.engraving?.name === NAMES.arLong);
  const arKey = await p.evaluate((lineId) => [...document.querySelectorAll("[data-cart-delta='1']")].find((b) => b.dataset.cartKey.endsWith(lineId))?.dataset.cartKey, arLine.lineId);
  await p.click(`[data-cart-delta="1"][data-cart-key="${arKey}"]`);
  await p.waitForTimeout(400);
  cart = await cartItems(p);
  const qty = (fn) => cart.items.find(fn)?.qty;
  check("cart: changing the Arabic line's quantity changes only that line", qty((i) => i.engraving?.name === NAMES.arLong) === 2 && qty((i) => i.engraving?.name === NAMES.arSecond) === 1 && qty((i) => i.engraving?.lang === "cop") === 1 && qty((i) => i.productId === PRODUCT && !i.engraving) === 1);
  await p.reload();
  await p.waitForSelector(".cart-engraving");
  const cartText = await p.textContent("[data-cart-page-items]");
  check("cart: after reload the names, languages and quantities are still there", cartText.includes(NAMES.arLong) && cartText.includes(NAMES.cop.normalize("NFC")) && cartText.includes(NAMES.arSecond) && /القبطية/.test(cartText) && (await cartItems(p)).items.length === 5);
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
  check("guest order: created, total 770 + 2×770 + 770 + 770 + 25", s.orders.length === 1 && guestOrder.Total === 3875, String(guestOrder?.Total));
  check("guest order: Arabic name on its own line with quantity 2", lineWith(/«القمص بيشوي يوحنا مرقس» \| لغة الكتابة: العربية/).length === 1 && /الكمية: 2/.test(lineWith(/بيشوي/)[0] || ""), gl.join(" || "));
  check("guest order: Coptic name kept exactly (Unicode with marks)", lineWith(new RegExp(`«${NAMES.cop.normalize("NFC")}» \\| لغة الكتابة: القبطية`)).length === 1);
  check("guest order: second Arabic name on its own line", lineWith(/«أبونا مينا» \| لغة الكتابة: العربية/).length === 1);
  check("guest order: plain cross and normal product have no name", gl.filter((l) => !/الاسم على الصليب/.test(l)).length === 2);
  const gNotes = s.orderLines.slice(0, 5).map((l) => l.notes);
  const one = (re) => gNotes.filter((n) => re.test(n)).length === 1;
  check("guest order lines (ملاحظات): one name per line, never mixed", one(/بيشوي/) && one(/«أبونا مينا»/) && gNotes.filter((n) => n.includes(NAMES.cop.normalize("NFC"))).length === 1 && !gNotes.some((n) => (n.match(/الاسم على الصليب/g) || []).length > 1), gNotes.join(" || "));

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
  await openEngraving(r, MULTI);
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
      tooLong: await send([{ productId: product, quantity: 1, price: 770, lineTotal: 770, engraving: eng("القمص بيشوي يوحنا مرقس عبد المسيح بشاي أنطونيوس", "ar") }]),
      englishOnArabicOnly: await send([{ productId: product, quantity: 1, price: 770, lineTotal: 770, engraving: eng("Fr. Mina", "en") }])
    };
  }, { product: PRODUCT, plain: PLAIN });
  const after = await state();
  check("server: refuses a name on a normal product, bad characters, a too-long name and English on the Arabic-only black cross", tamper.englishOnArabicOnly.status === 409 && /engraving_invalid/.test(tamper.englishOnArabicOnly.body) && tamper.onNormal.status === 409 && /engraving_invalid/.test(tamper.onNormal.body) && tamper.tooLong.status === 409 && /engraving_invalid/.test(tamper.tooLong.body) && tamper.badChars.status >= 400 && /engraving/.test(tamper.badChars.body) && after.orders.length === 2, JSON.stringify(Object.fromEntries(Object.entries(tamper).map(([k, v]) => [k, `${v.status} ${v.body.slice(0, 60)}`]))));

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

  // ---------- 6. Turning it off from admin works at once
  {
    await a.bringToFront();
    await openProduct(PRODUCT);
    await a.uncheck("[data-ae-body] [data-ae='enabled']");
    await a.click('[data-ae-act="apply"]');
    await a.waitForTimeout(300);
    await a.click('[data-action="publish-products"]');
    let off = null;
    for (let i = 0; i < 40; i++) { await a.waitForTimeout(500); off = (await state()).engravingProducts.find((x) => x.id === PRODUCT); if (off?.engraving?.enabled === false) break; }
    const page = await phone.newPage();
    await page.goto(`${base}/products/${PRODUCT}`);
    await page.waitForSelector("[data-add]");
    const gone = !(await page.$(".pe")) && !(await page.$('script[src*="cross-engraving"]'));
    const refused = await page.evaluate(async (product) => {
      const requestId = `off-${Math.random().toString(36).slice(2)}`;
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "X-Request-Id": requestId }, body: JSON.stringify({ requestId, customerName: "تجربة", phone: "01012345678", address: "القاهرة", paymentMethod: "InstaPay", deliveryType: "Shipping", products: [{ productId: product, quantity: 1, price: 770, lineTotal: 770, engraving: { enabled: true, name: "أبونا مينا", lang: "ar", zoneVersion: 1, customizationId: "x" } }], total: 770 }) });
      return res.status;
    }, PRODUCT);
    check("admin: unticking «السماح بالكتابة» + «حفظ ونشر» hides the section at once and the server refuses names", off?.engraving?.enabled === false && gone && refused === 409, JSON.stringify({ enabled: off?.engraving?.enabled, gone, refused }));
    await page.screenshot({ path: shot("17-after-turning-off.png") });
  }

  check("no page errors", errors.length === 0, errors.join(" | "));
  check("no request left the sandbox", after.blockedRequests.length === 0, after.blockedRequests.join(", "));
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ results, layout, state: after }, null, 2));
  await browser.close();
  console.log(`${results.filter((x) => x.ok).length}/${results.length} passed`);
  process.exit(results.every((x) => x.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
