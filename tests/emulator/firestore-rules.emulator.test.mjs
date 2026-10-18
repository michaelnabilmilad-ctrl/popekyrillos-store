// Firestore security rules against the local Firebase Emulator Suite only.
// Run with: firebase emulators:start --only auth,firestore --project demo-popekyrillos
// then:     node --test tests/emulator/
// Uses the demo project (never a real Firebase project) and only 127.0.0.1.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const PROJECT = "demo-popekyrillos";
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8080";
assert.ok(PROJECT.startsWith("demo-"), "emulator tests must use a demo project");

const reachable = await fetch(`${FIRESTORE}/`).then((response) => response.ok).catch(() => false);
const docUrl = (path) => `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;

async function resetEmulators() {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  // Load the repository's rules so the test checks exactly what would be deployed.
  const rules = fs.readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
  const response = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } })
  });
  assert.equal(response.status, 200, await response.text());
}

async function signUp(email) {
  const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `local-${Math.random().toString(36).slice(2)}`, returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return { uid: body.localId, token: body.idToken };
}

const cartFields = (items) => ({
  fields: {
    items: { arrayValue: { values: items.map((item) => ({ mapValue: { fields: { productId: { stringValue: item.productId }, variantId: { stringValue: "default" }, qty: { integerValue: String(item.qty) } } } })) } },
    clientUpdatedAt: { stringValue: new Date().toISOString() }
  }
});

function as(user) {
  const headers = { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${user.token}` } : {}) };
  return {
    read: (path) => fetch(docUrl(path), { headers }),
    write: (path, body) => fetch(docUrl(path), { method: "PATCH", headers, body: JSON.stringify(body) }),
    remove: (path) => fetch(docUrl(path), { method: "DELETE", headers })
  };
}
// The emulator's "owner" token bypasses rules; used only to seed an admin record.
const owner = { token: "owner" };

test("each customer can read, write and delete only their own cart", { skip: !reachable && "Firestore emulator is not running" }, async () => {
  await resetEmulators();
  const alice = await signUp("alice@test.local");
  const bob = await signUp("bob@test.local");

  assert.equal((await as(alice).write(`customerCarts/${alice.uid}`, cartFields([{ productId: "cross-1", qty: 2 }]))).status, 200, "owner writes own cart");
  assert.equal((await as(alice).read(`customerCarts/${alice.uid}`)).status, 200, "owner reads own cart");
  assert.equal((await as(bob).write(`customerCarts/${bob.uid}`, cartFields([{ productId: "book-1", qty: 1 }]))).status, 200);

  assert.equal((await as(bob).read(`customerCarts/${alice.uid}`)).status, 403, "another customer cannot read it");
  assert.equal((await as(bob).write(`customerCarts/${alice.uid}`, cartFields([{ productId: "x", qty: 99 }]))).status, 403, "another customer cannot change it");
  assert.equal((await as(bob).remove(`customerCarts/${alice.uid}`)).status, 403, "another customer cannot delete it");
  assert.equal((await as(null).read(`customerCarts/${alice.uid}`)).status, 403, "a signed-out visitor cannot read it");
  assert.equal((await as(null).write(`customerCarts/${alice.uid}`, cartFields([]))).status, 403, "a signed-out visitor cannot write it");

  const aliceCart = await (await as(alice).read(`customerCarts/${alice.uid}`)).json();
  assert.equal(aliceCart.fields.items.arrayValue.values[0].mapValue.fields.qty.integerValue, "2", "the forged writes did not change it");
  assert.equal((await as(alice).remove(`customerCarts/${alice.uid}`)).status, 200, "owner can clear own cart");
});

test("customers cannot make themselves admins; admins can read carts", { skip: !reachable && "Firestore emulator is not running" }, async () => {
  await resetEmulators();
  const alice = await signUp("alice@test.local");
  const staff = await signUp("staff@test.local");
  await as(alice).write(`customerCarts/${alice.uid}`, cartFields([{ productId: "cross-1", qty: 1 }]));

  assert.equal((await as(alice).write(`admins/${alice.uid}`, { fields: { role: { stringValue: "admin" } } })).status, 403, "self-promotion is refused");
  assert.equal((await as(staff).read(`customerCarts/${alice.uid}`)).status, 403, "not an admin yet");
  assert.equal((await as(owner).write(`admins/${staff.uid}`, { fields: { role: { stringValue: "admin" } } })).status, 200);
  assert.equal((await as(staff).read(`customerCarts/${alice.uid}`)).status, 200, "admins can read customer carts");
});

test("orders cannot be created from the browser and customer profiles stay private", { skip: !reachable && "Firestore emulator is not running" }, async () => {
  await resetEmulators();
  const alice = await signUp("alice@test.local");
  const bob = await signUp("bob@test.local");
  assert.equal((await as(alice).write("orders/forged-1", { fields: { userId: { stringValue: alice.uid } } })).status, 403);
  assert.equal((await as(alice).write(`customers/${alice.uid}`, { fields: { name: { stringValue: "Alice" } } })).status, 200);
  assert.equal((await as(bob).read(`customers/${alice.uid}`)).status, 403);
  assert.equal((await as(alice).read("unknownCollection/x")).status, 403, "everything else is closed");
});
