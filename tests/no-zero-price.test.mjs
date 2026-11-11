// No product is ever offered at 0 ج.م: an unpriced product is hidden from the catalog,
// cannot be added to the cart, and the admin refuses to publish it as «متاح».
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { extractFunction } from "./helpers/storefront-sandbox.mjs";

globalThis.caches = { default: { async match() { return null; }, async put() {} } };
const worker = (await import(`../cloudflare-worker.js?no-zero-price=${Date.now()}`)).default;

const priced = { id: "priced", name: "منتج بسعر", price: 40, stock: "متاح", variants: [{ id: "priced-default", price: 40, available: true, sku: "P1" }] };
const nullPrice = { id: "null-price", name: "منتج بدون سعر", price: null, stock: "متاح", variants: [{ id: "null-price-default", price: null, available: true, sku: "P2" }] };
const zeroPrice = { id: "zero-price", name: "منتج بسعر صفر", price: 0, stock: "متاح", variants: [{ id: "zero-price-default", price: 0, available: true, sku: "P3" }] };

test("the catalog never lists a product without a real price", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify([priced, nullPrice, zeroPrice]), { status: 200, headers: { ETag: "no-zero-price" } }));
  const env = { ASSETS: { async fetch(request) {
    if (new URL(request.url).pathname === "/thumbnail-manifest-v2.json") return Response.json({});
    return new Response("not found", { status: 404 });
  } } };
  const response = await worker.fetch(new Request("https://popekyrillos.store/api/catalog?page=1&limit=48"), env, { waitUntil() {} });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.items.map((item) => item.id), ["priced"]);
});

test("the product page shows no 0 ج.م and keeps the add button off without a price", () => {
  const source = fs.readFileSync("product-page.js", "utf8");
  const context = { Number, Intl, Boolean, product: nullPrice, madeToOrder: false };
  vm.createContext(context);
  const realPrice = source.match(/const realPrice = [^\n]+/)[0];
  const money = source.match(/const money = [^\n]+/)[0];
  vm.runInContext([realPrice, money, extractFunction(source, "available"), extractFunction(source, "canAdd"), "this.money = money; this.canAdd = canAdd;"].join("\n"), context);
  assert.equal(context.money(null), "");
  assert.equal(context.money(0), "");
  assert.equal(context.money(""), "");
  assert.match(context.money(40), /ج\.م/);
  assert.equal(context.canAdd(nullPrice.variants[0]), false);
  context.product = zeroPrice;
  assert.equal(context.canAdd(zeroPrice.variants[0]), false);
  context.product = priced;
  assert.equal(context.canAdd(priced.variants[0]), true);
});

test("the storefront and cart treat an unpriced option as unavailable", () => {
  const script = fs.readFileSync("script.js", "utf8");
  const checkout = fs.readFileSync("checkout-flow.js", "utf8");
  const context = { Number };
  vm.createContext(context);
  vm.runInContext([
    "function variantQuantity(variant) { return variant?.quantity ?? null; }",
    extractFunction(script, "isProductUnavailable"),
    extractFunction(script, "variantPrice"),
    extractFunction(script, "isVariantAvailable"),
    extractFunction(checkout, "isCartLineUnavailable"),
    "this.isVariantAvailable = isVariantAvailable; this.isCartLineUnavailable = isCartLineUnavailable;"
  ].join("\n"), context);
  assert.equal(context.isVariantAvailable(nullPrice.variants[0], nullPrice), false);
  assert.equal(context.isVariantAvailable(zeroPrice.variants[0], zeroPrice), false);
  assert.equal(context.isVariantAvailable(priced.variants[0], priced), true);
  assert.equal(context.isCartLineUnavailable(nullPrice, nullPrice.variants[0]), true);
  assert.equal(context.isCartLineUnavailable(zeroPrice, zeroPrice.variants[0]), true);
  assert.equal(context.isCartLineUnavailable(priced, priced.variants[0]), false);
});

test("the admin refuses to publish a «متاح» product without a price", () => {
  const admin = fs.readFileSync("admin.js", "utf8");
  const context = { state: { products: [priced, nullPrice, zeroPrice, { ...nullPrice, id: "draft", stock: "غير متاح حاليا" }] }, Number, Array };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(admin, "productsOnSaleWithoutPrice")}\nthis.list = productsOnSaleWithoutPrice;`, context);
  assert.deepEqual([...context.list()], ["منتج بدون سعر (null-price)", "منتج بسعر صفر (zero-price)"]);
  assert.match(admin, /const unpriced = productsOnSaleWithoutPrice\(\);\n    if \(unpriced\.length\)/);
});
