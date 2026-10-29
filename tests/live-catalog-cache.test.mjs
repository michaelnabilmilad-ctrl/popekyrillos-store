// Live catalog cache (functions/_live-data.js) through the real Worker: versions are
// git blob SHAs (GitHub's ETag), pages reuse the cached copy, the admin's publish is
// served at once, and checkout never prices from a copy GitHub did not just confirm.
// Fake GitHub, fake Airtable and an in-memory edge cache only.
// LIVE_CATALOG_DIR=<folder with products.json and category-taxonomy.js> runs it on a
// snapshot of the real catalog; otherwise the repository's copies are used.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { adminJsonPost, createAdminEnv, fakeGitHub, SITE } from "./helpers/fake-github.mjs";
import { airtableFixture } from "./helpers/customer-order-fixture.mjs";
import { LIVE_DATA_POLICY, gitBlobSha, resetLiveDataMemory } from "../functions/_live-data.js";
import { validateCartItems } from "../functions/_paymob-utils.js";

const edge = new Map();
globalThis.caches = {
  default: {
    // Like Cloudflare on popekyrillos.store: a cached copy comes back with the zone's
    // Browser Cache TTL (4 h) in Cache-Control and CF-Cache-Status: HIT.
    async match(request) {
      const hit = edge.get(request.url);
      if (!hit) return undefined;
      const headers = new Headers(hit.headers);
      headers.set("Cache-Control", "public, max-age=14400, must-revalidate");
      headers.set("CF-Cache-Status", "HIT");
      return new Response(hit.body, { headers });
    },
    async put(request, response) {
      edge.set(request.url, { body: await response.text(), headers: [...response.headers] });
    }
  }
};

const worker = (await import(`../cloudflare-worker.js?live-catalog=${Date.now()}`)).default;
const dataDir = process.env.LIVE_CATALOG_DIR || ".";
// One plain product (no options) appended to the live catalog so price/stock checks have a fixed target.
const probeProduct = { id: "cache-probe-product", sku: "CACHE-PROBE", name: "منتج فحص الكاش", price: 250, stock: "متاح", mainCategory: "crosses", subcategory: "", images: ["assets/optimized/products/communion-set.webp"], variants: [] };
const seedProducts = `${JSON.stringify([...JSON.parse(fs.readFileSync(path.join(dataDir, "products.json"), "utf8")), probeProduct], null, 2)}
`;
const seedTaxonomy = fs.readFileSync(path.join(dataDir, "category-taxonomy.js"), "utf8");
const deployedProducts = fs.readFileSync("products.json", "utf8");
const deployedTaxonomy = fs.readFileSync("category-taxonomy.js", "utf8");

function gitBlob(text) {
  const body = Buffer.from(text, "utf8");
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
}

// The admin env plus Airtable/D1 for orders, a deployed products.json that differs
// from the live one, and a GitHub that behaves like the real contents API:
// ETag = git blob SHA, 304 for If-None-Match, optional delay, outage and lag.
function lab(t, { products = seedProducts, taxonomy = seedTaxonomy } = {}) {
  resetLiveDataMemory();
  edge.clear();
  const admin = createAdminEnv();
  const orders = airtableFixture();
  const env = {
    ...admin, ...orders.env,
    ASSETS: {
      async fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/products.json") return new Response(deployedProducts, { headers: { ETag: '"deployed-copy"' } });
        if (pathname === "/category-taxonomy.js") return new Response(deployedTaxonomy);
        if (pathname === "/thumbnail-manifest-v2.json") return Response.json({});
        if (pathname === "/" || pathname === "/index.html") return new Response("<html><head><title>x</title></head><body><section id=\"services\"></section></body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
        return new Response("not found", { status: 404 });
      }
    }
  };
  const github = fakeGitHub(admin, { "products.json": products, "category-taxonomy.js": taxonomy });
  const stats = { checks: 0, downloads: 0, notModified: 0, raw: 0, byFile: {} };
  const control = { down: false, rawDown: false, delayMs: 0, lagOnce: null };
  const contentsHandler = async (request) => {
    const url = new URL(request.url);
    const file = decodeURIComponent(url.pathname.split("/contents/")[1] || "");
    const raw = (request.headers.get("Accept") || "").includes("raw");
    if (request.method !== "GET" || !raw) return github.handler(request);
    stats.checks += 1;
    stats.byFile[file] = (stats.byFile[file] || 0) + 1;
    if (control.delayMs) await new Promise((resolve) => setTimeout(resolve, control.delayMs));
    if (control.down) return Response.json({ message: "simulated outage" }, { status: 503 });
    let text = github.text(file);
    if (control.lagOnce?.file === file) { text = control.lagOnce.text; control.lagOnce = null; }
    const etag = `"${gitBlob(text)}"`;
    if (request.headers.get("If-None-Match") === etag) { stats.notModified += 1; return new Response(null, { status: 304, headers: { ETag: etag } }); }
    stats.downloads += 1;
    return new Response(text, { headers: { ETag: etag } });
  };
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const { hostname, pathname } = new URL(request.url);
    if (hostname === "raw.githubusercontent.com") {
      stats.raw += 1;
      if (control.rawDown) return new Response("down", { status: 503 });
      return github.handler(request);
    }
    if (hostname === "api.github.com") return pathname.includes("/contents/") ? contentsHandler(request) : github.handler(request);
    return orders.fetch(request.url, { method: request.method, body: request.method === "GET" ? undefined : await request.text() });
  });
  const pending = [];
  const ctx = { waitUntil: (promise) => pending.push(promise) };
  const call = (pathAndQuery, init) => worker.fetch(new Request(`${SITE}${pathAndQuery}`, init), env, ctx);
  const json = async (pathAndQuery) => (await call(pathAndQuery)).json();
  const settle = async () => { while (pending.length) await pending.shift(); };
  const publishProducts = async (edit) => {
    const next = edit(github.products());
    const response = await worker.fetch(adminJsonPost(env, "/admin/api/update-products", { products: next }), env, ctx);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const order = (lines, total) => call("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE, "X-Request-Id": `live-${crypto.randomUUID()}`, "CF-Connecting-IP": "192.0.2.44" },
    body: JSON.stringify({ requestId: `live-${crypto.randomUUID()}`, customerName: "عميل تجريبي", phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, address: "القاهرة", paymentMethod: "Cash", deliveryType: "Pickup", products: lines, total })
  });
  return { env, github, stats, control, call, json, settle, publishProducts, order, orders, ctx };
}

const clock = (t) => {
  let offset = 0;
  const realNow = Date.now.bind(Date);
  t.mock.method(Date, "now", () => realNow() + offset);
  return { advance(ms) { offset += ms; } };
};

const simpleProduct = (products) => products.find((product) => product.id === probeProduct.id);

test("GitHub's ETag for a file is its git blob SHA, and the Worker computes the same value", async () => {
  assert.equal(await gitBlobSha(seedProducts), gitBlob(seedProducts));
  assert.equal(await gitBlobSha("سلام\n"), gitBlob("سلام\n"));
});

test("the full live catalog is served, and repeat page loads do not contact GitHub", async (t) => {
  const l = lab(t);
  const live = JSON.parse(seedProducts);
  const all = await l.json("/products.json");
  assert.equal(all.length, live.length);
  const first = await l.json("/api/catalog?limit=48");
  assert.ok(first.total > 0);
  const checksAfterFirst = l.stats.checks;
  for (let index = 0; index < 20; index += 1) await l.json(`/api/catalog?limit=12&page=${(index % 3) + 1}`);
  await l.call("/");
  assert.equal(l.stats.checks, checksAfterFirst, "within the fresh window no GitHub request at all");
  assert.equal(l.stats.downloads, 2, "products.json and category-taxonomy.js downloaded once each");
});

test("concurrent requests on a cold isolate share one download per file", async (t) => {
  const l = lab(t);
  l.control.delayMs = 50;
  const responses = await Promise.all(Array.from({ length: 25 }, (_, index) => l.call(index % 2 ? "/api/catalog?limit=8" : "/products.json")));
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(l.stats.byFile["products.json"], 1);
  assert.equal(l.stats.downloads, 2);
});

test("after the fresh window a background check answers 304 and nothing is downloaded again", async (t) => {
  const l = lab(t);
  const time = clock(t);
  await l.json("/api/catalog?limit=8");
  await l.settle();
  const downloads = l.stats.downloads;
  time.advance(LIVE_DATA_POLICY.freshMs + 1000);
  await l.json("/api/catalog?limit=8");
  await l.settle();
  assert.ok(l.stats.notModified >= 1);
  assert.equal(l.stats.downloads, downloads);
});

test("a new product published from the admin is visible at once everywhere, and confirmed later with a 304", async (t) => {
  const l = lab(t);
  await l.json("/api/catalog?limit=8");
  const template = simpleProduct(l.github.products());
  const fresh = { ...template, id: "live-cache-test-product", name: "منتج اختبار الكاش الجديد", slug: "live-cache-test-product", price: 4321 };
  await l.publishProducts((products) => [...products, fresh]);
  const catalog = await l.json(`/api/catalog?limit=48&search=${encodeURIComponent("اختبار الكاش")}`);
  assert.equal(catalog.items.find((item) => item.id === "live-cache-test-product")?.price, 4321);
  assert.ok((await l.json("/products.json")).some((product) => product.id === "live-cache-test-product"));
  assert.equal((await l.json("/api/products/live-cache-test-product")).price, 4321);
  const page = await l.call("/products/live-cache-test-product");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /منتج اختبار الكاش الجديد/);
  // Another isolate in the same data center (empty memory, shared edge cache).
  resetLiveDataMemory();
  assert.ok((await l.json("/products.json")).some((product) => product.id === "live-cache-test-product"));
  // The next GitHub check confirms the published version without a download.
  const downloads = l.stats.downloads;
  await l.json("/products.json?admin=1");
  assert.equal(l.stats.downloads, downloads, "published content hashed exactly like the commit");
});

test("price and stock updates show at once, and checkout always prices from GitHub", async (t) => {
  const l = lab(t);
  const product = simpleProduct(l.github.products());
  const line = (price) => [{ productId: product.id, sku: product.sku || "", name: product.name, quantity: 1, price, lineTotal: price }];
  assert.equal((await l.order(line(product.price), product.price)).status, 200);

  await l.publishProducts((products) => products.map((item) => item.id === product.id ? { ...item, price: product.price + 500 } : item));
  assert.equal((await l.json(`/api/products/${encodeURIComponent(product.id)}`)).price, product.price + 500);
  const stale = await l.order(line(product.price), product.price);
  assert.equal(stale.status, 409, "the old price is refused");
  assert.equal((await stale.json()).error, "price_changed");
  assert.equal((await l.order(line(product.price + 500), product.price + 500)).status, 200);

  await l.publishProducts((products) => products.map((item) => item.id === product.id ? { ...item, stock: "غير متاح حاليا" } : item));
  // Sold-out products leave the catalog listing at once (existing rule) and the product shows it.
  assert.equal((await l.json(`/api/catalog?limit=48&search=${encodeURIComponent(product.name)}`)).items.find((item) => item.id === product.id), undefined);
  assert.equal((await l.json(`/api/products/${encodeURIComponent(product.id)}`)).stock, "غير متاح حاليا");
  const soldOut = await l.order(line(product.price + 500), product.price + 500);
  assert.equal(soldOut.status, 409);
  assert.equal((await soldOut.json()).error, "cart_changed");
});

test("an edit made on GitHub directly is seen within the fresh window plus one check", async (t) => {
  const l = lab(t);
  const time = clock(t);
  const product = simpleProduct(l.github.products());
  await l.json("/products.json");
  // A commit that did not go through this Worker (another data center, or GitHub itself).
  const changed = JSON.stringify(l.github.products().map((item) => item.id === product.id ? { ...item, price: 7777 } : item), null, 2) + "\n";
  l.github.repo.trees.get(l.github.repo.commits.get(l.github.repo.head).tree.sha).set("products.json", Buffer.from(changed).toString("base64"));
  const priceOf = async () => (await l.json("/products.json")).find((item) => item.id === product.id).price;
  assert.equal(await priceOf(), product.price, "inside the fresh window the checked copy is used");
  time.advance(LIVE_DATA_POLICY.freshMs + 1000);
  await priceOf();
  await l.settle();
  assert.equal(await priceOf(), 7777, "the background check picked it up");
  // A long-idle data center checks before answering.
  const other = lab(t, { products: changed });
  await other.json("/products.json");
  const next = JSON.stringify(other.github.products().map((item) => item.id === product.id ? { ...item, price: 8888 } : item), null, 2) + "\n";
  other.github.repo.trees.get(other.github.repo.commits.get(other.github.repo.head).tree.sha).set("products.json", Buffer.from(next).toString("base64"));
  time.advance(LIVE_DATA_POLICY.revalidateMs + 1000);
  assert.equal((await other.json("/products.json")).find((item) => item.id === product.id).price, 8888);
});

test("category changes published from the admin apply at once", async (t) => {
  const l = lab(t);
  const before = await l.json("/api/catalog?limit=1");
  const taxonomy = l.github.text("category-taxonomy.js");
  const version = /CURRENT_TAXONOMY_VERSION\s*=\s*(\d+)/.exec(taxonomy)?.[1] || "";
  const marker = `${taxonomy.trim()}\n// published-by-test ${Date.now()}`;
  const categories = before && JSON.parse(taxonomy.slice(taxonomy.indexOf("[", taxonomy.indexOf("defaultCategories =")), taxonomy.indexOf("];", taxonomy.indexOf("defaultCategories =")) + 1));
  const response = await worker.fetch(adminJsonPost(l.env, "/admin/api/update-taxonomy", { categories, taxonomySource: marker, baseVersion: version }), l.env, l.ctx);
  assert.equal(response.status, 200, await response.clone().text());
  const served = await (await l.call(`/category-taxonomy.js?verify=${Date.now()}`)).text();
  assert.ok(served.includes("published-by-test"));
  assert.ok((await (await l.call("/category-taxonomy.js")).text()).includes("published-by-test"));
});

test("GitHub briefly returning the pre-publish version does not undo a publish", async (t) => {
  const l = lab(t);
  const time = clock(t);
  const product = simpleProduct(l.github.products());
  const oldText = l.github.text("products.json");
  await l.json("/products.json");
  await l.publishProducts((products) => products.map((item) => item.id === product.id ? { ...item, price: 999 } : item));
  l.control.lagOnce = { file: "products.json", text: oldText };
  time.advance(LIVE_DATA_POLICY.freshMs + 1000);
  await l.json("/products.json");
  await l.settle();
  assert.equal((await l.json("/products.json")).find((item) => item.id === product.id).price, 999);
});

test("GitHub outage: pages keep the last good live copy, checkout and card payment refuse", async (t) => {
  const l = lab(t);
  const time = clock(t);
  const live = JSON.parse(seedProducts);
  await l.json("/products.json");
  l.control.down = true;
  time.advance(LIVE_DATA_POLICY.revalidateMs + 1000);
  const started = performance.now();
  const during = await l.json("/products.json");
  assert.equal(during.length, live.length, "last good live copy, not the deployed products.json");
  assert.ok(performance.now() - started < LIVE_DATA_POLICY.blockingTimeoutMs + 1000);
  assert.ok((await l.json("/api/catalog?limit=8")).items.length > 0);

  const product = simpleProduct(l.github.products());
  const response = await l.order([{ productId: product.id, sku: product.sku || "", name: product.name, quantity: 1, price: product.price, lineTotal: product.price }], product.price);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "catalog_unavailable");
  assert.equal(l.orders.orders.size, 0, "no order was written");

  await assert.rejects(
    validateCartItems({ request: new Request(`${SITE}/api/create-paymob-intention`), env: l.env, loadFreshCatalog: () => Promise.reject(new Error("GitHub down")) }, [{ productId: product.id, qty: 1 }]),
    (error) => error.statusCode === 503
  );

  // A slow (hanging) GitHub delays a long-idle page by at most the blocking timeout.
  l.control.down = false;
  l.control.delayMs = 5000;
  time.advance(LIVE_DATA_POLICY.revalidateMs + 1000);
  const slowStart = performance.now();
  assert.equal((await l.json("/products.json")).length, live.length);
  assert.ok(performance.now() - slowStart < LIVE_DATA_POLICY.blockingTimeoutMs + 1000);
});

test("card payment goes through the Worker's strict catalog check, never the deployed products.json", async (t) => {
  const l = lab(t);
  const product = simpleProduct(l.github.products());
  // A product only the live catalog has: the deployed products.json does not know it.
  const fresh = { ...product, id: "live-only-card-product", name: "منتج دفع بالكارت", price: 1234 };
  await l.publishProducts((products) => [...products, fresh]);
  const env = { ...l.env, PAYMOB_SECRET_KEY: "sk_test_fake_for_local_tests", PAYMOB_PUBLIC_KEY: "pk_test_fake", PAYMOB_INTEGRATION_IDS: "1" };
  const pay = () => worker.fetch(new Request(`${SITE}/api/create-paymob-intention`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: SITE },
    body: JSON.stringify({ items: [{ productId: fresh.id, qty: 2 }], customer: { name: "عميل تجريبي", phone: "01012345678", email: "test@example.com", address: "القاهرة", city: "القاهرة" } })
  }), env, l.ctx);
  const checks = l.stats.checks;
  const accepted = await pay();
  const body = await accepted.json();
  assert.ok(l.stats.checks > checks, "GitHub was asked before pricing the card payment");
  assert.ok(!/غير موجود في الكتالوج/.test(body.error || ""), `the live-only product is priced: ${JSON.stringify(body)}`);
  l.control.down = true;
  const refused = await pay();
  assert.equal(refused.status, 503);
  assert.match((await refused.json()).error, /تعذر التحقق من الأسعار/);
});

test("no cached copy and no API: raw GitHub, then the deployed file, keep pages up", async (t) => {
  const l = lab(t);
  l.control.down = true;
  const viaRaw = await l.json("/products.json");
  assert.equal(viaRaw.length, JSON.parse(seedProducts).length);
  assert.ok(l.stats.raw >= 1);
  const m = lab(t);
  m.control.down = true;
  m.control.rawDown = true;
  const deployed = await m.json("/products.json");
  assert.equal(deployed.length, JSON.parse(deployedProducts).length);
});

test("a catalog listing served from the edge cache is never kept by browsers for hours", async (t) => {
  const l = lab(t);
  const first = await l.call("/api/catalog?page=1&limit=8&v=14");
  await first.text();
  await l.settle();
  const second = await l.call("/api/catalog?page=1&limit=8&v=14");
  assert.equal(second.headers.get("CF-Cache-Status"), "HIT", "served from the edge cache");
  assert.equal(second.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
  assert.equal(first.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
  assert.deepEqual(await second.json(), await (await l.call("/api/catalog?page=1&limit=8&v=14")).json());
});

test("best sellers follow the catalog version and are not kept by browsers for hours", async (t) => {
  const l = lab(t);
  const product = simpleProduct(l.github.products());
  const keys = () => [...edge.keys()].filter((key) => key.includes("/api/best-sellers"));
  const first = await l.call("/api/best-sellers");
  assert.equal(first.status, 200);
  await l.settle();
  const hit = await l.call("/api/best-sellers");
  assert.equal(hit.headers.get("CF-Cache-Status"), "HIT");
  assert.equal(hit.headers.get("Cache-Control"), "public, max-age=60, s-maxage=720, stale-while-revalidate=60");
  assert.equal(keys().length, 1);
  assert.match(keys()[0], /[?&]catalog=[0-9a-f]{40}/);
  await l.publishProducts((products) => products.map((item) => item.id === product.id ? { ...item, price: item.price + 1 } : item));
  const after = await l.call("/api/best-sellers");
  assert.notEqual(after.headers.get("CF-Cache-Status"), "HIT", "a publish starts a new best-sellers entry");
  await l.settle();
  assert.equal(keys().length, 2, "one entry per catalog version");
});

test("category counts, price bounds and search follow every publish (no stale memoized data)", async (t) => {
  const l = lab(t);
  const probe = simpleProduct(l.github.products());
  const listing = async () => (await l.call(`/api/catalog?page=1&limit=48&v=14&category=crosses&x=${crypto.randomUUID()}`)).json();
  const search = async (term) => (await l.call(`/api/catalog?page=1&limit=48&v=14&search=${encodeURIComponent(term)}&x=${crypto.randomUUID()}`)).json();
  const before = await listing();
  assert.ok((await search("فحص الكاش")).items.some((item) => item.id === probe.id));

  // Price outside every current bound: the slider bounds and the item follow at once.
  const top = before.priceBounds.max + 100000;
  await l.publishProducts((products) => products.map((item) => item.id === probe.id ? { ...item, price: top } : item));
  const priced = await listing();
  assert.equal(priced.priceBounds.max, top);
  assert.equal((await search("فحص الكاش")).items.find((item) => item.id === probe.id)?.price, top);

  // Sold out: it leaves the counts and the search results at once.
  await l.publishProducts((products) => products.map((item) => item.id === probe.id ? { ...item, stock: "غير متاح حاليا" } : item));
  const soldOut = await listing();
  assert.equal(soldOut.categoryCounts.crosses, before.categoryCounts.crosses - 1);
  assert.ok(!(await search("فحص الكاش")).items.some((item) => item.id === probe.id));

  // Renamed: search finds the new name, not the old one.
  await l.publishProducts((products) => products.map((item) => item.id === probe.id ? { ...item, stock: "متاح", name: "منتج مراجعة البحث" } : item));
  assert.ok((await search("مراجعة البحث")).items.some((item) => item.id === probe.id));
  assert.ok(!(await search("فحص الكاش")).items.some((item) => item.id === probe.id));
});

test("a fresh isolate reuses the shared search text with identical results, and ignores a mismatched copy", async (t) => {
  const l = lab(t);
  const query = (n) => `/api/catalog?page=1&limit=48&v=14&search=${encodeURIComponent("صليب صدر")}&n=${n}`;
  const built = await (await l.call(query("a"))).json();
  await l.settle();
  const sharedKey = [...edge.keys()].find((key) => key.includes("/search-text-1/"));
  assert.ok(sharedKey, "the first isolate shared its search text");

  // A second isolate: new Worker module instance, empty memory, same edge cache.
  const other = (await import(`../cloudflare-worker.js?live-catalog-second=${Date.now()}`)).default;
  resetLiveDataMemory();
  const call = (path) => other.fetch(new Request(`${SITE}${path}`), l.env, l.ctx);
  assert.deepEqual(await (await call(query("b"))).json(), built);

  // A copy that does not match the catalog (here: ids in another order) is ignored.
  const third = (await import(`../cloudflare-worker.js?live-catalog-third=${Date.now()}`)).default;
  resetLiveDataMemory();
  const stored = JSON.parse(edge.get(sharedKey).body);
  stored.ids.reverse();
  stored.texts = stored.texts.map(() => ["", []]);
  edge.set(sharedKey, { ...edge.get(sharedKey), body: JSON.stringify(stored) });
  const response = await third.fetch(new Request(`${SITE}${query("c")}`), l.env, l.ctx);
  assert.deepEqual(await response.json(), built);
});
