import test from "node:test";
import assert from "node:assert/strict";

const validTaxonomy = "const CURRENT_TAXONOMY_VERSION = 12345; window.POPE_KYRILLOS_TAXONOMY={categories:[{id:'crosses'}],CURRENT_TAXONOMY_VERSION};";

async function freshWorker() {
  return (await import(`../cloudflare-worker.js?taxonomy-recovery=${Date.now()}-${Math.random()}`)).default;
}

function context() {
  return { waitUntil() {} };
}

test("taxonomy endpoint serves the last known-good source when asset revalidation fails", async () => {
  const worker = await freshWorker();
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  let requests = 0;
  const env = {
    ASSETS: {
      async fetch() {
        requests += 1;
        if (requests === 1) return new Response(validTaxonomy, { status: 200, headers: { ETag: '"taxonomy-v1"' } });
        return new Response("temporary failure", { status: 503 });
      }
    }
  };

  try {
    const first = await worker.fetch(new Request("https://popekyrillos.store/category-taxonomy.js"), env, context());
    assert.equal(first.status, 200);
    assert.equal(await first.text(), validTaxonomy);

    now += 5_001;
    const recovered = await worker.fetch(new Request("https://popekyrillos.store/category-taxonomy.js"), env, context());
    assert.equal(recovered.status, 200);
    assert.equal(await recovered.text(), validTaxonomy);
    assert.match(recovered.headers.get("CDN-Cache-Control") || "", /stale-if-error=86400/);
    assert.equal(requests, 2);
  } finally {
    Date.now = originalNow;
  }
});

test("concurrent taxonomy requests share one asset refresh", async () => {
  const worker = await freshWorker();
  let requests = 0;
  const env = {
    ASSETS: {
      async fetch() {
        requests += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(validTaxonomy, { status: 200 });
      }
    }
  };
  const request = () => worker.fetch(new Request("https://popekyrillos.store/category-taxonomy.js"), env, context());
  const responses = await Promise.all([request(), request(), request(), request()]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200]);
  assert.equal(requests, 1);
});

test("taxonomy endpoint serves the latest Admin-published GitHub source before deployed assets", async () => {
  const worker = await freshWorker();
  const publishedTaxonomy = "window.POPE_KYRILLOS_TAXONOMY={categories:[{id:'crosses',subcategories:[{id:'processional-crosses',name:'صلبان الزفة'}]}]};";
  let assetRequests = 0;
  let publishedRequest = null;
  const originalFetch = global.fetch;
  global.fetch = async (request, options) => {
    const url = String(request);
    if (url.includes("api.github.com/") && url.includes("category-taxonomy.js")) {
      publishedRequest = { url, options };
      return new Response(publishedTaxonomy, { status: 200, headers: { ETag: '"published-taxonomy"' } });
    }
    return originalFetch(request);
  };
  const env = {
    GITHUB_TOKEN: "test-token",
    ASSETS: { async fetch() { assetRequests += 1; return new Response(validTaxonomy); } }
  };

  try {
    const response = await worker.fetch(new Request("https://popekyrillos.store/category-taxonomy.js"), env, context());
    assert.equal(response.status, 200);
    assert.equal(await response.text(), publishedTaxonomy);
    assert.equal(assetRequests, 0);
    assert.match(publishedRequest?.url || "", /[?&]fresh=\d+/);
    assert.equal(publishedRequest?.options?.cache, "no-store");
    assert.equal(publishedRequest?.options?.headers?.["Cache-Control"], "no-cache");
  } finally {
    global.fetch = originalFetch;
  }
});

test("taxonomy version endpoint is authoritative and cannot be cached by browser or CDN", async () => {
  const worker = await freshWorker();
  const env = { ASSETS: { async fetch() { return new Response(validTaxonomy, { headers: { ETag: '"taxonomy-sha"' } }); } } };
  const response = await worker.fetch(new Request("https://popekyrillos.store/category-taxonomy-version.json"), env, context());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { version: '"taxonomy-sha"', contentVersion: "12345" });
});
