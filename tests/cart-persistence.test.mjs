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

test("signing in merges guest items with an existing account cart", { todo: "applySignedInCart keeps only the newest cart instead of merging" }, async () => {
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
});

test("signing out keeps the items in this browser", () => {
  const storage = new FakeStorage();
  const tab = storefrontTab({ storage, catalog: fullCatalog, user: { uid: "user-a" } }).load().add("cross-1");
  tab.signOut();
  assert.deepEqual(tab.cart, { [KEY("cross-1")]: 1 });
});

test("adding from a product page while signed in does not hide the account cart", { todo: "product-page.js always writes the guest key and marks it active" }, () => {
  const storage = new FakeStorage();
  const user = { uid: "user-a" };
  storefrontTab({ storage, catalog: fullCatalog, user }).load().add("cross-1").add("censer-1");
  productPageAdd(storage, { productId: "book-1", variantId: "default", qty: 1 });
  const nextPage = storefrontTab({ storage, catalog: fullCatalog, user }).load();
  assert.deepEqual(nextPage.cart, { [KEY("cross-1")]: 1, [KEY("censer-1")]: 1, [KEY("book-1")]: 1 });
});

test("no payment or personal data is written to the cart storage", () => {
  const storage = new FakeStorage();
  storefrontTab({ storage, catalog: fullCatalog }).load().add("cross-1");
  const cartValues = [...storage.map].filter(([key]) => key.startsWith("pope-kyrillos-cart")).map(([, value]) => value).join(" ");
  assert.doesNotMatch(cartValues, /phone|address|card|cvv|email|password|instapay|اسم|موبايل/i);
});
