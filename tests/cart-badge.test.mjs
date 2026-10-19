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
  vm.runInContext(["persistedFirebaseSessionUid", "activeCartKey", "readCart", "cartBadgeCount", "updateCount"].map((name) => extractFunction(productPageSource, name)).join("\n\n"), context);
  context.updateCount();
  return { nodes, context };
}

// checkout-flow.js setCartCount on the cart it loaded.
function checkoutCount(cart) {
  const { nodes, document } = fakeDocument(1);
  const context = { cart, document, formatter: new Intl.NumberFormat("ar-EG"), Math, Number, checkoutSessionPending: false };
  vm.createContext(context);
  vm.runInContext(extractFunction(checkoutSource, "setCartCount"), context);
  context.setCartCount();
  return nodes[0].textContent;
}

function storefrontCount(tab) {
  vm.runInContext(extractFunction(scriptSource, "cartQuantityCount"), tab.context);
  return tab.context.cartQuantityCount();
}

const FIREBASE_SESSION = "firebase:authUser:demo-key:[DEFAULT]";
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
  storage.setItem(FIREBASE_SESSION, JSON.stringify({ uid }));
  // Firebase confirmed the session on this page load.
  const home = storefrontTab({ storage, catalog, user: { uid } }).load();
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

// Identity rule (security review): local records only hint that a session may exist
// and start Firebase; the account cart is chosen only after the Firebase SDK confirms
// the user. Pages without the SDK use the account cart only when the last
// SDK-confirmed profile and Firebase's own session record name the same uid.
function sessionHint(source, storage, names = ["loadCachedAuthUser", "persistedFirebaseSessionUid", "hasLocalSessionHint"]) {
  const context = { localStorage: storage, JSON, String, Boolean, cachedAuthStorageKey: AUTH };
  vm.createContext(context);
  vm.runInContext(names.map((name) => extractFunction(source, name)).join("\n\n"), context);
  return context.hasLocalSessionHint();
}

function accountStorage(uid, extra = []) {
  return new FakeStorage([
    [userKey(uid), saved([
      { productId: "cross-1", variantId: "default", qty: 1 },
      { productId: "censer-1", variantId: "default", qty: 1 },
      { productId: "book-1", variantId: "default", qty: 1 }
    ])],
    [ACTIVE, userKey(uid)],
    ...extra
  ]);
}

const nonSdkPages = (storage) => [productPage(storage).nodes[0].textContent, badgePage(storage).nodes[0].textContent];

test("reported bug: Firebase session present but profile cache missing still starts Firebase and then shows the account cart", () => {
  const uid = "uid-alice";
  const storage = accountStorage(uid, [[FIREBASE_SESSION, JSON.stringify({ uid })]]);
  assert.equal(sessionHint(scriptSource, storage), true, "home page starts Firebase");
  assert.equal(sessionHint(checkoutSource, storage, ["storedConfirmedProfile", "persistedFirebaseSessionUid", "hasLocalSessionHint"]), true, "cart page waits for Firebase");
  const beforeConfirm = storefrontTab({ storage, catalog }).load();
  assert.equal(storefrontCount(beforeConfirm), 0, "nothing from the account before Firebase answers");
  const confirmed = storefrontTab({ storage, catalog, user: { uid } }).load();
  assert.equal(storefrontCount(confirmed), 3, "account cart once Firebase confirms");
  assert.equal(storage.getItem(AUTH), null, "the profile cache is not rebuilt from local data");
});

test("a stale or edited profile cache alone never opens an account cart", () => {
  const uid = "uid-alice";
  const storage = accountStorage(uid, [[AUTH, JSON.stringify({ uid })]]);
  const home = storefrontTab({ storage, catalog }).load();
  assert.equal(storefrontCount(home), 0, "home: guest cart until Firebase confirms");
  assert.deepEqual(nonSdkPages(storage), [ar(0), ar(0)], "product and policies pages: no matching Firebase session, guest");
});

test("a profile cache and a Firebase session for different users (account switch, shared device) mean guest", () => {
  const storage = accountStorage("uid-alice", [[AUTH, JSON.stringify({ uid: "uid-alice" })], [FIREBASE_SESSION, JSON.stringify({ uid: "uid-bob" })]]);
  assert.deepEqual(nonSdkPages(storage), [ar(0), ar(0)]);
  const bob = storefrontTab({ storage, catalog, user: { uid: "uid-bob" } }).load();
  assert.equal(storefrontCount(bob), 0, "Bob never sees Alice's cart");
  assert.equal(JSON.parse(storage.getItem(userKey("uid-alice"))).items.length, 3, "Alice's cart is untouched");
});

test("matching confirmed profile and Firebase session show the account cart on pages without Firebase", () => {
  const uid = "uid-alice";
  const storage = accountStorage(uid, [[AUTH, JSON.stringify({ uid })], [FIREBASE_SESSION, JSON.stringify({ uid })]]);
  assert.deepEqual(nonSdkPages(storage), [ar(3), ar(3)]);
});

test("after signing out (both records removed) every page shows the guest cart", () => {
  const storage = accountStorage("uid-alice", [[GUEST, saved([{ productId: "icon-1", variantId: "default", qty: 2 }])]]);
  storage.setItem(ACTIVE, GUEST);
  assert.equal(sessionHint(scriptSource, storage), false, "no Firebase load for a guest");
  assert.equal(storefrontCount(storefrontTab({ storage, catalog }).load()), 2);
  assert.deepEqual(nonSdkPages(storage), [ar(2), ar(2)]);
});

test("while Firebase decides, the home badge is empty, not a misleading guest count", () => {
  const { nodes, document } = fakeDocument(2);
  const context = {
    document, window: { clearTimeout() {} }, state: { cart: new Map([["cross-1::default", 2]]), auth: { sessionPending: true } },
    formatter: new Intl.NumberFormat("ar-EG"), displayText: (value) => value, Math, Number
  };
  vm.createContext(context);
  vm.runInContext(["cartQuantityCount", "updateCartCount", "endSessionPending"].map((name) => extractFunction(scriptSource, name)).join("\n\n"), context);
  context.updateCartCount();
  assert.deepEqual(nodes.map((node) => node.textContent), ["", ""]);
  context.endSessionPending();
  assert.deepEqual(nodes.map((node) => node.textContent), [ar(2), ar(2)]);
});

test("identity comes only from the Firebase SDK on the home and cart pages", () => {
  const script = scriptSource.replace(/\r\n/g, "\n");
  assert.match(script, /function effectiveAuthUser\(\) \{\n  return state\.auth\.user \|\| null;\n\}/);
  assert.doesNotMatch(script, /persistedFirebaseProfile|setItem\(cachedAuthStorageKey, JSON\.stringify\(persisted\)\)/, "no cache rebuilt from local data");
  assert.match(script, /if \(state\.auth\.sessionHint\) \{\n  state\.auth\.sessionPending = true;/);
  assert.match(script, /window\.setTimeout\(endSessionPending, 8000\)/, "badge never stays empty if Firebase is unreachable");
  const checkout = checkoutSource;
  assert.match(checkout, /function loadCachedAuthUser\(\) \{\n  return checkoutConfirmedUser;\n\}/);
  assert.match(checkout, /checkoutConfirmedUser = user \? authProfile\(user\) : null;/);
});

test("when the sign-in expires the account cart is kept, never copied to the guest cart, and the notice shows no item count", () => {
  const uid = "uid-alice";
  const storage = accountStorage(uid, [[AUTH, JSON.stringify({ uid })], [FIREBASE_SESSION, JSON.stringify({ uid })]]);
  // Firebase answered "no user": its record is gone, our cache is cleared.
  storage.removeItem(FIREBASE_SESSION);
  const home = storefrontTab({ storage, catalog });
  home.context.clearCachedAuthUser();
  home.load();
  assert.equal(storefrontCount(home), 0);
  assert.equal(JSON.parse(storage.getItem(userKey(uid))).items.length, 3, "account cart is still saved");
  assert.equal(storage.getItem(GUEST), null, "nothing was copied into the guest cart");
  const script = scriptSource.replace(/\r\n/g, "\n");
  assert.match(script, /const sessionEnded = !user && state\.auth\.sessionHint;/);
  assert.match(script, /"انتهت جلسة تسجيل الدخول\. سجّل الدخول تاني لاسترجاع سلة حسابك\."/);
});

test("the cart page never copies the account cart into the guest cart on a signed-out event", () => {
  assert.doesNotMatch(checkoutSource, /moveCheckoutCartToGuest/);
  assert.doesNotMatch(scriptSource, /moveCurrentCartToGuest/);
});

test("the home badge is refreshed once the account cart sync finishes, even when nothing changed", () => {
  assert.match(scriptSource.replace(/\r\n/g, "\n"), /applySignedInCart\(user\)\n\s*\.catch\([^\n]*\)\n\s*\.finally\(\(\) => updateCartCount\(\)\);/);
});
