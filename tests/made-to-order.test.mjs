// Made-to-order hand crosses: a cross with a priest name is made at the factory for the order,
// so it never depends on stock (site stock text, variant quantity or Airtable). Everything else
// keeps the normal stock rules. Fake catalog and fake Airtable only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createOrderResponse } from "../cloudflare-worker.js";
import { priceOrderItems, purchasableOffers } from "../functions/_order-pricing.js";
import { validateCartItems } from "../functions/_paymob-utils.js";
import { isMadeToOrderLine, isMadeToOrderProduct } from "../functions/_made-to-order.js";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";
import { extractFunction } from "./helpers/storefront-sandbox.mjs";

const require = createRequire(import.meta.url);
const { CrossEngraving: E } = require("../cross-engraving.js");
const origin = "https://popekyrillos.store";

const zone = { x: 0.6385, y: 0.6, len: 0.33, thick: 0.05, angle: 90, surface: "flat", finish: "ink", color: "#ffffff", confirmed: true, maxChars: { ar: 34, en: 24, cop: 20 } };
const engraving = { enabled: true, previewSource: "assets/products/gallery/cross.webp",
  previewImage: "assets/optimized/products/gallery/engraving-cross-2-protected-preview-20261103-abc123.webp", previewWatermark: { zone: E.zoneKey(zone) },
  photoConfirmed: true, languages: ["ar"], fee: 0, version: 1, zone };
// Out of stock on the site AND zero quantity on its only option.
const crossOutOfStock = { id: "cross-2", name: "طقم صلبان يد وصدر كوريان بالعلبة - موديل 2", price: 770, stock: "غير متاح حاليا",
  variants: [{ id: "default", sku: "POPEK-CORIAN-CROSS-02", price: 770, quantity: 0, available: false, options: {} }], engraving };
const bookOutOfStock = { id: "book-0", sku: "BOOK-0", name: "كتاب نفد", price: 90, stock: "غير متاح حاليا", variants: [] };
const book = { id: "book-1", sku: "BOOK-1", name: "كتاب", price: 120, stock: "متاح", variants: [] };
const catalog = [crossOutOfStock, bookOutOfStock, book];

const named = (name = "القمص يوحنا مرقس", extra = {}) => ({ productId: "cross-2", variantId: "default", sku: "POPEK-CORIAN-CROSS-02", name: crossOutOfStock.name, quantity: 1, price: 770, lineTotal: 770,
  engraving: { enabled: true, name, lang: "ar", finish: "ink", zoneVersion: 1, customizationId: E.lineKey("ar", name) }, ...extra });
const plainCross = { productId: "cross-2", variantId: "default", sku: "POPEK-CORIAN-CROSS-02", name: crossOutOfStock.name, quantity: 1, price: 770, lineTotal: 770 };
const bookLine = { productId: "book-1", sku: "BOOK-1", name: "كتاب", quantity: 1, price: 120, lineTotal: 120 };

async function setup(t, { airtableProducts = true, detailFieldExists = true } = {}) {
  const f = airtableFixture();
  f.catalog = catalog;
  f.productCreates = 0;
  f.detailRejects = 0;
  const base = f.fetch;
  f.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const table = decodeURIComponent(url.pathname).split("/")[3];
    const method = init.method || "GET";
    if (url.hostname === "api.airtable.com" && table === "المنتجات") {
      if (method === "POST") { f.productCreates++; return Response.json({ records: [{ id: "recAutoCreated000" }] }); }
      if (!airtableProducts) return Response.json({ records: [] });
    }
    if (url.hostname === "api.airtable.com" && table === "تفاصيل الطلبات" && method === "POST" && !detailFieldExists
      && JSON.parse(init.body).records.some((r) => "تصنيع مخصوص" in r.fields)) {
      f.detailRejects++;
      return Response.json({ error: { type: "UNKNOWN_FIELD_NAME", message: "Unknown field name: \"تصنيع مخصوص\"" } }, { status: 422 });
    }
    return base(input, init);
  };
  t.mock.method(globalThis, "fetch", f.fetch);
  let n = 0;
  f.order = (products) => {
    const payload = { requestId: `mto-${++n}`, customerName: "عميل تجريبي", phone: "01012345678", address: "القاهرة", paymentMethod: "Cash", deliveryType: "Pickup",
      products, total: products.reduce((s, p) => s + p.lineTotal, 0) };
    return createOrderResponse({ env: f.env, request: new Request(origin + "/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Request-Id": payload.requestId, "CF-Connecting-IP": "192.0.2.30" }, body: JSON.stringify(payload) }) });
  };
  // The two stock automations in Airtable, with the extra condition proposed for them:
  // «تصنيع مخصوص» is not checked. (Deduct on «قيد التجهيز»; the return on cancel is the fixture's.)
  f.runDeductAutomation = (row) => {
    const x = row.fields;
    if (x["تصنيع مخصوص"] || x["تم خصم المخزون؟"] || !x["المنتج"]?.length || !(x["الكمية"] > 0)) return "not-eligible";
    x["تم خصم المخزون؟"] = true;
    f.stock -= x["الكمية"];
    return "deducted";
  };
  const plainReturn = f.runReturnAutomation;
  f.runReturnAutomation = (row, options) => (row.fields["تصنيع مخصوص"] ? "not-eligible" : plainReturn(row, options));
  return f;
}

test("1. a cross with a name orders even with zero stock on the site; without a name it is refused", async (t) => {
  const f = await setup(t);
  const ok = await f.order([named()]);
  assert.equal(ok.status, 200, await ok.clone().text());
  const [saved] = [...f.orders.values()].map((o) => o.fields);
  assert.equal(saved.Total, 770);
  assert.match(saved.Products, /تصنيع مخصوص \| الاسم على الصليب: «القمص يوحنا مرقس» \| لغة الكتابة: العربية/);
  assert.equal(f.details.length, 1);
  assert.equal(f.details[0].fields["تصنيع مخصوص"], true);
  const plain = await f.order([plainCross]);
  assert.equal(plain.status, 409, "the same cross without a name follows the normal stock rule");
  assert.equal(f.orders.size, 1);
});

test("2. a model that is not in Airtable is saved unlinked, and no product is added to Airtable", async (t) => {
  const f = await setup(t, { airtableProducts: false });
  const ok = await f.order([named("أبونا مينا")]);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal(f.productCreates, 0, "never adds a product (or a balance) to Airtable");
  const row = f.details[0].fields;
  assert.equal(row["المنتج"], undefined);
  assert.equal(row["تصنيع مخصوص"], true);
  assert.match(row["ملاحظات"], /موديل غير مسجل في منتجات Airtable: .*موديل 2 \| SKU: POPEK-CORIAN-CROSS-02 \| تصنيع مخصوص، مش محتاج رصيد/);
  assert.match(row["ملاحظات"], /«أبونا مينا»/);
  assert.equal(f.runDeductAutomation(f.details[0]), "not-eligible");
});

test("3. a mixed order: the named cross skips stock checks, the regular product keeps them", async (t) => {
  const f = await setup(t);
  const ok = await f.order([named(), bookLine]);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal([...f.orders.values()][0].fields.Total, 890);
  assert.equal(f.details[0].fields["تصنيع مخصوص"], true);
  assert.equal(f.details[1].fields["تصنيع مخصوص"], undefined, "regular lines are never flagged");
  const refused = await f.order([named("أبونا بيشوي"), { productId: "book-0", sku: "BOOK-0", name: "كتاب نفد", quantity: 1, price: 90, lineTotal: 90 }]);
  assert.equal(refused.status, 409, "an out-of-stock regular product still blocks the order");
  assert.equal(f.orders.size, 1);
});

test("4. processing then cancelling: the named cross is never deducted or returned; the regular line nets to zero", async (t) => {
  const f = await setup(t);
  assert.equal((await f.order([named(), bookLine])).status, 200);
  const start = f.stock;
  const [cross, regular] = f.details;
  assert.deepEqual([f.runDeductAutomation(cross), f.runDeductAutomation(regular)], ["not-eligible", "deducted"]);
  assert.equal(f.stock, start - 1);
  const order = [...f.orders.values()][0];
  await f.fetch(`https://api.airtable.com/v0/appTest/Orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ fields: { "Order Status": "ملغي" } }) });
  assert.equal(f.stock, start, "only the regular line came back");
  assert.equal(cross.fields["تم خصم المخزون؟"], undefined);
  assert.equal(cross.fields["تم إرجاع المخزون؟"], undefined);
  assert.equal(f.movements.length, 1);
  assert.equal(f.movements[0].product, "recProduct00000001");
});

test("5. the admin gets the model, SKU, name, language and quantity; the order saves even before the Airtable field exists", async (t) => {
  const f = await setup(t, { detailFieldExists: false });
  const ok = await f.order([named("القمص يوحنا مرقس", { quantity: 2, lineTotal: 1540 }), bookLine]);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal(f.detailRejects, 1, "one rejected try, then saved without the checkbox");
  assert.equal(f.details.length, 2);
  assert.equal(f.details[0].fields["تصنيع مخصوص"], undefined);
  assert.match(f.details[0].fields["ملاحظات"], /^تصنيع مخصوص \| الاسم على الصليب: «القمص يوحنا مرقس» \| لغة الكتابة: العربية/);
  assert.equal(f.details[0].fields["الكمية"], 2);
  const products = [...f.orders.values()][0].fields.Products;
  // What the admin orders page reads (admin-orders.js engravingLines).
  const admin = fs.readFileSync(new URL("../admin-orders.js", import.meta.url), "utf8");
  const context = { String };
  vm.createContext(context);
  vm.runInContext(extractFunction(admin, "engravingLines"), context);
  const [item] = JSON.parse(JSON.stringify(context.engravingLines({ products })));
  assert.equal(item.name, "القمص يوحنا مرقس");
  assert.equal(item.lang, "العربية");
  assert.equal(item.qty, "2");
  assert.equal(item.sku, "POPEK-CORIAN-CROSS-02");
  assert.equal(item.product, crossOutOfStock.name);
  assert.equal(item.previewUrl, `/products/cross-2#engrave=${encodeURIComponent("ar:القمص يوحنا مرقس")}`);
  assert.match(admin, /🛠️ تصنيع مخصوص/);
});

test("6. regular products cannot be ordered when out of stock (server, online payment and cart)", async (t) => {
  const f = await setup(t);
  const response = await f.order([{ productId: "book-0", sku: "BOOK-0", name: "كتاب نفد", quantity: 1, price: 90, lineTotal: 90 }]);
  assert.equal(response.status, 409);
  assert.equal(f.creates, 0);
  const priced = priceOrderItems([{ websiteProductId: "book-0", quantity: 1 }, { websiteProductId: "cross-2", quantity: 1 }, { websiteProductId: "cross-2", quantity: 1, engraving: { name: "x" } }], catalog);
  assert.deepEqual(priced.errors.map((e) => [e.index, e.code]), [[0, "unavailable"], [1, "unavailable"]]);
  assert.equal(priced.lines[2].unitPrice, 770);
  // Paymob / Bosta use the same rule.
  const context = { loadFreshCatalog: async () => catalog };
  await assert.rejects(validateCartItems(context, [{ productId: "book-0", qty: 1 }]), /غير متاح/);
  await assert.rejects(validateCartItems(context, [{ productId: "cross-2", qty: 1 }]), /غير متاح/);
  const secure = await validateCartItems(context, [{ productId: "cross-2", qty: 3, engraving: { name: "أبونا مينا", lang: "ar" } }]);
  assert.equal(secure.items?.[0]?.quantity ?? secure[0]?.quantity, 3);
});

test("the made-to-order rule is the same on the server and in the cart, and needs a fully set-up engraving", () => {
  assert.equal(isMadeToOrderProduct(crossOutOfStock), true);
  assert.equal(isMadeToOrderProduct(book), false);
  assert.equal(isMadeToOrderLine(crossOutOfStock, null), false);
  for (const broken of [{ enabled: false }, { photoConfirmed: false }, { zone: { ...zone, color: "" } }, { zone: { ...zone, confirmed: false } }, { previewImage: "assets/products/gallery/cross.webp" }, { zone: { ...zone, x: 0.6 } }]) {
    assert.equal(isMadeToOrderProduct({ ...crossOutOfStock, engraving: { ...engraving, ...broken } }), false, JSON.stringify(broken));
  }
  assert.equal(purchasableOffers(crossOutOfStock)[0].available, true, "search results show it as orderable");
  assert.equal(purchasableOffers(bookOutOfStock)[0].available, false);
  const checkout = fs.readFileSync(new URL("../checkout-flow.js", import.meta.url), "utf8");
  const ctx = { String, Number, Math, Boolean };
  vm.createContext(ctx);
  vm.runInContext(["engravingZoneKey", "isMadeToOrderProduct", "isMadeToOrderLine"].map((n) => extractFunction(checkout, n)).join("\n"), ctx);
  for (const product of [crossOutOfStock, book, { ...crossOutOfStock, engraving: { ...engraving, photoConfirmed: false } }]) {
    assert.equal(ctx.isMadeToOrderLine(product, { name: "x" }), isMadeToOrderLine(product, { name: "x" }));
  }
});
