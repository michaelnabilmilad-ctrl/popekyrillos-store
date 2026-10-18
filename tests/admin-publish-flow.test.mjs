// End-to-end admin publishing flow through the real Worker router, against an
// in-memory fake of the GitHub API (tests/helpers/fake-github.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SITE, BRANCH, adminAuthHeader, adminJsonPost, createAdminEnv, installFakeGitHub } from "./helpers/fake-github.mjs";

globalThis.caches = { default: { async match() { return null; }, async put() {} } };

const worker = (await import(`../cloudflare-worker.js?admin-publish=${Date.now()}`)).default;
const env = createAdminEnv();
const ctx = { waitUntil() {} };

const seedProducts = [
  { id: "censer-1", name: "شورية نحاس", price: 1200, stock: "متاح", category: "altar-vessels", variants: [] },
  { id: "candle-1", name: "شمع مذبح", price: 90, stock: "متاح", category: "candles-lamps", variants: [] }
];
const seedFiles = {
  "products.json": `${JSON.stringify(seedProducts, null, 2)}\n`,
  "category-taxonomy.js": "window.POPE_KYRILLOS_TAXONOMY = (function () { const categories = []; return { categories }; })();\n"
};
const setup = (t) => installFakeGitHub(t, env, seedFiles);
const post = (pathname, body, headers) => adminJsonPost(env, pathname, body, headers);

function publishBody(products, { newProductIds = [], deletedProductIds = [] } = {}) {
  return { products, newProductIds, deletedProductIds, message: `Update products from admin ${new Date().toISOString()}` };
}

test("admin write endpoints reject requests without the admin password and touch nothing", async (t) => {
  const github = setup(t);
  for (const pathname of ["/admin/api/update-products", "/admin/api/update-taxonomy", "/admin/api/upload-product-image"]) {
    const response = await worker.fetch(new Request(`${SITE}${pathname}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), env, ctx);
    assert.equal(response.status, 401, pathname);
  }
  assert.equal(github.repo.writes.length, 0);
});

test("adding a product commits it to products-data and the storefront serves it", async (t) => {
  const github = setup(t);
  const added = { id: "new-cross-1", name: "صليب يد جديد", price: 450, stock: "متاح", variants: [] };
  const response = await worker.fetch(post("/admin/api/update-products", publishBody([...seedProducts, added], { newProductIds: [added.id] })), env, ctx);
  const result = await response.json();

  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.ok, true);
  assert.equal(result.branch, BRANCH);
  assert.equal(result.savedCount, 3);
  assert.deepEqual(github.products().map((product) => product.id), ["censer-1", "candle-1", "new-cross-1"]);
  assert.equal(github.file("dist/products.json"), github.file("products.json"), "fallback copy is committed alongside");
  assert.equal(github.commitCount(), 1);

  const storefront = await worker.fetch(new Request(`${SITE}/products.json`), env, ctx);
  const live = await storefront.json();
  assert.ok(live.some((product) => product.id === "new-cross-1"), "the site reads the committed catalog without a deploy");
});

test("editing price, stock and images replaces only that product", async (t) => {
  const github = setup(t);
  const edited = seedProducts.map((product) => product.id === "censer-1"
    ? { ...product, price: 1350, stock: "غير متاح", images: ["assets/optimized/products/gallery/censer-new.webp"] }
    : product);
  const response = await worker.fetch(post("/admin/api/update-products", publishBody(edited)), env, ctx);
  assert.equal(response.status, 200);

  const saved = github.products();
  const censer = saved.find((product) => product.id === "censer-1");
  assert.equal(censer.price, 1350);
  assert.equal(censer.stock, "غير متاح");
  assert.deepEqual(censer.images, ["assets/optimized/products/gallery/censer-new.webp"]);
  assert.deepEqual(saved.find((product) => product.id === "candle-1"), seedProducts[1]);
});

test("deleting needs an explicit deletedProductIds entry", async (t) => {
  const github = setup(t);
  const response = await worker.fetch(post("/admin/api/update-products", publishBody([seedProducts[0]], { deletedProductIds: ["candle-1"] })), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(github.products().map((product) => product.id), ["censer-1"]);
});

test("a save that silently drops products is rejected before any commit", async (t) => {
  const github = setup(t);
  const response = await worker.fetch(post("/admin/api/update-products", publishBody([seedProducts[0]])), env, ctx);
  const result = await response.json();
  assert.equal(response.status, 409);
  assert.deepEqual(result.omittedProductIds, ["candle-1"]);
  assert.equal(github.commitCount(), 0);
  assert.equal(github.repo.writes.length, 0);
});

test("publishing categories commits category-taxonomy.js to products-data", async (t) => {
  const github = setup(t);
  const taxonomySource = "window.POPE_KYRILLOS_TAXONOMY = (function () { const categories = [{\"id\":\"altar-vessels\",\"name\":\"المذبح\",\"subcategories\":[{\"id\":\"censers\",\"name\":\"الشوريات\"}]}]; return { categories }; })();";
  const response = await worker.fetch(post("/admin/api/update-taxonomy", {
    categories: [{ id: "altar-vessels", name: "المذبح", subcategories: [{ id: "censers", name: "الشوريات" }] }],
    taxonomySource,
    message: "Update category taxonomy from admin test"
  }), env, ctx);
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(github.text("category-taxonomy.js"), `${taxonomySource}\n`);
  assert.ok(github.file("dist/category-taxonomy.js"));
});

test("uploading a product image commits the WebP to all four gallery paths", async (t) => {
  const github = setup(t);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([16, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(16)]).toString("base64");
  const response = await worker.fetch(post("/admin/api/upload-product-image", { filename: "cross.png", productId: "new-cross-1", imageBase64: webp }), env, ctx);
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.match(result.path, /^assets\/optimized\/products\/gallery\/new-cross-1-cross-\d{14}-[0-9a-f]+\.webp$/);
  for (const prefix of ["", "dist/"]) {
    assert.equal(github.file(`${prefix}${result.path}`), webp);
    assert.equal(github.file(`${prefix}${result.path.replace("assets/optimized/products/", "assets/detail/products/")}`), webp);
  }
});

test("every admin write request is a same-origin JSON POST (contract the CSRF fix relies on)", () => {
  const sources = {
    "admin.js": fs.readFileSync("admin.js", "utf8"),
    "admin-orders.js": fs.readFileSync("admin-orders.js", "utf8")
  };
  const endpoints = [
    ["admin.js", "/admin/api/update-products"],
    ["admin.js", "/admin/api/update-taxonomy"],
    ["admin.js", "/admin/api/upload-product-image"],
    ["admin.js", "/admin/api/sync-airtable-product-media"],
    ["admin.js", "/admin/api/backfill-airtable-order-products"],
    ["admin-orders.js", "/admin/api/orders/"]
  ];
  for (const [file, endpoint] of endpoints) {
    const source = sources[file];
    const calls = [...source.matchAll(/fetch(?:WithTimeout)?\(\s*[`"]([^`"]+)[`"]\s*,\s*\{([\s\S]*?)\}\s*(?:,\s*\d+\s*)?\)/g)]
      .filter((match) => match[1].startsWith(endpoint));
    assert.ok(calls.length, `${file} calls ${endpoint}`);
    for (const [, , options] of calls) {
      assert.match(options, /method:\s*"(POST|PATCH)"/, `${endpoint} uses a write method`);
      assert.match(options, /"Content-Type":\s*"application\/json"/, `${endpoint} sends JSON`);
      assert.doesNotMatch(options, /credentials:\s*"include"/, `${endpoint} stays same-origin`);
    }
  }
});

const adminWriteEndpoints = [
  ["POST", "/admin/api/update-products"],
  ["POST", "/admin/api/update-taxonomy"],
  ["POST", "/admin/api/upload-product-image"],
  ["POST", "/admin/api/sync-airtable-product-media"],
  ["POST", "/admin/api/backfill-airtable-order-products"],
  ["PATCH", "/admin/api/orders/rec123"]
];
const forgedRequests = {
  "cross-site text/plain (form or no-cors fetch)": { Origin: "https://attacker.example", "Content-Type": "text/plain" },
  "cross-site form encoding": { Origin: "https://attacker.example", "Content-Type": "application/x-www-form-urlencoded" },
  "cross-site JSON": { Origin: "https://attacker.example", "Content-Type": "application/json" },
  "same origin but not JSON": { Origin: SITE, "Content-Type": "text/plain" },
  "no Origin header": { "Content-Type": "application/json" },
  "opaque null origin": { Origin: "null", "Content-Type": "application/json" }
};

test("forged admin writes are refused with 403 even with valid admin credentials", async (t) => {
  const github = setup(t);
  const tampered = JSON.stringify(publishBody(seedProducts.map((product) => ({ ...product, price: 1 }))));
  for (const [label, headers] of Object.entries(forgedRequests)) {
    for (const [method, pathname] of adminWriteEndpoints) {
      const response = await worker.fetch(new Request(`${SITE}${pathname}`, { method, headers: { Authorization: adminAuthHeader(env), ...headers }, body: tampered }), env, ctx);
      assert.equal(response.status, 403, `${label} → ${method} ${pathname}`);
      assert.equal((await response.json()).error, "forbidden_origin");
    }
  }
  assert.equal(github.repo.writes.length, 0, "no forged request may reach GitHub");
  assert.deepEqual(github.products(), seedProducts, "prices are untouched");
});

test("the password check still runs first: forged requests without credentials get 401", async (t) => {
  setup(t);
  const response = await worker.fetch(new Request(`${SITE}/admin/api/update-products`, { method: "POST", headers: forgedRequests["cross-site text/plain (form or no-cors fetch)"], body: "{}" }), env, ctx);
  assert.equal(response.status, 401);
});

test("a JSON content type with a charset still counts as JSON", async (t) => {
  const github = setup(t);
  const edited = seedProducts.map((product) => product.id === "candle-1" ? { ...product, price: 95 } : product);
  const response = await worker.fetch(post("/admin/api/update-products", publishBody(edited), { "Content-Type": "application/json; charset=utf-8" }), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(github.products().find((product) => product.id === "candle-1").price, 95);
});

test("admin pages and read APIs are not blocked by the origin check", async (t) => {
  setup(t);
  for (const pathname of ["/admin/", "/admin/orders/", "/admin/analytics/", "/admin/api/orders", "/admin/api/analytics?days=7"]) {
    const response = await worker.fetch(new Request(`${SITE}${pathname}`, { headers: { Authorization: adminAuthHeader(env) } }), env, ctx);
    assert.notEqual(response.status, 403, pathname);
    assert.notEqual(response.status, 401, pathname);
  }
});

test("same-origin JSON writes to every admin endpoint pass the origin check", async (t) => {
  setup(t);
  for (const [method, pathname] of adminWriteEndpoints) {
    const response = await worker.fetch(new Request(`${SITE}${pathname}`, {
      method,
      headers: { Authorization: adminAuthHeader(env), Origin: SITE, "Content-Type": "application/json" },
      body: JSON.stringify({})
    }), env, ctx);
    assert.notEqual(response.status, 403, `${method} ${pathname} must reach its handler`);
  }
});

test("customer storefront APIs are outside the admin origin check", async (t) => {
  setup(t);
  const response = await worker.fetch(new Request(`${SITE}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), env, ctx);
  assert.notEqual((await response.clone().json().catch(() => ({}))).error, "forbidden_origin");
});
