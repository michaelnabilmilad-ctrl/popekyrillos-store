// Cart persistence scenarios using the shipped cart functions from script.js in a
// sandbox (tests/helpers/storefront-sandbox.mjs). Fake localStorage and a fake
// Firestore stand in for the browser and the customerCarts collection.
// Tests marked todo reproduce the cart-emptying defects found in the live code.
import test from "node:test";
import assert from "node:assert/strict";
import { FakeStorage, fakeFirestore, storefrontTab, productPageAdd } from "./helpers/storefront-sandbox.mjs";

const cross = { id: "cross-1", name: "صليب", price: 450, stock: "متاح", variants: [] };
const censer = { id: "censer-1", name: "شورية", price: 1200, stock: "متاح", variants: [] };
const book = { id: "book-1", name: "كتاب", price: 300, stock: "متاح", variants: [] };
const fullCatalog = [cross, censer, book];
const KEY = (id) => `${id}::default`;

test("guest cart survives a reload in the same browser", () => {
  const storage = new FakeStorage();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1", 2).add("censer-1");
  const reloaded = storefrontTab({ storage, catalog: fullCatalog }).load();
  assert.deepEqual(reloaded.cart, { [KEY("cross-1")]: 2, [KEY("censer-1")]: 1 });
});

test("guest cart survives closing and reopening the browser (localStorage persists)", () => {
  const storage = new FakeStorage();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("book-1", 3);
  const reopened = storefrontTab({ storage: storage.clone(), catalog: fullCatalog }).load();
  assert.deepEqual(reopened.cart, { [KEY("book-1")]: 3 });
});

test("opening a catalog page that does not list a cart product keeps that product", () => {
  const storage = new FakeStorage();
  const tab = storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1").add("censer-1");
  tab.showCatalogPage([book]);
  const reloaded = storefrontTab({ storage, catalog: [book] }).load();
  assert.deepEqual(reloaded.cart, { [KEY("cross-1")]: 1, [KEY("censer-1")]: 1 });
});

test("a product that becomes unavailable stays visible in the cart until checkout decides", () => {
  const storage = new FakeStorage();
  const tab = storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1").add("censer-1");
  tab.showCatalogPage([cross, { ...censer, stock: "غير متاح حاليا" }, book]);
  assert.ok(KEY("censer-1") in tab.cart, "the customer should see the line and a notice, not lose it");
});

test("a known stock limit still caps the quantity", () => {
  const limited = { ...censer, variants: [{ id: "default", available: true, quantity: 2 }] };
  const tab = storefrontTab({ storage: new FakeStorage(), catalog: [limited] }).load().add("censer-1", 5);
  assert.equal(tab.cart[KEY("censer-1")], 2);
});

test("reloading on a page that lists only one product keeps every line across reloads", () => {
  const storage = new FakeStorage();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1", 2).add("censer-1").add("book-1");
  for (let reload = 0; reload < 3; reload += 1) storefrontTab({ storage, catalog: [book] }).load().showCatalogPage([book]);
  const finalTab = storefrontTab({ storage, catalog: [] }).load();
  assert.deepEqual(finalTab.cart, { [KEY("cross-1")]: 2, [KEY("censer-1")]: 1, [KEY("book-1")]: 1 });
});

test("signing in with an empty account keeps the guest items and saves them to the account", async () => {
  const storage = new FakeStorage();
  const firestore = fakeFirestore();
  const tab = storefrontTab({ storage, firestore, catalog: fullCatalog }).load().add("cross-1", 2);
  await tab.signIn({ uid: "user-a" });
  assert.deepEqual(tab.cart, { [KEY("cross-1")]: 2 });
  assert.deepEqual(firestore.read("user-a").items.map((item) => [item.productId, item.qty]), [["cross-1", 2]]);
});

test("the account cart opens on another device", async () => {
  const firestore = fakeFirestore();
  const laptop = storefrontTab({ storage: new FakeStorage(), firestore, catalog: fullCatalog }).load();
  await laptop.signIn({ uid: "user-a" });
  laptop.add("censer-1", 1);
  await laptop.context.saveRemoteCart();
  const phone = storefrontTab({ storage: new FakeStorage(), firestore, catalog: fullCatalog }).load();
  await phone.signIn({ uid: "user-a" });
  assert.deepEqual(phone.cart, { [KEY("censer-1")]: 1 });
});

const remoteItems = (firestore, uid) => Object.fromEntries((firestore.read(uid)?.items || []).map((item) => [KEY(item.productId), item.qty]));

test("signing in merges guest items with an existing account cart and saves the result", async () => {
  const firestore = fakeFirestore();
  const otherDevice = storefrontTab({ storage: new FakeStorage(), firestore, catalog: fullCatalog }).load();
  await otherDevice.signIn({ uid: "user-a" });
  otherDevice.add("censer-1");
  await otherDevice.context.saveRemoteCart();

  const storage = new FakeStorage();
  const guest = storefrontTab({ storage, firestore, catalog: fullCatalog }).load().add("book-1");
  firestore.tick(60_000);
  firestore.write("user-a", firestore.read("user-a").items);
  await guest.signIn({ uid: "user-a" });
  assert.deepEqual(guest.cart, { [KEY("censer-1")]: 1, [KEY("book-1")]: 1 });
  assert.deepEqual(remoteItems(firestore, "user-a"), { [KEY("censer-1")]: 1, [KEY("book-1")]: 1 });
  assert.equal(storage.getItem("pope-kyrillos-cart:guest"), null, "guest lines now live in the account");
});

test("signing in twice with the same guest lines never doubles quantities", async () => {
  const firestore = fakeFirestore();
  firestore.write("user-a", [{ productId: "cross-1", variantId: "default", qty: 2 }]);
  const storage = new FakeStorage();
  const tab = storefrontTab({ storage, firestore, catalog: fullCatalog }).load().add("cross-1", 2);
  await tab.signIn({ uid: "user-a" });
  await tab.signOut();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1", 2);
  const again = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  assert.deepEqual(again.cart, { [KEY("cross-1")]: 2 });
});

test("if the account cannot be reached, guest lines are kept and merged on the next sign-in", async () => {
  const firestore = fakeFirestore();
  firestore.write("user-a", [{ productId: "censer-1", variantId: "default", qty: 1 }]);
  const storage = new FakeStorage();
  const tab = storefrontTab({ storage, firestore, catalog: fullCatalog }).load().add("book-1");
  firestore.offline = true;
  await tab.signIn({ uid: "user-a" });
  assert.ok(KEY("book-1") in tab.cart);
  assert.notEqual(storage.getItem("pope-kyrillos-cart:guest"), null, "guest cart kept until the account is saved");
  firestore.offline = false;
  const later = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  assert.deepEqual(later.cart, { [KEY("censer-1")]: 1, [KEY("book-1")]: 1 });
});

test("a line removed on another device stays removed when signing in here", async () => {
  const firestore = fakeFirestore();
  const storage = new FakeStorage();
  const here = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  here.add("cross-1").add("censer-1");
  await here.context.saveRemoteCart();
  firestore.tick(60_000);
  const phone = await storefrontTab({ storage: new FakeStorage(), firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  phone.remove("censer-1");
  firestore.tick(60_000);
  await phone.context.saveRemoteCart();
  const back = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  assert.deepEqual(back.cart, { [KEY("cross-1")]: 1 });
});

test("signing out hides the account cart and signing back in restores it", async () => {
  const firestore = fakeFirestore();
  const storage = new FakeStorage();
  const tab = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  tab.add("cross-1");
  await tab.signOut();
  assert.deepEqual(tab.cart, {}, "the guest view must not show the account's lines");
  const back = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  assert.deepEqual(back.cart, { [KEY("cross-1")]: 1 });
});

test("two accounts on the same device never see or absorb each other's cart", async () => {
  const firestore = fakeFirestore();
  const storage = new FakeStorage();
  const first = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-a" });
  first.add("cross-1", 3);
  await first.signOut();
  const second = await storefrontTab({ storage, firestore, catalog: fullCatalog }).load().signIn({ uid: "user-b" });
  assert.deepEqual(second.cart, {});
  second.add("book-1");
  await second.context.saveRemoteCart();
  assert.deepEqual(remoteItems(firestore, "user-a"), { [KEY("cross-1")]: 3 });
  assert.deepEqual(remoteItems(firestore, "user-b"), { [KEY("book-1")]: 1 });
});

test("quantity updates and removals persist across reloads", () => {
  const storage = new FakeStorage();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1").add("cross-1", 2).add("censer-1").remove("censer-1");
  assert.deepEqual(storefrontTab({ storage, catalog: fullCatalog }).load().cart, { [KEY("cross-1")]: 3 });
});

test("adding from a product page while signed in does not hide the account cart", () => {
  const storage = new FakeStorage();
  const user = { uid: "user-a" };
  storage.setItem("pope-kyrillos-auth:user", JSON.stringify(user)); // saved by script.js on sign-in
  storage.setItem("firebase:authUser:demo-key:[DEFAULT]", JSON.stringify(user)); // persisted by Firebase on sign-in
  storefrontTab({ storage, catalog: fullCatalog, user }).load().add("cross-1").add("censer-1");
  assert.equal(productPageAdd(storage, { productId: "book-1", variantId: "default", qty: 1 }), "pope-kyrillos-cart:user:user-a");
  const nextPage = storefrontTab({ storage, catalog: fullCatalog, user }).load();
  assert.deepEqual(nextPage.cart, { [KEY("cross-1")]: 1, [KEY("censer-1")]: 1, [KEY("book-1")]: 1 });
  assert.equal(storage.getItem("pope-kyrillos-cart:guest"), null, "nothing leaks into the guest cart");
});

test("a guest adding from a product page sees the item in the storefront cart", () => {
  const storage = new FakeStorage();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1");
  assert.equal(productPageAdd(storage, { productId: "book-1", variantId: "default", qty: 2 }), "pope-kyrillos-cart:guest");
  const nextPage = storefrontTab({ storage, catalog: fullCatalog }).load();
  assert.deepEqual(nextPage.cart, { [KEY("cross-1")]: 1, [KEY("book-1")]: 2 });
});

test("no payment or personal data is written to the cart storage", () => {
  const storage = new FakeStorage();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1");
  const cartValues = [...storage.map].filter(([key]) => key.startsWith("pope-kyrillos-cart")).map(([, value]) => value).join(" ");
  assert.doesNotMatch(cartValues, /phone|address|card|cvv|email|password|instapay|اسم|موبايل/i);
});
