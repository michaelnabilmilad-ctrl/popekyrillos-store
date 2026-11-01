import test from "node:test";
import assert from "node:assert/strict";

globalThis.caches = { default: { async match() { return null; }, async put() {} } };
const worker = (await import(`../cloudflare-worker.js?card-thumbs=${Date.now()}`)).default;

const product = (id, image) => ({ id, name: `منتج ${id}`, price: 100, stock: "متاح", images: [image], variants: [] });

test("Catalog cards use a small image only while it matches the current product photo", async (t) => {
  const products = [
    product("fresh", "assets/optimized/products/gallery/new.webp"),
    product("replaced", "assets/optimized/products/gallery/replaced-in-admin.webp"),
    product("legacy", "https://cdn.shopify.com/s/files/legacy.jpg"),
    product("none", "assets/optimized/products/gallery/no-thumb.webp")
  ];
  const manifest = {
    fresh: { thumbnail: "/assets/thumbnails/320/fresh.webp", source: "assets/optimized/products/gallery/new.webp" },
    replaced: { thumbnail: "/assets/thumbnails/320/replaced-old.webp", source: "assets/optimized/products/gallery/old.webp" },
    legacy: "/assets/thumbnails/320/legacy.webp"
  };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(products), { status: 200, headers: { ETag: "card-thumbs" } }));
  const env = {
    ASSETS: {
      async fetch(request) {
        if (new URL(request.url).pathname === "/thumbnail-manifest-v2.json") return Response.json(manifest);
        return new Response("not found", { status: 404 });
      }
    }
  };
  const response = await worker.fetch(new Request("https://popekyrillos.store/api/catalog?page=1&limit=48"), env, { waitUntil() {} });
  const items = Object.fromEntries((await response.json()).items.map((item) => [item.id, item.thumbnail]));

  assert.equal(items.fresh, "/assets/thumbnails/320/fresh.webp");
  assert.equal(items.replaced, "assets/optimized/products/gallery/replaced-in-admin.webp");
  assert.equal(items.legacy, "/assets/thumbnails/320/legacy.webp");
  assert.equal(items.none, "assets/optimized/products/gallery/no-thumb.webp");
});
