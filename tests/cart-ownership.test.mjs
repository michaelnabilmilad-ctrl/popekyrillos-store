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
    [AUTH, JSON.stringify({ uid, confirmedAt: Date.now() })],
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
  const onlyCache = new FakeStorage([[AUTH, JSON.stringify({ uid: "a", confirmedAt: Date.now() })]]);
  const onlySession = new FakeStorage([[FIREBASE_SESSION, JSON.stringify({ uid: "a" })]]);
  const mismatch = new FakeStorage([[AUTH, JSON.stringify({ uid: "a", confirmedAt: Date.now() })], [FIREBASE_SESSION, JSON.stringify({ uid: "b" })]]);
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
  assert.match(checkoutSource, /if \(cartOwner !== user\.uid \|\| checkoutSyncedUid !== user\.uid\) \{\n\s*const changed = await restoreSignedInCheckoutCart\(\);/);
  assert.match(checkoutSource, /if \(remoteResult\.ok\) \{\n\s*checkoutSyncedUid = user\.uid;/, "direct saves only after a merge with the server copy");
  assert.match(checkoutSource, /checkoutSessionPending = sessionHint && !checkoutProvisionalUser;/);
  assert.match(checkoutSource, /checkoutAuthServicesPromise\.catch\(\(\) => \{ checkoutAuthServicesPromise = null; \}\);/);
});

// Security review of bea1845 (2026-10-19).
test("a provisional identity alone can never read or write the server cart", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const tab = storefrontTab({ storage, catalog });
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1"));
  Object.assign(tab.context.state.auth, { user: null, ready: false, provisionalUser: provisionalProfile(storage) });
  tab.load().add("icon-1");
  // The SDK is unreachable: no confirmed user, no token.
  tab.context.ensureAuthServices = async () => false;
  tab.context.state.auth.services = null;
  vm.runInContext(["authenticatedCartUser", "saveRemoteCart", "firestoreReady"].map((name) => extractFunction(scriptSource, name)).join("\n\n"), tab.context);
  assert.equal(await tab.context.saveRemoteCart(), false, "nothing is sent");
  assert.equal(tab.firestore.read(uid).items.length, 3, "server cart untouched");
  assert.equal(JSON.parse(storage.getItem(userKey(uid))).items.length, 4, "the add is kept on this device for the next confirmed sync");
});

test("the first save after confirmation merges with the server copy, so lines added on another device survive", async () => {
  const uid = "uid-google";
  const storage = signedInDevice(uid);
  const tab = storefrontTab({ storage, catalog });
  // Another device added icon-1 to the account after this device's last visit.
  tab.firestore.write(uid, items("cross-1", "censer-1", "book-1", "icon-1"));
  Object.assign(tab.context.state.auth, { user: null, ready: false, provisionalUser: provisionalProfile(storage) });
  tab.load(); // provisional: this device's older copy (3 lines)
  tab.context.state.cart.delete(KEY("book-1")); // a removal on this device, before the SDK answers
  const user = { uid, getIdToken() {} };
  Object.assign(tab.context.state.auth, { user, ready: true, provisionalUser: null, syncedUid: "" });
  withRealRemoteSave(tab, user);
  await tab.context.saveRemoteCart(); // a direct save would drop icon-1
  const server = tab.firestore.read(uid).items.map((item) => item.productId);
  assert.ok(server.includes("icon-1"), `the other device's line is kept: ${server.join(", ")}`);
  assert.equal(tab.context.state.auth.syncedUid, uid, "later saves may write directly");
});

test("an old confirmation (over 14 days) gives no provisional identity on any page", () => {
  const uid = "uid-google";
  const old = Date.now() - 15 * 24 * 60 * 60 * 1000;
  const storage = signedInDevice(uid);
  storage.setItem(AUTH, JSON.stringify({ uid, confirmedAt: old }));
  assert.equal(provisionalProfile(storage), null);
  const legacy = signedInDevice(uid);
  legacy.setItem(AUTH, JSON.stringify({ uid })); // written by an older version, no confirmedAt
  assert.equal(provisionalProfile(legacy), null);
  const productPage = fs.readFileSync(new URL("../product-page.js", import.meta.url), "utf8");
  const badge = fs.readFileSync(new URL("../cart-badge.js", import.meta.url), "utf8");
  for (const source of [productPage, badge, checkoutSource]) assert.match(source, /Number\((user|confirmed|profile)\?\.confirmedAt\) > Date\.now\(\) - 14 \* 24 \* 60 \* 60 \* 1000/);
});

test("signing in stores when the SDK confirmed the user", () => {
  assert.match(script, /JSON\.stringify\(\{ \.\.\.profile, confirmedAt: Date\.now\(\) \}\)/);
  assert.match(checkoutSource, /JSON\.stringify\(\{ \.\.\.profile, confirmedAt: Date\.now\(\) \}\)/);
});
