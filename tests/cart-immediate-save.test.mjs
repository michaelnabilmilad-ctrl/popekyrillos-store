// Regression for the live "cart is empty right after adding" bug: renderMiniCart
// referenced an undefined `product` and threw inside addToCart before the cart was
// saved. These tests render the mini cart for real and pin the save-before-render order.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { extractFunction, scriptSource } from "./helpers/storefront-sandbox.mjs";

test("the mini cart renders an item with an image without throwing", () => {
  const miniCartItems = { innerHTML: "" };
  const context = {
    miniCartItems, miniCartTotal: { textContent: "" }, products: [{ id: "cross-1" }],
    formatter: new Intl.NumberFormat("ar-EG"),
    t: (key) => key, money: (value) => `${value} ج.م`, displayText: (value) => String(value), localized: (value) => value,
    getVariantImages: () => [], getProductImages: (product) => product.images || [], productImageUrl: (image) => `/${image}`,
    escapeHtml: (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(scriptSource, "renderMiniCart"), context);
  const item = { product: { id: "cross-1", name: "صليب يد", images: ["assets/cross.webp"] }, variant: null, qty: 2, price: 450, optionText: "" };
  assert.doesNotThrow(() => context.renderMiniCart([item], 900, 2, false));
  assert.match(miniCartItems.innerHTML, /صليب يد/);
  assert.match(miniCartItems.innerHTML, /alt="صليب يد"/);
});

test("adding and changing quantities save the cart before rendering it", () => {
  for (const name of ["addToCart", "changeQty"]) {
    const source = extractFunction(scriptSource, name);
    const save = source.indexOf("saveCartNow(");
    const render = source.indexOf("renderCart(");
    assert.ok(save > 0 && render > 0, `${name} saves and renders`);
    assert.ok(save < render, `${name} must persist before rendering`);
  }
});

test("a returning signed-in customer's session is restored on page load so cart edits reach the account", () => {
  const boot = scriptSource.slice(scriptSource.lastIndexOf("loadProducts();"));
  assert.match(boot, /if \(state\.auth\.sessionHint\) \{[\s\S]*?loadAuthConfig\(\)/, "restores the session only when a session may exist on this device");
  assert.match(boot, /ensureAuthServices\(\)/);
  assert.doesNotMatch(scriptSource.slice(0, scriptSource.lastIndexOf("loadProducts();")).split("\n").slice(-12).join("\n"), /loadAuthConfig\(\)\s*;?\s*$/m, "guests do not load Firebase on page load");
});
