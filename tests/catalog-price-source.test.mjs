import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.caches = {
  default: {
    async match() { return null; },
    async put() {}
  }
};

const worker = (await import(`../cloudflare-worker.js?catalog-price=${Date.now()}`)).default;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const noChoices = {
  id: "reliquary-size-5",
  name: "أنبوبة رفات قديسين مقاس 5 - 37 سم",
  price: 600,
  stock: "متاح",
  options: [],
  variants: [{ id: "stale-default", title: "الاختيار الافتراضي", options: {}, price: 325, available: true }]
};

const withChoices = {
  id: "actual-choices",
  name: "منتج باختيارات فعلية",
  price: 1000,
  stock: "متاح",
  options: [{ name: "المقاس", values: ["صغير", "كبير"] }],
  variants: [
    { id: "small", options: { "المقاس": "صغير" }, price: 700, available: true },
    { id: "large", options: { "المقاس": "كبير" }, price: 800, available: true }
  ]
};

test("Catalog ignores stale default variant prices but preserves real choice pricing", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify([noChoices, withChoices]), {
    status: 200,
    headers: { ETag: "price-source-fixture" }
  }));

  const env = {
    ASSETS: {
      async fetch(request) {
        if (new URL(request.url).pathname === "/thumbnail-manifest-v2.json") return Response.json({});
        return new Response("not found", { status: 404 });
      }
    }
  };
  const response = await worker.fetch(
    new Request("https://popekyrillos.store/api/catalog?page=1&limit=48"),
    env,
    { waitUntil() {} }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items.find((item) => item.id === noChoices.id).price, 600);
  assert.equal(payload.items.find((item) => item.id === withChoices.id).price, 700);
});

test("Admin and storefront share the explicit hasVariants rule", () => {
  const admin = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  const catalog = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const productPage = fs.readFileSync(path.join(root, "product-page.js"), "utf8");

  assert.match(admin, /product\.hasVariants = event\.currentTarget\.checked/);
  assert.match(admin, /if \(!product\.hasVariants\) syncSingleDefaultVariant\(product\)/);
  assert.match(catalog, /productHasVariants\(product\) && Array\.isArray\(product\?\.variants\)/);
  assert.match(productPage, /productHasVariants && Array\.isArray\(product\.variants\)/);
});
