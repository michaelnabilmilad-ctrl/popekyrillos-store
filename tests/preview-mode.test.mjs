// The read-only preview Worker (wrangler.preview.toml, PREVIEW_MODE="1", no secrets)
// must serve the storefront from its own host, keep Firebase off, refuse every
// write, and never contact GitHub's write API, Airtable, or any other service.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.caches = { default: { async match() { return null; }, async put() {} } };
const worker = (await import(`../cloudflare-worker.js?preview=${Date.now()}`)).default;
const PREVIEW = "https://popekyrillos-store-preview.example.workers.dev";
const ctx = { waitUntil() {} };
const products = [{ id: "cross-1", name: "صليب", price: 450, stock: "متاح", mainCategory: "الصلبان", subcategory: "hand-crosses", variants: [] }];

function previewEnv() {
  return {
    PREVIEW_MODE: "1",
    SITE_URL: "https://popekyrillos.store",
    ASSETS: {
      async fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/thumbnail-manifest-v2.json") return Response.json({});
        if (pathname === "/index.html" || pathname === "/") return new Response("<!doctype html><title>store</title>", { headers: { "Content-Type": "text/html" } });
        return new Response("not found", { status: 404 });
      }
    }
  };
}

function recordNetwork(t) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(`${request.method} ${request.url}`);
    if (request.method === "GET" && request.url.startsWith("https://raw.githubusercontent.com/") && request.url.endsWith("/products-data/products.json")) {
      return new Response(JSON.stringify(products));
    }
    return new Response("not found", { status: 404 });
  });
  return calls;
}

test("the preview serves the catalog from its own host and is marked noindex", async (t) => {
  const calls = recordNetwork(t);
  const response = await worker.fetch(new Request(`${PREVIEW}/api/catalog?limit=12`), previewEnv(), ctx);
  assert.equal(response.status, 200, "no redirect to the production domain");
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.deepEqual((await response.json()).items.map((item) => item.id), ["cross-1"]);
  assert.ok(calls.every((call) => call.startsWith("GET https://raw.githubusercontent.com/")), `read-only public reads only: ${calls.join(" | ")}`);
});

test("the preview keeps Firebase off so nobody can sign in or write to the real Firestore", async (t) => {
  recordNetwork(t);
  for (const pathname of ["/firebase-config.min.js", "/firebase-config.js"]) {
    const response = await worker.fetch(new Request(`${PREVIEW}${pathname}`), previewEnv(), ctx);
    const body = await response.text();
    assert.match(body, /POPE_KYRILLOS_FIREBASE_CONFIG = \{\};/);
    assert.doesNotMatch(body, /apiKey|projectId/);
  }
});

test("every write is refused in the preview and reaches no service", async (t) => {
  const calls = recordNetwork(t);
  const writes = [
    ["POST", "/api/orders"], ["POST", "/api/create-paymob-intention"], ["POST", "/api/create-bosta-delivery"],
    ["POST", "/api/analytics/events"], ["POST", "/api/customer-orders/lookup"], ["POST", "/api/assistant/chat"],
    ["POST", "/admin/api/update-products"], ["POST", "/admin/api/update-taxonomy"], ["PATCH", "/admin/api/orders/rec1"]
  ];
  for (const [method, pathname] of writes) {
    const response = await worker.fetch(new Request(`${PREVIEW}${pathname}`, { method, headers: { "Content-Type": "application/json", Origin: PREVIEW }, body: "{}" }), previewEnv(), ctx);
    assert.equal(response.status, 403, `${method} ${pathname}`);
    assert.equal((await response.json()).error, "preview_read_only");
  }
  assert.deepEqual(calls, [], "no outbound request at all");
});

test("production behaviour is unchanged without PREVIEW_MODE: other hosts redirect to the real domain", async (t) => {
  recordNetwork(t);
  const { PREVIEW_MODE, ...productionEnv } = previewEnv();
  const response = await worker.fetch(new Request(`${PREVIEW}/`), productionEnv, ctx);
  assert.equal(response.status, 301);
  assert.equal(new URL(response.headers.get("Location")).hostname, "popekyrillos.store");
});

test("the preview config has no routes, custom domains, D1 or secrets of the production Worker", () => {
  const config = fs.readFileSync("wrangler.preview.toml", "utf8");
  assert.match(config, /^name = "popekyrillos-store-preview"$/m);
  assert.match(config, /^PREVIEW_MODE = "1"$/m);
  assert.doesNotMatch(config, /\[\[routes\]\]|custom_domain|d1_databases|keep_vars|zone_name/);
  assert.doesNotMatch(fs.readFileSync("wrangler.toml", "utf8"), /PREVIEW_MODE/, "the production config never enables preview mode");
});
