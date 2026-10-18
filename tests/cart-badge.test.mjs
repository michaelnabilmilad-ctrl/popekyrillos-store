// Cart badge regressions: after a reload, a back/forward navigation or an add on
// another page, every page must show the same count as the saved cart, using one
// rule (sum of whole, positive quantities), and never a placeholder "0" first.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { FakeStorage, storefrontTab, productPageAdd, extractFunction, scriptSource } from "./helpers/storefront-sandbox.mjs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const checkoutSource = read("checkout-flow.js");
const productPageSource = read("product-page.js");
const badgeSource = read("cart-badge.js");
const GUEST = "pope-kyrillos-cart:guest";
const ACTIVE = "pope-kyrillos-cart:active";
const AUTH = "pope-kyrillos-auth:user";
const userKey = (uid) => `pope-kyrillos-cart:user:${uid}`;
const catalog = ["cross-1", "censer-1", "book-1", "icon-1"].map((id) => ({ id, name: id, price: 100, stock: "متاح", variants: [] }));

function saved(items, updatedAt = "2026-10-18T10:00:00.000Z") {
  return JSON.stringify({ items, updatedAt });
}

function fakeDocument(badges = 2, lang = "ar") {
  const nodes = Array.from({ length: badges }, () => ({ textContent: "" }));
  return { nodes, document: { documentElement: { lang }, querySelectorAll: (selector) => (selector === "[data-cart-count]" ? nodes : []) } };
}

function fakeWindow() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    fire(type, event = {}) { (listeners[type] || []).forEach((handler) => handler(event)); }
  };
}

// cart-badge.js as loaded by policies.html.
function badgePage(storage, { badges = 2, lang = "ar" } = {}) {
  const { nodes, document } = fakeDocument(badges, lang);
  const window = fakeWindow();
  const context = { localStorage: storage, document, window, Intl, JSON, Date, Math, Number, Array, Set, String };
  vm.createContext(context);
  vm.runInContext(badgeSource, context);
  return { nodes, window };
}

// product-page.js badge code with the real activeCartKey/readCart.
function productPage(storage, { badges = 1, lang = "ar" } = {}) {
  const { nodes, document } = fakeDocument(badges, lang);
  const window = fakeWindow();
  const context = { localStorage: storage, document, window, Intl, JSON, Date, Math, Number, Array, String, guestCartKey: GUEST };
  vm.createContext(context);
  vm.runInContext(["persistedFirebaseProfile", "activeCartKey", "readCart", "cartBadgeCount", "updateCount"].map((name) => extractFunction(productPageSource, name)).join("\n\n"), context);
  context.updateCount();
  return { nodes, context };
}

// checkout-flow.js setCartCount on the cart it loaded.
function checkoutCount(cart) {
  const { nodes, document } = fakeDocument(1);
  const context = { cart, document, formatter: new Intl.NumberFormat("ar-EG"), Math, Number };
  vm.createContext(context);
  vm.runInContext(extractFunction(checkoutSource, "setCartCount"), context);
  context.setCartCount();
  return nodes[0].textContent;
}

function storefrontCount(tab) {
  vm.runInContext(extractFunction(scriptSource, "cartQuantityCount"), tab.context);
  return tab.context.cartQuantityCount();
}

const ar = (n) => new Intl.NumberFormat("ar-EG").format(n);

test("every page starts the badge empty and hides it until the saved cart is read", () => {
  for (const file of ["index.html", "cart.html", "checkout.html", "payment.html", "policies.html", "cloudflare-worker.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /data-cart-count>0</, `${file} must not print a placeholder 0`);
    assert.match(source, /data-cart-count><\/(span|b)>/, `${file} keeps an empty badge`);
  }
  assert.match(read("styles.css"), /\.cart-count:empty \{\n  visibility: hidden;\n\}/);
  assert.match(read("policies.html"), /<script src="\/cart-badge\.js\?v=1" defer><\/script>/, "the policies page now reads the cart");
  assert.match(read("scripts/build-cloudflare.js"), /"cart-badge\.js",/, "cart-badge.js is deployed");
});

test("home, cart page, product page and policies page count the same saved cart identically", () => {
  const storage = new FakeStorage([
    [GUEST, saved([
      { productId: "cross-1", variantId: "default", qty: 2 },
      { productId: "censer-1", variantId: "default", qty: "3" },
      { productId: "book-1", variantId: "default", qty: 1.7 }
    ])],
    [ACTIVE, GUEST]
  ]);
  const home = storefrontTab({ storage, catalog }).load();
  const expected = 2 + 3 + 1;
  assert.equal(storefrontCount(home), expected);
  assert.equal(checkoutCount(home.context.state.cart), ar(expected));
  assert.equal(productPage(storage).nodes[0].textContent, ar(expected));
  assert.deepEqual(badgePage(storage).nodes.map((node) => node.textContent), [ar(expected), ar(expected)]);
});

test("a signed-in customer's badge shows the account cart after a reload, not an older guest cart", () => {
  const uid = "uid-alice";
  const storage = new FakeStorage([
    [AUTH, JSON.stringify({ uid })],
    [userKey(uid), saved([
      { productId: "cross-1", variantId: "default", qty: 1 },
      { productId: "censer-1", variantId: "default", qty: 1 },
      { productId: "book-1", variantId: "default", qty: 1 }
    ], "2026-10-18T12:00:00.000Z")],
    [GUEST, saved([{ productId: "icon-1", variantId: "default", qty: 1 }], "2026-10-18T09:00:00.000Z")],
    [ACTIVE, userKey(uid)]
  ]);
  const home = storefrontTab({ storage, catalog });
  home.context.state.auth = { user: null, ready: false, cachedUser: { uid }, services: null };
  home.load();
  assert.equal(storefrontCount(home), 3);
  assert.equal(productPage(storage).nodes[0].textContent, ar(3));
  assert.equal(badgePage(storage).nodes[0].textContent, ar(3));
});

test("the product page updates every badge on the page, with the same digits as the storefront", () => {
  const storage = new FakeStorage();
  productPageAdd(storage, { productId: "cross-1", variantId: "default", qty: 2 });
  productPageAdd(storage, { productId: "book-1", variantId: "default", qty: 1 });
  const page = productPage(storage, { badges: 2 });
  assert.deepEqual(page.nodes.map((node) => node.textContent), [ar(3), ar(3)]);
  const english = productPage(storage, { badges: 1, lang: "en" });
  assert.equal(english.nodes[0].textContent, "3");
});

test("badges follow adds, removals and quantity changes made in other tabs or pages", () => {
  const storage = new FakeStorage();
  const policies = badgePage(storage);
  assert.equal(policies.nodes[0].textContent, ar(0));
  const home = storefrontTab({ storage, catalog }).load().add("cross-1", 2).add("censer-1");
  policies.window.fire("storage", { key: GUEST });
  assert.equal(policies.nodes[0].textContent, ar(3));
  home.remove("cross-1");
  policies.window.fire("storage", { key: GUEST });
  assert.equal(policies.nodes[0].textContent, ar(1));
});

test("a page restored from the back/forward cache re-reads the saved cart", () => {
  const storage = new FakeStorage();
  const policies = badgePage(storage);
  storefrontTab({ storage, catalog }).load().add("book-1", 4);
  policies.window.fire("pageshow", { persisted: true });
  assert.equal(policies.nodes[0].textContent, ar(4));
  for (const [file, source] of [["script.js", scriptSource], ["checkout-flow.js", checkoutSource], ["product-page.js", productPageSource]]) {
    assert.match(source.replace(/\r\n/g, "\n"), /addEventListener\("pageshow", \(event\) => \{\n?\s*if \(event\.persisted\)/, `${file} refreshes on pageshow`);
  }
});

test("when the sign-in expires the account cart is kept, never copied to the guest cart, and the customer is told", () => {
  const uid = "uid-alice";
  const storage = new FakeStorage([
    [AUTH, JSON.stringify({ uid })],
    [userKey(uid), saved([{ productId: "cross-1", variantId: "default", qty: 3 }])],
    [ACTIVE, userKey(uid)]
  ]);
  const home = storefrontTab({ storage, catalog });
  home.context.state.auth = { user: null, ready: false, cachedUser: { uid }, services: null };
  home.load();
  assert.equal(storefrontCount(home), 3, "cached account cart shows while Firebase starts");
  // What onAuthStateChanged(null) does in script.js.
  home.context.state.auth.ready = true;
  home.context.clearCachedAuthUser();
  home.context.loadGuestCart();
  assert.equal(storefrontCount(home), 0, "the next person on this device does not see the account cart");
  assert.equal(JSON.parse(storage.getItem(userKey(uid))).items[0].qty, 3, "account cart is still saved");
  assert.equal(storage.getItem(GUEST), null, "nothing was copied into the guest cart");
  const source = scriptSource.replace(/\r\n/g, "\n");
  assert.match(source, /const expiredAccountCartCount = !user && state\.auth\.cachedUser/);
  assert.match(source, /if \(expiredAccountCartCount > 0\) \{\n\s*showToast\(/);
});

// Reported on the live site: after a refresh the home badge stayed 0 for good while
// /cart showed the products. Cause: the profile cache was missing while Firebase still
// held a valid session, so the home page never started Firebase and showed the guest
// cart. Every page must now fall back to the session Firebase persists itself.
const FIREBASE_SESSION = "firebase:authUser:demo-key:[DEFAULT]";

function sessionOnlyStorage(uid) {
  return new FakeStorage([
    [FIREBASE_SESSION, JSON.stringify({ uid, email: "alice@test.local", stsTokenManager: { accessToken: "never-copied" } })],
    [userKey(uid), saved([
      { productId: "cross-1", variantId: "default", qty: 1 },
      { productId: "censer-1", variantId: "default", qty: 1 },
      { productId: "book-1", variantId: "default", qty: 1 }
    ])],
    [ACTIVE, GUEST]
  ]);
}

function cachedUserLoader(source, storage) {
  const context = { localStorage: storage, JSON, cachedAuthStorageKey: AUTH };
  vm.createContext(context);
  vm.runInContext(["persistedFirebaseProfile", "loadCachedAuthUser"].map((name) => extractFunction(source, name)).join("\n\n"), context);
  return context.loadCachedAuthUser;
}

test("with only Firebase's own session left, the home badge shows the account cart after a refresh", () => {
  const uid = "uid-alice";
  const storage = sessionOnlyStorage(uid);
  const cachedUser = cachedUserLoader(scriptSource, storage)();
  assert.equal(cachedUser?.uid, uid, "the signed-in customer is recognised");
  const rebuilt = JSON.parse(storage.getItem(AUTH));
  assert.deepEqual(Object.keys(rebuilt).sort(), ["displayName", "email", "photoURL", "uid"], "only profile fields, no tokens");
  const home = storefrontTab({ storage, catalog });
  home.context.state.auth = { user: null, ready: false, cachedUser, services: null };
  home.load();
  assert.equal(storefrontCount(home), 3, "not the empty guest cart");
});

test("the cart page, product page and policies page recognise the same session the same way", () => {
  const uid = "uid-alice";
  assert.equal(cachedUserLoader(checkoutSource, sessionOnlyStorage(uid))()?.uid, uid);
  assert.equal(productPage(sessionOnlyStorage(uid)).nodes[0].textContent, ar(3));
  assert.equal(badgePage(sessionOnlyStorage(uid)).nodes[0].textContent, ar(3));
});

test("a real guest (no cache, no Firebase session) still gets the guest cart", () => {
  const storage = new FakeStorage([[GUEST, saved([{ productId: "icon-1", variantId: "default", qty: 2 }])]]);
  assert.equal(cachedUserLoader(scriptSource, storage)(), null);
  assert.equal(storage.getItem(AUTH), null);
  assert.equal(storefrontCount(storefrontTab({ storage, catalog }).load()), 2);
  assert.equal(badgePage(storage).nodes[0].textContent, ar(2));
});

test("the cart page never copies the account cart into the guest cart on a signed-out event", () => {
  assert.doesNotMatch(checkoutSource, /moveCheckoutCartToGuest/);
  assert.doesNotMatch(scriptSource, /moveCurrentCartToGuest/);
});

test("the home badge is refreshed once the account cart sync finishes, even when nothing changed", () => {
  assert.match(scriptSource.replace(/\r\n/g, "\n"), /applySignedInCart\(user\)\n\s*\.catch\([^\n]*\)\n\s*\.finally\(\(\) => updateCartCount\(\)\);/);
});
