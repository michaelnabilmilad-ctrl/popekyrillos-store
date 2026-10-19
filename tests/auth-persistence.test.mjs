// Reported on the live site (2026-10-19): in regular Chrome a Google-signed-in customer looked
// signed out after a refresh, with «انتهت جلسة تسجيل الدخول…»; Incognito kept the session.
// Reproduced with the Firebase emulator: an older invalid session left in IndexedDB won over the
// fresh one in localStorage (the SDK's default order for getAuth), the SDK deleted the fresh one,
// failed to validate the old one and signed the customer out. The fix reads localStorage first, so
// the fresh session wins and the SDK itself removes the stale IndexedDB copy.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { FakeStorage, extractFunction } from "./helpers/storefront-sandbox.mjs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const script = read("../script.js");
const checkout = read("../checkout-flow.js");
const pages = { "index.html": read("../index.html"), "policies.html": read("../policies.html") };

function fakeAuthModule({ alreadyInitialized = false, failWith = null } = {}) {
  const calls = [];
  return {
    calls,
    browserLocalPersistence: "local",
    indexedDBLocalPersistence: "indexedDB",
    browserPopupRedirectResolver: "popupResolver",
    initializeAuth(app, options) {
      calls.push(["initializeAuth", app, options]);
      if (failWith) throw Object.assign(new Error(failWith), { code: failWith });
      if (alreadyInitialized) throw Object.assign(new Error("already"), { code: "auth/already-initialized" });
      return { app, persistence: options.persistence };
    },
    getAuth(app) { calls.push(["getAuth", app]); return { app, existing: true }; }
  };
}

for (const [name, source] of [["script.js", script], ["checkout-flow.js", checkout]]) {
  test(`${name}: the session is read from localStorage first, then IndexedDB`, () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(extractFunction(source, "initFirebaseAuth"), context);
    const auth = fakeAuthModule();
    const result = context.initFirebaseAuth(auth, "app");
    assert.deepEqual([...result.persistence], ["local", "indexedDB"]);
    assert.equal(auth.calls[0][2].popupRedirectResolver, "popupResolver", "Google popup and redirect sign-in keep working");
  });

  test(`${name}: an already initialised Firebase Auth is reused, other errors are not hidden`, () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(extractFunction(source, "initFirebaseAuth"), context);
    assert.equal(context.initFirebaseAuth(fakeAuthModule({ alreadyInitialized: true }), "app").existing, true);
    assert.throws(() => context.initFirebaseAuth(fakeAuthModule({ failWith: "auth/invalid-api-key" }), "app"), /invalid-api-key/);
  });

  test(`${name}: no getAuth()/setPersistence() path that uses the SDK's IndexedDB-first order`, () => {
    assert.doesNotMatch(source, /setPersistence\(/);
    assert.equal((source.match(/authModule\.getAuth\(/g) || []).length, 1, "getAuth only as the already-initialised fallback");
    assert.match(source, /const auth = initFirebaseAuth\(authModule, app\);/);
  });
}

// The inline check placed right after the header label, run as the browser would run it.
function runHeaderCheck(html, { local = [], session = [], storageThrows = false } = {}) {
  const inline = /<span data-account-label>دخول<\/span>\n\s*<!--[^\n]*-->\n\s*<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(inline, "inline check sits right after the label");
  const label = { textContent: "دخول" };
  const throwing = { get length() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); } };
  const context = {
    document: { currentScript: { previousElementSibling: label } },
    localStorage: storageThrows ? throwing : new FakeStorage(local),
    sessionStorage: storageThrows ? throwing : new FakeStorage(session),
    JSON
  };
  vm.createContext(context);
  vm.runInContext(inline[1], context);
  return label.textContent;
}

for (const [name, html] of Object.entries(pages)) {
  test(`${name}: a saved session shows «جارٍ التحقق…» at once instead of «دخول»`, () => {
    assert.equal(runHeaderCheck(html, { local: [["pope-kyrillos-auth:user", JSON.stringify({ uid: "u1" })]] }), "جارٍ التحقق…");
    assert.equal(runHeaderCheck(html, { local: [["firebase:authUser:key:[DEFAULT]", JSON.stringify({ uid: "u1" })]] }), "جارٍ التحقق…");
    assert.equal(runHeaderCheck(html, { session: [["pope-kyrillos-auth:redirect", "1"]] }), "جارٍ التحقق…");
  });

  test(`${name}: a guest, a broken record or blocked storage keeps «دخول»`, () => {
    assert.equal(runHeaderCheck(html), "دخول");
    assert.equal(runHeaderCheck(html, { local: [["pope-kyrillos-auth:user", "{not json"]] }), "دخول");
    assert.equal(runHeaderCheck(html, { local: [["firebase:authUser:key:[DEFAULT]", "null"]] }), "دخول");
    assert.equal(runHeaderCheck(html, { storageThrows: true }), "دخول");
  });
}

test("the inline header check uses the same session records as the storefront", () => {
  assert.match(script, /const cachedAuthStorageKey = "pope-kyrillos-auth:user";/);
  assert.match(script, /if \(!key\.startsWith\("firebase:authUser:"\)\) continue;/);
  assert.match(script, /sessionStorage\.getItem\("pope-kyrillos-auth:redirect"\) === "1"/);
});
