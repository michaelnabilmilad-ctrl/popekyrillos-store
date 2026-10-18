// Unavailable cart lines stay in the cart with a visible notice, are left out of
// totals, and block moving on to checkout until removed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { extractFunction, scriptSource } from "./helpers/storefront-sandbox.mjs";

const checkoutSource = fs.readFileSync("checkout-flow.js", "utf8");
const available = { id: "cross-1", name: "صليب", price: 450, stock: "متاح", variants: [] };
const soldOut = { id: "censer-1", name: "شورية", price: 1200, stock: "غير متاح حاليا", variants: [] };
const zeroStockVariant = { id: "book-1", name: "كتاب", price: 300, variants: [{ id: "large", price: 300, quantity: 0 }] };

function checkoutCart(lines) {
  const context = {
    cart: new Map(lines), cartItemMetadata: new Map(), cartSeparator: "::", Number, String, Map, Object,
    getProduct: (id) => [available, soldOut, zeroStockVariant].find((product) => product.id === id),
    findVariant: (product, variantId) => (product.variants || []).find((variant) => variant.id === variantId) || null,
    variantPrice: (variant, product) => Number(variant?.price ?? product.price),
    variantOptionText: () => ""
  };
  vm.createContext(context);
  vm.runInContext(["parseCartKey", "isCartLineUnavailable", "cartEntries", "cartHasUnavailableLines", "cartTotal"]
    .map((name) => extractFunction(checkoutSource, name)).join("\n\n"), context);
  return context;
}

test("the cart page flags sold-out and zero-stock lines without dropping them", () => {
  const page = checkoutCart([["cross-1::default", 1], ["censer-1::default", 1], ["book-1::large", 2]]);
  const entries = page.cartEntries();
  assert.deepEqual(JSON.parse(JSON.stringify(entries.map((item) => [item.product.id, item.unavailable]))), [["cross-1", false], ["censer-1", true], ["book-1", true]]);
  assert.equal(page.cartHasUnavailableLines(), true);
  assert.equal(page.cartTotal(), 450, "only orderable lines count toward the total");
});

test("a cart with only available lines can continue", () => {
  const page = checkoutCart([["cross-1::default", 2]]);
  assert.equal(page.cartHasUnavailableLines(), false);
  assert.equal(page.cartTotal(), 900);
});

test("the cart page shows the notice and blocks continue and order submission", () => {
  const render = extractFunction(checkoutSource, "renderCartPage");
  assert.match(render, /item\.unavailable \? `<p class="cart-unavailable"/);
  assert.match(render, /unavailableBlock/);
  assert.match(render, /setAttribute\("aria-disabled", "true"\)/);
  assert.match(extractFunction(checkoutSource, "bindCartPage"), /cartHasUnavailableLines\(\)\) event\.preventDefault/);
  assert.match(checkoutSource, /if \(cartHasUnavailableLines\(\)\) \{\s*if \(status\) status\.textContent = t\("unavailableBlock"\);\s*return;/);
});

test("the storefront mini cart shows the notice for an unavailable line", () => {
  const miniCartItems = { innerHTML: "" };
  const context = {
    miniCartItems, miniCartTotal: { textContent: "" }, products: [],
    formatter: new Intl.NumberFormat("ar-EG"), t: (key) => key, money: (value) => `${value}`,
    displayText: String, localized: (value) => value, getVariantImages: () => [], getProductImages: () => [],
    productImageUrl: (image) => image, escapeHtml: String
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(scriptSource, "renderMiniCart"), context);
  context.renderMiniCart([{ product: soldOut, variant: null, qty: 1, price: 1200, optionText: "", unavailable: true }], 0, 1, false);
  assert.match(miniCartItems.innerHTML, /cartLineUnavailable/);
});
