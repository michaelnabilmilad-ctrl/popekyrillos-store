// Reported on the live site (2026-10-19): a Google-signed-in customer refreshed the
// page and looked signed out (badge 0, empty cart). Reproduced: while the Firebase
// SDK was still loading the page held the guest cart, and the first add wrote that
// guest cart over the account's server cart; the sign-in merge then trusted the
// newer server copy and the account lines were gone.
// Owner's rule for the fix: before Firebase confirms the session no page shows an
// account cart from local data; additions made meanwhile are kept apart and merged
// into the account only after confirmation and a merge with the server copy.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { FakeStorage, storefrontTab, extractFunction, scriptSource } from "./helpers/storefront-sandbox.mjs";

const checkoutSource = fs.readFileSync(new URL("../checkout-flow.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const script = scriptSource.replace(/\r\n/g, "\n");
const AUTH = "pope-kyrillos-auth:user";
const GUEST = "pope-kyrillos-cart:guest";
const ACTIVE = "pope-kyrillos-cart:active";
const FIREBASE_SESSION = "firebase:authUser:demo-key:[DEFAULT]";
const userKey = (uid) => `pope-kyrillos-cart:user:${uid}`;
const catalog = ["cross-1", "censer-1", "book-1", "icon-1"].map((id) => ({ id, name: id, price: 100, stock: "متاح", variants: [] }));
const KEY = (id) => `${id}::default`;
const items = (...ids) => ids.map((productId) => ({ productId, variantId: "default", qty: 1 }));
const saved = (list, updatedAt = "2026-10-19T08:00:00.000Z") => JSON.stringify({ items: list, updatedAt });
const ids = (list) => list.map((item) => item.productId).sort();

// A device where the account was signed in before: 3 lines locally and on the server.
function signedInDevice(uid) {
  return new FakeStorage([
    [AUTH, JSON.stringify({ uid, confirmedAt: Date.now() })],
    [FIREBASE_SESSION, JSON.stringify({ uid })],
    [userKey(uid), saved(items("cross-1", "censer-1", "book-1"))],
    [ACTIVE, userKey(uid)]
  ]);
}

// The shipped saveRemoteCart (owner + merge-first guard) over a fake Firestore.
function withRealRemoteSave(tab, user) {
  const { context, firestore } = tab;
  context.firestoreReady = async () => true;
  context.authenticatedCartUser = async () => user;
  context.withTimeout = (promise) => promise;
  context.state.auth.services = {
    db: {},
    doc: (_db, _collection, uid) => uid,
    setDoc: async (uid, data) => firestore.write(uid, data.items),
    serverTimestamp: () => null
  };
  vm.runInContext(extractFunction(scriptSource, "saveRemoteCart"), context);
  return tab;
}

test("reproduction: an add made while Firebase was loading never replaces the account's server cart", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const tab = storefrontTab({ storage, catalog });
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1"));
  tab.load(); // waiting for Firebase: no account cart on screen
  assert.equal(tab.context.state.cart.size, 0);
  tab.add("icon-1"); // the customer adds before the SDK answers
  assert.deepEqual(JSON.parse(storage.getItem(GUEST)).items.map((item) => item.productId), ["icon-1"], "kept apart");
  assert.equal(JSON.parse(storage.getItem(userKey(uid))).items.length, 3, "account copy not written");
  const user = { uid, getIdToken() {} };
  tab.context.state.auth.user = user; // the SDK restored the session
  withRealRemoteSave(tab, user);
  await tab.context.saveRemoteCart(); // the queued account save
  assert.deepEqual(ids(tab.firestore.read(uid).items), ["book-1", "censer-1", "cross-1", "icon-1"], "account lines kept, addition merged");
  assert.deepEqual(ids(JSON.parse(storage.getItem(userKey(uid))).items), ["book-1", "censer-1", "cross-1", "icon-1"]);
  assert.equal(storage.getItem(GUEST), null, "additions cleared only after the merged save");
  assert.equal(tab.context.state.cartOwner, uid);
});

test("before Firebase answers, matching local records still show no account cart", () => {
  const tab = storefrontTab({ storage: signedInDevice("uid-google"), catalog });
  tab.context.state.auth.ready = false;
  tab.load();
  assert.deepEqual(tab.cart, {}, "only additions made on this device would show");
  assert.equal(tab.context.state.cartOwner, "");
});

test("without a confirmed Firebase user nothing is read from or written to the server", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const tab = storefrontTab({ storage, catalog });
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1"));
  tab.load().add("icon-1");
  tab.context.ensureAuthServices = async () => false; // the SDK is unreachable
  tab.context.state.auth.services = null;
  vm.runInContext(["authenticatedCartUser", "saveRemoteCart", "firestoreReady"].map((name) => extractFunction(scriptSource, name)).join("\n\n"), tab.context);
  assert.equal(await tab.context.saveRemoteCart(), false);
  assert.equal(tab.firestore.read(uid).items.length, 3, "server cart untouched");
  assert.equal(JSON.parse(storage.getItem(userKey(uid))).items.length, 3, "account copy untouched");
});

test("a direct save waits for a merge with the server copy, so lines added on another device survive", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const tab = storefrontTab({ storage, catalog });
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1", "icon-1")); // another device added icon-1
  const user = { uid, getIdToken() {} };
  Object.assign(tab.context.state.auth, { user, ready: true, syncedUid: "" });
  tab.load(); // this device's older account copy (3 lines), not merged yet
  withRealRemoteSave(tab, user);
  await tab.context.saveRemoteCart();
  assert.ok(ids(tab.firestore.read(uid).items).includes("icon-1"), "the other device's line is kept");
  assert.equal(tab.context.state.auth.syncedUid, uid, "later saves may write directly");
});

test("another account's cart is never written to this account's server cart", async () => {
  const storage = signedInDevice("uid-alice");
  const alice = { uid: "uid-alice", getIdToken() {} };
  const tab = storefrontTab({ storage, catalog, user: alice });
  tab.load(); // Alice's cart in memory
  const bob = { uid: "uid-bob", getIdToken() {} };
  tab.firestore.write("uid-bob", items("icon-1"));
  tab.context.state.auth.user = bob; // the SDK says the session is Bob's
  withRealRemoteSave(tab, bob);
  await tab.context.saveRemoteCart();
  assert.deepEqual(ids(tab.firestore.read("uid-bob").items), ["icon-1"], "Bob's server cart has only Bob's lines");
  assert.equal(JSON.parse(storage.getItem(userKey("uid-alice"))).items.length, 3, "Alice's cart untouched");
});

test("a product-page addition reaches a confirmed account through the merge, not by replacing the cart", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const user = { uid, getIdToken() {} };
  const tab = storefrontTab({ storage, catalog, user });
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1"));
  await tab.signIn(user);
  storage.setItem(GUEST, saved(items("icon-1"), new Date().toISOString())); // product page writes additions here
  vm.runInContext(extractFunction(scriptSource, "refreshCartFromLocalStorage"), tab.context);
  tab.context.refreshCartFromLocalStorage(); // storage event from that page
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tab.context.state.cart.size, 4, "account cart plus the addition");
  assert.equal(tab.context.state.cartOwner, uid);
});

test("Firebase readiness does not wait for Firestore, and a failed download is retried with a waiting state", () => {
  assert.match(script, /const firestoreModulePromise = import\(`https:\/\/www\.gstatic\.com\/firebasejs\/\$\{firebaseSdkVersion\}\/firebase-firestore\.js`\);/);
  assert.match(script, /const \[appModule, authModule\] = await Promise\.all\(\[/);
  assert.match(script, /if \(!user\?\.getIdToken \|\| !\(await firestoreReady\(\)\)\) return \{ ok: false, cart: new Map\(\) \};/);
  assert.match(script, /state\.auth\.verifyFailed = true;\n\s*window\.clearTimeout\(state\.auth\.retryTimer\);\n\s*state\.auth\.retryTimer = window\.setTimeout\(\(\) => void ensureAuthServices\(\), 15000\);/);
  assert.match(script, /authInitPromise = null;/);
});

test("a redirect Google sign-in is finished when the customer comes back", () => {
  assert.match(script, /sessionStorage\.setItem\("pope-kyrillos-auth:redirect", "1"\);\n[\s\S]{0,200}await services\.signInWithRedirect/);
  assert.match(script, /redirectPending = sessionStorage\.getItem\("pope-kyrillos-auth:redirect"\) === "1";/);
  assert.match(script, /sessionStorage\.removeItem\("pope-kyrillos-auth:redirect"\);/);
});

test("the cart page waits for Firebase, keeps additions apart and merges before writing", () => {
  assert.match(checkoutSource, /if \(cartOwner !== user\.uid \|\| checkoutSyncedUid !== user\.uid\) \{\n\s*const changed = await restoreSignedInCheckoutCart\(\);/);
  assert.match(checkoutSource, /if \(remoteResult\.ok\) \{\n\s*checkoutSyncedUid = user\.uid;/);
  assert.match(checkoutSource, /checkoutSessionPending = sessionHint;/);
  assert.match(checkoutSource, /const settled = await waitForCheckoutVerdict\(20000\);/);
  assert.match(checkoutSource, /const targetKey = confirmedUser\?\.uid && cartOwner === confirmedUser\.uid \? currentUserCartStorageKey\(confirmedUser\) : guestCartStorageKey;/);
  assert.match(checkoutSource, /if \(user\?\.uid\) return \[currentUserCartStorageKey\(user\)\];/, "a confirmed customer reads only the account copy");
  assert.match(checkoutSource, /checkoutAuthServicesPromise\.catch\(\(\) => \{ checkoutAuthServicesPromise = null; \}\);/);
});

test("the cart page renders its waiting message without errors (found in the browser test)", () => {
  const list = { innerHTML: "" };
  const total = { textContent: "" };
  const next = { setAttribute() {} };
  const context = {
    document: { documentElement: { lang: "ar" }, querySelector: (selector) => ({ "[data-cart-page-items]": list, "[data-cart-page-total]": total, "[data-cart-next]": next })[selector] || null },
    checkoutSessionPending: true, cartEntries: () => [], t: (key) => key, money: (value) => String(value)
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(checkoutSource, "renderCartPage"), context);
  assert.doesNotThrow(() => context.renderCartPage());
  assert.match(list.innerHTML, /جاري تأكيد حسابك وتحميل سلتك…/);
  assert.doesNotMatch(checkoutSource, /\bstate\.language\b/, "checkout-flow.js has no storefront state object");
});

test("a failed Firebase download asks for a refresh instead of showing an empty cart", () => {
  assert.ok(script.includes("تعذر تأكيد حسابك بسبب الاتصال. حدّث الصفحة لاسترجاع سلتك."));
  assert.ok(script.includes("\"حدّث الصفحة\""), "header label while the account cannot be confirmed");
  assert.ok(checkoutSource.includes("تعذر تأكيد حسابك بسبب الاتصال. حدّث الصفحة لعرض سلة حسابك."));
  assert.match(checkoutSource, /checkoutVerifyFailed = true;/);
});
