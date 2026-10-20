// Found in the browser test of the session fix (2026-10-19), present on the live site too:
// with two open tabs on different accounts (one tab switched account), each tab answered the
// other's storage event by saving its cart again, ~600 writes and ~190 Firestore reads per
// second, and the cart page kept showing the previous account. Saves that change nothing are
// now skipped, a storage event with nothing new does not re-run the server merge, and the cart
// page follows the account Firebase confirms.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { FakeStorage, storefrontTab, extractFunction, scriptSource } from "./helpers/storefront-sandbox.mjs";

const checkoutSource = fs.readFileSync(new URL("../checkout-flow.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const KEYS = ["pope-kyrillos-cart:guest", "pope-kyrillos-cart:active", "pope-kyrillos-cart:sync"];
const catalog = ["cross-1", "censer-1", "book-1"].map((id) => ({ id, name: id, price: 100, stock: "متاح", variants: [] }));

// localStorage shared by several tabs: every change is delivered to the OTHER tabs as a
// storage event, like the browser does.
class SharedStorage extends FakeStorage {
  constructor() { super(); this.tabs = []; this.queue = []; this.writes = 0; }
  setItem(key, value) {
    const old = this.getItem(key);
    super.setItem(key, value);
    this.writes += 1;
    if (old !== String(value)) this.queue.push({ key, from: this.current });
  }
  removeItem(key) { if (this.getItem(key) !== null) this.queue.push({ key, from: this.current }); super.removeItem(key); }
  async deliver(limit = 2000) {
    let delivered = 0;
    while (this.queue.length && delivered < limit) {
      const { key, from } = this.queue.shift();
      for (const tab of this.tabs) {
        if (tab === from) continue;
        this.current = tab;
        await tab.onStorage(key);
        delivered += 1;
      }
    }
    return delivered;
  }
}

function storefront(storage, user, firestore) {
  const tab = storefrontTab({ storage, catalog, user, ...(firestore ? { firestore } : {}) });
  vm.runInContext(extractFunction(scriptSource, "refreshCartFromLocalStorage"), tab.context);
  let reads = 0;
  const load = tab.context.loadRemoteCartRecord;
  tab.context.loadRemoteCartRecord = (...args) => { reads += 1; return load(...args); };
  tab.reads = () => reads;
  // The page's storage listener (script.js): relevant keys only, then refresh.
  tab.onStorage = async (key) => {
    const relevant = [...KEYS, tab.context.currentUserCartStorageKey()];
    if (!relevant.includes(key)) return;
    storage.current = tab;
    tab.context.refreshCartFromLocalStorage();
    await new Promise((resolve) => setImmediate(resolve));
  };
  storage.tabs.push(tab);
  return tab;
}

test("two tabs on different accounts settle instead of saving against each other", async () => {
  const storage = new SharedStorage();
  const carol = { uid: "uid-carol", getIdToken() {} };
  const erin = { uid: "uid-erin", getIdToken() {} };
  const home = storefront(storage, carol);
  const other = storefront(storage, erin);
  storage.current = other; await other.signIn(erin); other.add("book-1");
  storage.current = home; await home.signIn(carol); home.add("cross-1");
  const delivered = await storage.deliver();
  assert.ok(delivered < 50, `storage events settle (delivered ${delivered})`);
  assert.equal(storage.queue.length, 0, "no event left bouncing between the tabs");
  assert.ok(home.reads() + other.reads() < 10, "the server cart is not read in a loop");
  assert.deepEqual(Object.keys(home.cart), ["cross-1::default"], "Carol's tab keeps Carol's cart");
  assert.deepEqual(Object.keys(other.cart), ["book-1::default"], "Erin's lines never enter Carol's cart");
});

test("two tabs of the same account: additions and removals reach the other tab and stay", async () => {
  const storage = new SharedStorage();
  const carol = { uid: "uid-carol", getIdToken() {} };
  const a = storefront(storage, carol);
  const b = storefront(storage, carol, a.firestore); // same browser, same server
  storage.current = a; await a.signIn(carol); a.add("cross-1"); a.add("censer-1");
  await a.context.saveRemoteCart();
  storage.current = b; await b.signIn(carol);
  await storage.deliver();
  assert.deepEqual(Object.keys(b.cart).sort(), ["censer-1::default", "cross-1::default"], "tab B sees tab A's additions");

  // Tab A removes a line; its server save is still on the way (the server still has it).
  storage.current = a; a.remove("censer-1");
  const delivered = await storage.deliver();
  assert.ok(delivered < 20, `settles (delivered ${delivered})`);
  assert.deepEqual(Object.keys(b.cart), ["cross-1::default"], "the removal reaches tab B");
  assert.deepEqual(Object.keys(a.cart), ["cross-1::default"], "the removed line does not come back in tab A");
  storage.current = a; await a.context.saveRemoteCart(); // tab A's save arrives
  await storage.deliver();
  assert.deepEqual(a.firestore.read("uid-carol").items.map((item) => item.productId), ["cross-1"]);

  storage.current = b; b.add("book-1");
  await storage.deliver();
  assert.deepEqual(Object.keys(a.cart).sort(), ["book-1::default", "cross-1::default"], "tab A sees tab B's addition");
});

test("a storage event with nothing new does not re-run the server merge", async () => {
  const storage = new SharedStorage();
  const carol = { uid: "uid-carol", getIdToken() {} };
  const home = storefront(storage, carol);
  storage.current = home; await home.signIn(carol); home.add("cross-1");
  const before = home.reads();
  await home.onStorage("pope-kyrillos-cart:active");
  assert.equal(home.reads(), before);
});

test("guest additions from another tab are still merged into the account", async () => {
  const storage = new SharedStorage();
  const carol = { uid: "uid-carol", getIdToken() {} };
  const home = storefront(storage, carol);
  storage.current = home; await home.signIn(carol); home.add("cross-1");
  storage.current = null;
  storage.setItem("pope-kyrillos-cart:guest", JSON.stringify({ items: [{ productId: "censer-1", variantId: "default", qty: 1 }], updatedAt: new Date().toISOString() }));
  await home.onStorage("pope-kyrillos-cart:guest");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(Object.keys(home.cart).sort(), ["censer-1::default", "cross-1::default"]);
  assert.equal(storage.getItem("pope-kyrillos-cart:guest"), null, "guest lines cleared only after the merged save");
});

test("saving an unchanged cart or the same active key writes nothing (storefront and cart page)", () => {
  const storage = new SharedStorage();
  const tab = storefront(storage, null);
  tab.load().add("cross-1");
  const writes = storage.writes;
  tab.context.saveCartToLocal("pope-kyrillos-cart:guest", tab.context.state.cart);
  tab.context.setActiveCartStorageKey("pope-kyrillos-cart:guest");
  assert.equal(storage.writes, writes);

  const context = { localStorage: storage, JSON, Map, Date, Math, Number, String, Array, Object, console, activeCartStorageKey: "pope-kyrillos-cart:active", cartSyncStorageKey: "pope-kyrillos-cart:sync", cartWriteClock: 0, cartSeparator: "::" };
  vm.createContext(context);
  vm.runInContext(["saveCartRecord", "setActiveCartKey", "readCartRecord", "cartFingerprint", "cartPayloadFromMap", "cartMapFromPayload", "nextCartTimestamp", "parseCartKey", "cartKey", "timestampMillis"]
    .filter((name) => new RegExp(`^function ${name}\\(`, "m").test(checkoutSource))
    .map((name) => extractFunction(checkoutSource, name)).join("\n\n"), context);
  const map = context.readCartRecord("pope-kyrillos-cart:guest").cart;
  const before = storage.writes;
  context.saveCartRecord("pope-kyrillos-cart:guest", map);
  context.setActiveCartKey("pope-kyrillos-cart:guest");
  assert.equal(storage.writes, before);
});

test("the cart page follows an account change made in another tab", async () => {
  const calls = [];
  const context = {
    checkoutAuthSettled: true,
    checkoutConfirmedUser: { uid: "uid-erin" },
    checkoutSyncedUid: "uid-erin",
    authProfile: (user) => (user ? { uid: user.uid } : null),
    restoreSignedInCheckoutCart: async () => { calls.push(["restore", context.checkoutConfirmedUser?.uid]); return true; },
    applyCheckoutCartSync: (changed) => calls.push(["render", changed])
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(checkoutSource, "followCheckoutAccount"), context);
  await context.followCheckoutAccount({ uid: "uid-carol" });
  assert.equal(context.checkoutConfirmedUser.uid, "uid-carol");
  assert.equal(context.checkoutSyncedUid, "", "the new account is merged with its server copy before any save");
  assert.deepEqual(calls, [["restore", "uid-carol"], ["render", true]]);
  calls.length = 0;
  await context.followCheckoutAccount({ uid: "uid-carol" });
  assert.deepEqual(calls, [], "the same account changes nothing");
  await context.followCheckoutAccount(null);
  assert.equal(context.checkoutConfirmedUser, null);
  assert.deepEqual(calls, [["render", true]], "signed out elsewhere: the page shows the guest cart");
  context.checkoutAuthSettled = false;
  calls.length = 0;
  await context.followCheckoutAccount({ uid: "uid-bob" });
  assert.deepEqual(calls, [], "the first answer is handled by the page's own start-up check");
});

test("the cart page listens for account changes on its Firebase instance", () => {
  assert.match(checkoutSource, /authModule\.onAuthStateChanged\(auth, \(user\) => \{\n\s*followCheckoutAccount\(user\)/);
});
