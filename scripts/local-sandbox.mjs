// Local, offline sandbox of the whole store: the real Worker (cloudflare-worker.js) serves
// the pages and APIs from this folder, with an in-memory GitHub (products-data branch) and an
// in-memory Airtable. Nothing reaches GitHub, Airtable, Paymob, Bosta or Firebase.
//
//   node scripts/local-sandbox.mjs --data <folder with products.json, category-taxonomy.js> [--port 8790]
//   Admin: http://localhost:8790/admin  (user "local", password "local")
//   State:  GET /__sandbox/state  (orders, order lines and catalog as the Worker wrote them)
//
// Optional: --coptic-font <path to a local CS New Athanasius .ttf> serves it at
// /__sandbox/coptic-legacy.ttf for local tests only (never part of the site).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fakeGitHub, BRANCH } from "../tests/helpers/fake-github.mjs";
import { airtableFixture } from "../tests/helpers/customer-order-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => (value.startsWith("--") ? [...pairs, [value.slice(2), list[index + 1]]] : pairs), []));
const port = Number(args.port || 8790);
const dataDir = path.resolve(args.data || root);
const assetsRoot = fs.existsSync(path.join(root, "dist", "admin", "index.html")) ? path.join(root, "dist") : root;
const copticFont = args["coptic-font"] ? path.resolve(args["coptic-font"]) : "";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

const env = {
  ADMIN_USERNAME: "local",
  ADMIN_PASSWORD: "local",
  GITHUB_TOKEN: "fake-token-for-local-sandbox",
  GITHUB_OWNER: "local-owner",
  GITHUB_REPO: "local-repo",
  LOCAL_DEV: "1",
  SITE_URL: "https://popekyrillos.store",
  ASSETS: {
    async fetch(request) {
      let { pathname } = new URL(request.url);
      pathname = decodeURIComponent(pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      // Like production: the built "dist" folder (node scripts/build-cloudflare.js), else this folder.
      const relative = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      const inDist = path.join(assetsRoot, relative);
      const file = fs.existsSync(inDist) && !fs.statSync(inDist).isDirectory() ? inDist : path.join(root, relative);
      if (!(file.startsWith(root)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        const html = `${file}.html`;
        if (fs.existsSync(html)) return new Response(fs.readFileSync(html), { headers: { "Content-Type": TYPES[".html"] } });
        return new Response("Not found", { status: 404 });
      }
      return new Response(fs.readFileSync(file), { headers: { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" } });
    }
  }
};

const seed = {};
for (const name of ["products.json", "category-taxonomy.js", "thumbnail-manifest.json", "thumbnail-manifest-v2.json"]) {
  const file = path.join(dataDir, name);
  if (fs.existsSync(file)) seed[name] = fs.readFileSync(file, "utf8");
}
if (!seed["products.json"]) throw new Error(`products.json not found in ${dataDir}`);
const github = fakeGitHub(env, seed);
const airtable = airtableFixture();
Object.assign(env, { AIRTABLE_TOKEN: airtable.env.AIRTABLE_TOKEN, AIRTABLE_BASE_ID: airtable.env.AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME: "Orders", ANALYTICS_DB: airtable.env.ANALYTICS_DB });
airtable.orders.clear();
Object.defineProperty(airtable, "catalog", { get: () => github.products() });

const blocked = [];
// The in-memory GitHub keeps text only, so photos uploaded in admin are also kept here as bytes
// and served from this map (the real upload commits the WebP file to products-data).
const uploads = new Map();
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === "api.airtable.com") {
    // The admin orders list (no filter): newest first, like the real Orders view.
    if (/\/Orders$/.test(decodeURIComponent(url.pathname)) && (!init?.method || init.method === "GET") && !url.searchParams.get("filterByFormula")) {
      return Response.json({ records: [...airtable.orders.values()].sort((a, b) => b.fields["Order ID"] - a.fields["Order ID"]) });
    }
    return airtable.fetch(url.toString(), init);
  }
  if (url.hostname === "api.github.com" || url.hostname === "raw.githubusercontent.com") {
    try { return await github.handler(input, init); } catch (error) { blocked.push(`${url.href} (${error.message})`); return new Response("Not Found", { status: 404 }); }
  }
  blocked.push(url.href);
  return new Response(JSON.stringify({ error: "blocked_by_local_sandbox" }), { status: 503 });
};

const { default: worker } = await import("../cloudflare-worker.js");

function sandboxState() {
  const products = github.products();
  return {
    orders: [...airtable.orders.values()].map((order) => ({ id: order.id, ...order.fields })),
    orderLines: airtable.details.map((row) => ({ order: row.fields["رقم الأوردر"]?.[0], quantity: row.fields["الكمية"], unitPrice: row.fields["سعر القطعة"], notes: row.fields["ملاحظات"] || "" })),
    engravingProducts: products.filter((p) => p.engraving).map((p) => ({ id: p.id, images: p.images, image: p.image, engraving: p.engraving })),
    dataCommits: github.commitCount(),
    blockedRequests: blocked
  };
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === "/__sandbox/state") {
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" });
      res.end(JSON.stringify(sandboxState(), null, 2));
      return;
    }
    if (url.pathname === "/__sandbox/coptic-legacy.ttf" && copticFont) {
      res.writeHead(200, { "Content-Type": TYPES[".ttf"] });
      res.end(fs.readFileSync(copticFont));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
    // The order endpoint only accepts the shop's own origin; the sandbox page is that shop.
    if (url.pathname.startsWith("/api/") && headers.get("origin") === url.origin) headers.set("origin", "https://popekyrillos.store");
    const uploaded = uploads.get(url.pathname.replace(/^\//, "").replace(/^assets\/detail\//, "assets/optimized/"));
    if (uploaded && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "no-store" });
      res.end(uploaded);
      return;
    }
    const request = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const pending = [];
    let response = await worker.fetch(request, env, { waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})), passThroughOnException() {} });
    // Local copy of CS New Athanasius for tests: tell the engraving script where it is.
    if (copticFont && (response.headers.get("Content-Type") || "").includes("text/html")) {
      const html = (await response.text()).replace("<head>", `<head><script>window.CROSS_ENGRAVING_COPTIC_LEGACY_FONT_URL="/__sandbox/coptic-legacy.ttf"</script>`);
      const headersOut = new Headers(response.headers);
      headersOut.delete("Content-Length");
      headersOut.delete("Content-Security-Policy");
      response = new Response(html, { status: response.status, headers: headersOut });
    }
    if (url.pathname === "/admin/api/upload-product-image" && response.ok) {
      const result = await response.clone().json().catch(() => ({}));
      const sent = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (result.path && sent.imageBase64) uploads.set(result.path, Buffer.from(String(sent.imageBase64).replace(/^data:image\/webp;base64,/, ""), "base64"));
    }
    const out = {};
    response.headers.forEach((value, key) => { out[key] = value; });
    delete out["content-encoding"];
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
    await Promise.all(pending);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(error?.stack || error));
  }
}).listen(port, () => console.log(`Local sandbox on http://localhost:${port} (data from ${dataDir}, branch ${BRANCH})`));
