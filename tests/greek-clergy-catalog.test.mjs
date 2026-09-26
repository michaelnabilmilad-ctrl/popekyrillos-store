import test from "node:test";
import assert from "node:assert/strict";

globalThis.caches = {
  default: {
    async match() { return null; },
    async put() {}
  }
};

const worker = (await import(`../cloudflare-worker.js?greek-catalog=${Date.now()}`)).default;

function greekCross(index, { legacyGroup = false } = {}) {
  return {
    id: `greek-cross-${index}`,
    sku: "SHARED-PARENT-SKU",
    name: `Greek cross ${index}`,
    mainCategory: "crosses",
    subcategory: "pectoral-crosses",
    ...(legacyGroup ? { groupId: "GR" } : { collections: ["greek-clergy-crosses"] }),
    images: [`assets/greek-cross-${index}.webp`],
    price: 1000 + index,
    stock: "متاح",
    variants: [{
      id: `greek-cross-${index}-variant`,
      sku: `UNIQUE-VARIANT-SKU-${index}`,
      price: 1000 + index,
      quantity: index,
      available: true
    }]
  };
}

test("Greek clergy catalog keeps every product record even when parent SKUs are shared", async (t) => {
  const products = Array.from({ length: 7 }, (_, index) => greekCross(index + 1));
  products.push(greekCross(8, { legacyGroup: true }));

  t.mock.method(globalThis, "fetch", async (input) => {
    const url = String(input?.url || input);
    if (url.includes("raw.githubusercontent.com") || url.includes("api.github.com")) {
      return new Response(JSON.stringify(products), { status: 200, headers: { ETag: "greek-fixture" } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const env = {
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/thumbnail-manifest-v2.json") return Response.json({});
        return new Response("not found", { status: 404 });
      }
    }
  };
  const response = await worker.fetch(
    new Request("https://popekyrillos.store/api/catalog?category=greek-collection&subcategory=greek-clergy-crosses&page=1&limit=48"),
    env,
    { waitUntil() {} }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.total, 8);
  assert.equal(payload.subcategoryCounts["greek-collection"]["greek-clergy-crosses"], 8);
  assert.deepEqual(payload.items.map((product) => product.id), products.map((product) => product.id));
  assert.deepEqual(payload.items.map((product) => product.price), products.map((product) => product.price));
  assert.ok(payload.items.every((product) => product.collections.includes("greek-clergy-crosses")));
});
