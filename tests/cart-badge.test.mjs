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
  vm.runInContext(["persistedFirebaseSessionUid", "activeCartKey", "hasLocalSessionHint", "readCart", "cartBadgeCount", "updateCount"].map((name) => extractFunction(productPageSource, name)).join("\n\n"), context);
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

const guestSaved = (...ids) => saved(ids.map((productId) => ({ productId, variantId: "default", qty: 1 })));
function accountStorage(uid, extra = []) {
  return new FakeStorage([[userKey(uid), guestSaved("cross-1", "censer-1", "book-1")], ...extra]);
}
const nonSdkPages = (storage) => [productPage(storage).nodes[0].textContent, badgePage(storage).nodes[0].textContent];

test("every page starts the badge empty and hides it until the saved cart is read", () => {
  for (const file of ["index.html", "cart.html", "checkout.html", "payment.html", "policies.html", "cloudflare-worker.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /data-cart-count>0</, `${file} must not print a placeholder 0`);
    assert.match(source, /data-cart-count><\/(span|b)>/, `${file} keeps an empty badge`);
  }
  assert.match(read("styles.css"), /\.cart-count:empty \{\n  visibility: hidden;\n\}/);
  assert.match(read("policies.html"), /<script src="\/cart-badge\.js\?v=1" defer><\/script>/);
  assert.match(read("scripts/build-cloudflare.js"), /"cart-badge\.js",/);
});

test("a guest's cart is counted identically on the home, cart, product and policies pages", () => {
  const storage = new FakeStorage([
    [GUEST, saved([
      { productId: "cross-1", variantId: "default", qty: 2 },
      { productId: "censer-1", variantId: "default", qty: "3" },
      { productId: "book-1", variantId: "default", qty: 1.7 }
    ])],
    [ACTIVE, GUEST]
  ]);
  const home = storefrontTab({ storage, catalog }).load();
  assert.equal(storefrontCount(home), 6);
  assert.equal(checkoutCount(home.context.state.cart), ar(6));
  assert.equal(productPage(storage).nodes[0].textContent, ar(6));
  assert.deepEqual(badgePage(storage).nodes.map((node) => node.textContent), [ar(6), ar(6)]);
});

test("a confirmed customer sees the account cart; pages without Firebase never show it", () => {
  const uid = "uid-alice";
  const storage = accountStorage(uid, [[AUTH, JSON.stringify({ uid })], [FIREBASE_SESSION, JSON.stringify({ uid })], [ACTIVE, userKey(uid)]]);
  const home = storefrontTab({ storage, catalog, user: { uid } }).load(); // SDK confirmed
  assert.equal(storefrontCount(home), 3);
  assert.deepEqual(nonSdkPages(storage), ["", ""], "product and policies pages: waiting badge, no account count");
});

test("the product page updates every badge on the page, with the same digits as the storefront", () => {
  const storage = new FakeStorage();
  productPageAdd(storage, { productId: "cross-1", variantId: "default", qty: 2 });
  productPageAdd(storage, { productId: "book-1", variantId: "default", qty: 1 });
  assert.deepEqual(productPage(storage, { badges: 2 }).nodes.map((node) => node.textContent), [ar(3), ar(3)]);
  assert.equal(productPage(storage, { badges: 1, lang: "en" }).nodes[0].textContent, "3");
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

function sessionHint(source, storage, names) {
  const context = { localStorage: storage, sessionStorage: new FakeStorage(), JSON, String, Boolean, cachedAuthStorageKey: AUTH };
  vm.createContext(context);
  vm.runInContext(names.map((name) => extractFunction(source, name)).join("\n\n"), context);
  return context.hasLocalSessionHint();
}
const scriptHint = ["loadCachedAuthUser", "persistedFirebaseSessionUid", "hasLocalSessionHint"];
const checkoutHint = ["storedConfirmedProfile", "persistedFirebaseSessionUid", "hasLocalSessionHint"];

test("reported bug: Firebase session without the profile cache starts Firebase, then shows the account cart", () => {
  const uid = "uid-alice";
  const storage = accountStorage(uid, [[FIREBASE_SESSION, JSON.stringify({ uid })]]);
  assert.equal(sessionHint(scriptSource, storage, scriptHint), true);
  assert.equal(sessionHint(checkoutSource, storage, checkoutHint), true);
  assert.equal(storefrontCount(storefrontTab({ storage, catalog }).load()), 0, "nothing from the account before Firebase answers");
  assert.equal(storefrontCount(storefrontTab({ storage, catalog, user: { uid } }).load()), 3, "account cart once Firebase confirms");
});

test("local records alone (stale, edited, matching or mismatched) never show an account cart", () => {
  const uid = "uid-alice";
  for (const extra of [
    [[AUTH, JSON.stringify({ uid, confirmedAt: Date.now() })]],
    [[AUTH, JSON.stringify({ uid, confirmedAt: Date.now() })], [FIREBASE_SESSION, JSON.stringify({ uid })]],
    [[AUTH, JSON.stringify({ uid })], [FIREBASE_SESSION, JSON.stringify({ uid: "uid-bob" })]]
  ]) {
    const storage = accountStorage(uid, [...extra, [ACTIVE, userKey(uid)]]);
    assert.equal(storefrontCount(storefrontTab({ storage, catalog }).load()), 0, "home before Firebase answers");
    assert.deepEqual(nonSdkPages(storage), ["", ""], "pages without Firebase");
  }
});

test("on a shared device a different confirmed account never sees the previous one's cart", () => {
  const storage = accountStorage("uid-alice", [[AUTH, JSON.stringify({ uid: "uid-alice" })], [FIREBASE_SESSION, JSON.stringify({ uid: "uid-bob" })]]);
  const bob = storefrontTab({ storage, catalog, user: { uid: "uid-bob" } }).load();
  assert.equal(storefrontCount(bob), 0);
  assert.equal(JSON.parse(storage.getItem(userKey("uid-alice"))).items.length, 3, "Alice's cart untouched");
});

test("after signing out (both records removed) every page shows the guest cart", () => {
  const storage = accountStorage("uid-alice", [[GUEST, saved([{ productId: "icon-1", variantId: "default", qty: 2 }])], [ACTIVE, GUEST]]);
  assert.equal(sessionHint(scriptSource, storage, scriptHint), false);
  assert.equal(storefrontCount(storefrontTab({ storage, catalog }).load()), 2);
  assert.deepEqual(nonSdkPages(storage), [ar(2), ar(2)]);
});

test("while Firebase decides, the home badge waits, and shows only what was added meanwhile", () => {
  const { nodes, document } = fakeDocument(2);
  const context = { document, window: { clearTimeout() {} }, state: { cart: new Map(), auth: { sessionPending: true } }, formatter: new Intl.NumberFormat("ar-EG"), displayText: (value) => value, Math, Number };
  vm.createContext(context);
  vm.runInContext(["cartQuantityCount", "updateCartCount", "endSessionPending"].map((name) => extractFunction(scriptSource, name)).join("\n\n"), context);
  context.updateCartCount();
  assert.deepEqual(nodes.map((node) => node.textContent), ["", ""], "waiting, no misleading 0");
  context.state.cart.set("icon-1::default", 1);
  context.updateCartCount();
  assert.deepEqual(nodes.map((node) => node.textContent), [ar(1), ar(1)], "the new addition, kept apart from the account");
});

test("identity comes only from the Firebase SDK; local records only start it", () => {
  const script = scriptSource.replace(/\r\n/g, "\n");
  assert.match(script, /function effectiveAuthUser\(\) \{\n  return state\.auth\.user \|\| null;\n\}/);
  assert.doesNotMatch(script, /provisionalUser|consistentLocalProfile|persistedFirebaseProfile/);
  assert.match(script, /if \(state\.auth\.sessionHint\) \{[\s\S]{0,200}state\.auth\.sessionPending = true;/);
  assert.doesNotMatch(script, /setTimeout\(endSessionPending, 8000\)/, "no timer that falls back to the guest view");
  assert.ok(script.includes("\"جارٍ التحقق…\""), "header shows a waiting state, not 'sign in'");
  assert.match(checkoutSource, /function loadCachedAuthUser\(\) \{\n  return checkoutConfirmedUser;\n\}/);
  assert.doesNotMatch(checkoutSource, /checkoutProvisionalUser|consistentLocalProfile/);
  assert.match(productPageSource, /function activeCartKey\(\) \{\n  return guestCartKey;\n\}/, "the product page never writes into an account cart");
});

test("when the sign-in expires the account cart is kept, never copied to the guest cart, and the notice shows no item count", () => {
  const uid = "uid-alice";
  const storage = accountStorage(uid, [[ACTIVE, userKey(uid)]]);
  const home = storefrontTab({ storage, catalog });
  home.context.clearCachedAuthUser();
  home.load();
  assert.equal(storefrontCount(home), 0);
  assert.equal(JSON.parse(storage.getItem(userKey(uid))).items.length, 3);
  assert.equal(storage.getItem(GUEST), null);
  const script = scriptSource.replace(/\r\n/g, "\n");
  assert.match(script, /const sessionEnded = !user && state\.auth\.sessionHint;/);
  assert.ok(script.includes("انتهت جلسة تسجيل الدخول. سجّل الدخول تاني لاسترجاع سلة حسابك."));
});

test("the cart page never copies the account cart into the guest cart on a signed-out event", () => {
  assert.doesNotMatch(checkoutSource, /moveCheckoutCartToGuest/);
  assert.doesNotMatch(scriptSource, /moveCurrentCartToGuest/);
});

test("the home badge is refreshed once the account cart sync finishes, even when nothing changed", () => {
  assert.match(scriptSource.replace(/\r\n/g, "\n"), /applySignedInCart\(user\)\n\s*\.catch\([^\n]*\)\n\s*\.finally\(\(\) => updateCartCount\(\)\);/);
});
