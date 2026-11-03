// Priest-name engraving on hand crosses: shared rules (cross-engraving.js), the cart line
// (checkout-flow.js) and the order (cloudflare-worker.js). Fake catalog and fake Airtable only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createOrderResponse, normalizeOrderItems } from "../cloudflare-worker.js";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";
import { extractFunction } from "./helpers/storefront-sandbox.mjs";

const require = createRequire(import.meta.url);
const { CrossEngraving: E, CopticLegacy } = require("../cross-engraving.js");
const checkoutSource = fs.readFileSync(new URL("../checkout-flow.js", import.meta.url), "utf8");
const origin = "https://popekyrillos.store";

const engraving = { enabled: true, previewImage: "assets/products/gallery/cross-unboxed.webp", languages: ["ar", "en", "cop"], fee: 0, version: 3,
  zone: { x: 0.64, y: 0.6, len: 0.33, thick: 0.05, angle: 90, surface: "flat", finish: "ink", color: "#18130e", confirmed: true, maxChars: { ar: 24, en: 24, cop: 20 } } };
const catalog = [
  { id: "cross-2", name: "طقم صلبان يد وصدر كوريان - موديل 2", price: 770, stock: "متاح", variants: [], engraving },
  { id: "book-1", sku: "BOOK-1", name: "كتاب", price: 120, stock: "متاح", variants: [] }
];
const line = (name, lang = "ar", extra = {}) => ({
  productId: "cross-2", name: "طقم صلبان يد وصدر كوريان - موديل 2", quantity: 1, price: 770, lineTotal: 770,
  engraving: { enabled: true, name, lang, finish: "ink", zoneVersion: 3, customizationId: E.lineKey(lang, name) }, ...extra
});

test("names are cleaned and checked per language, with a per-product letter limit", () => {
  const zone = E.normalizeSettings(engraving).zone;
  assert.deepEqual(E.validateName("  القمص   يوحنا‏ مرقس ", "ar", zone), { ok: true, name: "القمص يوحنا مرقس", count: 16, max: 24 });
  assert.equal(E.validateName("Fr. Mina", "ar", zone).code, "chars");
  assert.equal(E.validateName("ابونا<script>", "ar", zone).code, "chars");
  assert.equal(E.validateName("ⲘⲎⲚⲀ", "cop", zone).ok, true);
  assert.equal(E.validateName("Mina", "cop", zone).code, "chars");
  assert.equal(E.validateName("القمص بيشوي يوحنا مرقس عبد المسيح", "ar", zone).code, "length");
  assert.equal(E.validateName("", "en", zone).code, "empty");
});

test("each language + name gets its own stable line key", () => {
  assert.equal(E.lineKey("ar", "أبونا مينا"), E.lineKey("ar", " أبونا  مينا "));
  assert.notEqual(E.lineKey("ar", "أبونا مينا"), E.lineKey("ar", "أبونا بيشوي"));
  assert.notEqual(E.lineKey("ar", "Mina"), E.lineKey("en", "Mina"));
});

test("admin settings are clamped to safe values and the fee stays off", () => {
  const s = E.normalizeSettings({ enabled: true, fee: 50, zone: { x: 7, fontMin: 0.9, fontMax: 0.5, finish: "neon", maxChars: { ar: 500 } }, languages: ["ar", "xx"] });
  assert.equal(s.zone.x, 1);
  assert.equal(s.zone.fontMin, 0.5);
  assert.equal(s.zone.finish, "ink");
  assert.equal(s.zone.color, "");
  assert.equal(s.zone.maxChars.ar, 60);
  assert.deepEqual(s.languages, ["ar"]);
  assert.equal(s.fee, 0);
  assert.equal(E.normalizeSettings(null).enabled, false);
  assert.equal(E.normalizeSettings({ enabled: true, zone: { finish: "gold" } }).zone.finish, "filled", "older drafts keep working");
  assert.equal(s.copticFont, "noto", "Noto Sans Coptic unless the admin picks CS New Athanasius");
  assert.equal(E.normalizeSettings({ copticFont: "athanasius" }).copticFont, "athanasius");
  assert.equal(E.normalizeSettings({ copticFont: "comic" }).copticFont, "noto");
  assert.equal(s.freeNote, false, "«الكتابة مجانية» shows only when the admin ticks it");
  assert.equal(E.normalizeSettings({ freeNote: true }).freeNote, true);
});

test("engraving stays off for customers until the photo, the colour and the writing area are set", () => {
  const ready = E.normalizeSettings(engraving);
  assert.equal(ready.enabled, true);
  assert.deepEqual(ready.missing, []);
  const noColor = E.normalizeSettings({ ...engraving, zone: { ...engraving.zone, color: "" } });
  assert.equal(noColor.enabled, false);
  assert.deepEqual(noColor.missing, ["color"]);
  const badColor = E.normalizeSettings({ ...engraving, zone: { ...engraving.zone, color: "black" } });
  assert.equal(badColor.enabled, false);
  const unchecked = E.normalizeSettings({ ...engraving, zone: { ...engraving.zone, confirmed: false } });
  assert.deepEqual(unchecked.missing, ["zone"]);
  const noPhoto = E.normalizeSettings({ ...engraving, previewImage: "" });
  assert.deepEqual(noPhoto.missing, ["previewImage"]);
});

test("CS New Athanasius display encoding round-trips and never shows a wrong letter", () => {
  for (const name of ["ⲒⲰⲀⲚⲚⲎⲤ ⲘⲀⲢⲔⲞⲤ", "Ⲁⲃⲃⲁ Ⲡⲓϣⲟⲓ", "ⲡ̀ⲓⲱⲧ", "ϯϩⲩⲅⲟⲩⲙⲉⲛⲟⲥ"]) {
    const enc = CopticLegacy.toNewAthanasius(name);
    assert.equal(enc.ok, true, name);
    assert.equal(CopticLegacy.fromNewAthanasius(enc.text), name.normalize("NFC"));
  }
  assert.equal(CopticLegacy.toNewAthanasius("ⲙ̅").ok, false, "no overlined glyph: fall back to the Unicode font");
});

test("the cart keeps the name and language, and two names stay two lines", () => {
  const context = { Map, Number, String, Math, Array, Object, JSON, cartItemMetadata: new Map(), cartSeparator: "::" };
  vm.createContext(context);
  vm.runInContext(["cartKey", "parseCartKey", "cartMapFromPayload", "cartPayloadFromMap"].map((n) => extractFunction(checkoutSource, n)).join("\n"), context);
  const map = context.cartMapFromPayload([
    { productId: "cross-2", variantId: "default", lineId: "abc~eng-1", qty: 1, engraving: { enabled: true, name: "أبونا مينا", lang: "ar", zoneVersion: 3, injected: "x" } },
    { productId: "cross-2", variantId: "default", lineId: "abc~eng-2", qty: 2, engraving: { enabled: true, name: "Fr. Mark", lang: "en" } },
    { productId: "cross-2", variantId: "default", qty: 1 }
  ]);
  assert.equal(map.size, 3);
  const payload = JSON.parse(JSON.stringify(context.cartPayloadFromMap(map)));
  assert.deepEqual(payload.map((p) => [p.lineId || "", p.qty, p.engraving?.name || ""]), [["abc~eng-1", 1, "أبونا مينا"], ["abc~eng-2", 2, "Fr. Mark"], ["", 1, ""]]);
  assert.equal(payload[0].engraving.injected, undefined, "unknown fields are dropped");
});

test("the server re-checks the name and refuses invisible tricks or other scripts", () => {
  const ok = normalizeOrderItems([line("أبونا مينا")]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.items[0].engraving.name, "أبونا مينا");
  assert.equal(ok.items[0].engraving.langLabel, "العربية");
  assert.deepEqual(normalizeOrderItems([line("Mina <b>", "en")]).errors, ["products[0].engraving"]);
  assert.deepEqual(normalizeOrderItems([line("ابونا مينا", "cop")]).errors, ["products[0].engraving"]);
  assert.equal(normalizeOrderItems([line("أبونا‮ مينا")]).items[0].engraving.name, "أبونا مينا");
  assert.equal(normalizeOrderItems([{ productId: "book-1", quantity: 1, price: 120 }]).items[0].engraving, undefined);
  for (const name of ["ⲡ̀ⲓⲱⲧ ⲙⲏⲛⲁ", "Ⲁⲃⲃⲁ Ⲡⲓϣⲟⲓ", "ϯϩⲩⲅⲟⲩⲙⲉⲛⲟⲥ ⲙ̅"]) {
    const r = normalizeOrderItems([line(name, "cop")]);
    assert.deepEqual(r.errors, [], name);
    assert.equal(r.items[0].engraving.name, name.normalize("NFC"), "Coptic letters and marks are kept as Unicode");
  }
});

async function setup(t) {
  const f = airtableFixture();
  f.catalog = catalog;
  t.mock.method(globalThis, "fetch", f.fetch);
  let n = 0;
  f.order = (products) => {
    const payload = { requestId: `eng-${++n}`, customerName: "عميل تجريبي", phone: "01012345678", address: "القاهرة", paymentMethod: "InstaPay", deliveryType: "Shipping",
      products, total: products.reduce((s, p) => s + p.lineTotal, 0) };
    return createOrderResponse({ env: f.env, request: new Request(origin + "/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Request-Id": payload.requestId, "CF-Connecting-IP": "192.0.2.20" }, body: JSON.stringify(payload) }) });
  };
  return f;
}

test("the same cross twice with two names: one order, two lines, names never mixed", async (t) => {
  const f = await setup(t);
  const response = await f.order([line("القمص يوحنا مرقس"), line("ⲘⲎⲚⲀ", "cop", { quantity: 2, lineTotal: 1540 }), { productId: "book-1", sku: "BOOK-1", name: "كتاب", quantity: 1, price: 120, lineTotal: 120 }]);
  assert.equal(response.status, 200, await response.clone().text());
  const [saved] = [...f.orders.values()].map((o) => o.fields);
  assert.equal(saved.Total, 770 + 1540 + 120);
  const lines = saved.Products.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /الاسم على الصليب: «القمص يوحنا مرقس» \| لغة الكتابة: العربية/);
  assert.match(lines[1], /الاسم على الصليب: «ⲘⲎⲚⲀ» \| لغة الكتابة: القبطية/);
  assert.match(lines[1], /الكمية: 2/);
  assert.doesNotMatch(lines[2], /الاسم على الصليب/);
  const notes = f.details.map((d) => d.fields["ملاحظات"] || "");
  assert.match(notes[0], /«القمص يوحنا مرقس»/);
  assert.doesNotMatch(notes[0], /ⲘⲎⲚⲀ/);
  assert.match(notes[1], /«ⲘⲎⲚⲀ»/);
  assert.doesNotMatch(notes[1], /يوحنا/);
  assert.equal(f.details[1].fields["الكمية"], 2);
});

test("a name on a product without engraving, a closed language or a too-long name is refused before Airtable", async (t) => {
  const f = await setup(t);
  const onBook = await f.order([{ productId: "book-1", sku: "BOOK-1", name: "كتاب", quantity: 1, price: 120, lineTotal: 120, engraving: { enabled: true, name: "أبونا مينا", lang: "ar" } }]);
  assert.equal(onBook.status, 409);
  assert.equal((await onBook.json()).error, "engraving_invalid");
  f.catalog = [{ ...catalog[0], engraving: { ...engraving, languages: ["ar"] } }];
  assert.equal((await f.order([line("Fr. Mina", "en")])).status, 409);
  f.catalog = [{ ...catalog[0], engraving: { ...engraving, zone: { ...engraving.zone, maxChars: { ar: 8, en: 24, cop: 20 } } } }];
  assert.equal((await f.order([line("القمص يوحنا مرقس")])).status, 409);
  f.catalog = [{ ...catalog[0], engraving: { ...engraving, enabled: false } }];
  assert.equal((await f.order([line("أبونا مينا")])).status, 409);
  f.catalog = [{ ...catalog[0], engraving: { ...engraving, zone: { ...engraving.zone, color: "" } } }];
  assert.equal((await f.order([line("أبونا مينا")])).status, 409, "no writing colour set yet");
  f.catalog = [{ ...catalog[0], engraving: { ...engraving, zone: { ...engraving.zone, confirmed: false } } }];
  assert.equal((await f.order([line("أبونا مينا")])).status, 409, "writing area not checked yet");
  assert.equal(f.creates, 0);
  assert.equal(f.writes.length, 0);
});

test("product pages load the engraving files only when the admin enabled it", () => {
  const worker = fs.readFileSync(new URL("../cloudflare-worker.js", import.meta.url), "utf8");
  assert.match(worker, /const engravingOn = engravingReady\(product\?\.engraving\);/);
  assert.match(worker, /\$\{engravingScripts\}<script src="\/product-page\.js\?v=26" defer><\/script>/);
  const build = fs.readFileSync(new URL("../scripts/build-cloudflare.js", import.meta.url), "utf8");
  for (const file of ["cross-engraving.js", "product-engraving.js", "product-engraving.css", "admin-engraving.js"]) assert.match(build, new RegExp(`"${file.replace(".", "\\.")}"`));
  for (const f of ["CS-New-Athanasius.ttf", "cs-new-athanasius.ttf"]) assert.ok(!fs.existsSync(new URL(`../assets/fonts/engraving/${f}`, import.meta.url)), "CS New Athanasius is not shipped until its licence is confirmed");
});
