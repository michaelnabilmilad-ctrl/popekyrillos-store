// Reported on the live site (2026-10-19): a Google-signed-in customer refreshed the
// page and looked signed out (badge 0, empty cart). Reproduced: while the Firebase
// SDK was still loading the page held the guest cart, and the first add wrote that
// guest cart over the account's server cart; the sign-in merge then trusted the
// newer server copy and the account lines were gone. These tests pin the fix:
// carts have owners, and a provisional identity (both Firebase-written records
// agree) keeps the account cart on screen until the SDK answers.
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

// A signed-in account: 3 lines locally and on the (fake) server.
function signedInDevice(uid) {
  const storage = new FakeStorage([
    [AUTH, JSON.stringify({ uid })],
    [FIREBASE_SESSION, JSON.stringify({ uid })],
    [userKey(uid), saved(items("cross-1", "censer-1", "book-1"))],
    [ACTIVE, userKey(uid)]
  ]);
  return storage;
}

// Wire the shipped saveRemoteCart (owner guard) into a sandbox tab, with a fake
// Firestore behind the SDK services.
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

function provisionalProfile(storage) {
  const context = { localStorage: storage, JSON, String, cachedAuthStorageKey: AUTH };
  vm.createContext(context);
  vm.runInContext(["loadCachedAuthUser", "persistedFirebaseSessionUid", "consistentLocalProfile"].map((name) => extractFunction(scriptSource, name)).join("\n\n"), context);
  return context.consistentLocalProfile();
}

test("reproduction: an add made while Firebase was loading never replaces the account's server cart", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  storage.removeItem(AUTH); // no provisional identity: the page starts on the guest cart
  const tab = storefrontTab({ storage, catalog });
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1"));
  tab.load().add("icon-1"); // the customer adds before the SDK answers
  assert.equal(tab.context.state.cartOwner, "", "that cart belongs to the guest");
  const user = { uid, getIdToken() {} };
  tab.context.state.auth.user = user; // SDK restored the session
  withRealRemoteSave(tab, user);
  await tab.context.saveRemoteCart(); // the queued account save
  const server = tab.firestore.read(uid).items.map((item) => item.productId).sort();
  assert.deepEqual(server, ["book-1", "censer-1", "cross-1", "icon-1"], "account lines kept, guest line merged");
  assert.deepEqual(JSON.parse(storage.getItem(userKey(uid))).items.map((item) => item.productId).sort(), server);
  assert.equal(storage.getItem(GUEST), null, "guest cart cleared only after the merged save");
  assert.equal(tab.context.state.cartOwner, uid);
  assert.equal(tab.context.state.cart.size, 4);
});

test("while the SDK loads, matching Firebase-written records keep the customer signed in on screen", () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const provisionalUser = provisionalProfile(storage);
  assert.equal(provisionalUser?.uid, uid);
  const tab = storefrontTab({ storage, catalog });
  Object.assign(tab.context.state.auth, { user: null, ready: false, provisionalUser });
  tab.load();
  assert.deepEqual(tab.cart, { [KEY("cross-1")]: 1, [KEY("censer-1")]: 1, [KEY("book-1")]: 1 }, "account cart, not an empty guest cart");
  assert.equal(tab.context.state.cartOwner, uid);
});

test("adds during the provisional phase go to the account cart and survive the SDK confirmation", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const tab = storefrontTab({ storage, catalog });
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1"));
  Object.assign(tab.context.state.auth, { user: null, ready: false, provisionalUser: provisionalProfile(storage) });
  tab.load();
  tab.firestore.tick(1000);
  tab.add("icon-1"); // local account copy is now newer than the server copy
  assert.equal(storage.getItem(GUEST), null, "nothing goes to the guest cart");
  const user = { uid, getIdToken() {} };
  Object.assign(tab.context.state.auth, { user, ready: true, provisionalUser: null });
  await tab.context.applySignedInCart(user);
  assert.equal(tab.context.state.cart.size, 4, "server + newer local lines merged, none lost");
});

test("no provisional identity from a stale, edited or mismatched record", () => {
  const onlyCache = new FakeStorage([[AUTH, JSON.stringify({ uid: "a" })]]);
  const onlySession = new FakeStorage([[FIREBASE_SESSION, JSON.stringify({ uid: "a" })]]);
  const mismatch = new FakeStorage([[AUTH, JSON.stringify({ uid: "a" })], [FIREBASE_SESSION, JSON.stringify({ uid: "b" })]]);
  for (const storage of [onlyCache, onlySession, mismatch, new FakeStorage()]) assert.equal(provisionalProfile(storage), null);
});

test("another account's cart is never written to this account's server cart", async () => {
  const storage = signedInDevice("uid-alice");
  const tab = storefrontTab({ storage, catalog });
  Object.assign(tab.context.state.auth, { user: null, ready: false, provisionalUser: provisionalProfile(storage) });
  tab.load(); // Alice's cart in memory
  const bob = { uid: "uid-bob", getIdToken() {} };
  tab.firestore.write("uid-bob", items("icon-1"));
  tab.context.state.auth.user = bob; // the SDK says the session is Bob's
  withRealRemoteSave(tab, bob);
  await tab.context.saveRemoteCart();
  assert.deepEqual(tab.firestore.read("uid-bob").items.map((item) => item.productId), ["icon-1"], "Bob's server cart has only Bob's lines");
  assert.equal(JSON.parse(storage.getItem(userKey("uid-alice"))).items.length, 3, "Alice's cart untouched");
});

test("Firebase readiness does not wait for Firestore, and a failed download is retried, not treated as sign-out", () => {
  assert.match(script, /const firestoreModulePromise = import\(`https:\/\/www\.gstatic\.com\/firebasejs\/\$\{firebaseSdkVersion\}\/firebase-firestore\.js`\);/);
  assert.match(script, /const \[appModule, authModule\] = await Promise\.all\(\[/);
  assert.match(script, /if \(!user\?\.getIdToken \|\| !\(await firestoreReady\(\)\)\) return \{ ok: false, cart: new Map\(\) \};/);
  assert.match(script, /if \(state\.auth\.sessionHint\) \{\n\s*window\.clearTimeout\(state\.auth\.retryTimer\);\n\s*state\.auth\.retryTimer = window\.setTimeout\(\(\) => void ensureAuthServices\(\), 15000\);/);
  assert.match(script, /authInitPromise = null;/);
});

test("a redirect Google sign-in is finished when the customer comes back", () => {
  assert.match(script, /sessionStorage\.setItem\("pope-kyrillos-auth:redirect", "1"\);\n[\s\S]{0,200}await services\.signInWithRedirect/);
  assert.match(script, /redirectPending = sessionStorage\.getItem\("pope-kyrillos-auth:redirect"\) === "1";/);
  assert.match(script, /sessionStorage\.removeItem\("pope-kyrillos-auth:redirect"\);/);
});

test("the cart page applies the same owner guard and provisional identity", () => {
  assert.match(checkoutSource, /if \(cartOwner !== user\.uid\) \{\n\s*const changed = await restoreSignedInCheckoutCart\(\);/);
  assert.match(checkoutSource, /checkoutSessionPending = sessionHint && !checkoutProvisionalUser;/);
  assert.match(checkoutSource, /checkoutAuthServicesPromise\.catch\(\(\) => \{ checkoutAuthServicesPromise = null; \}\);/);
});
