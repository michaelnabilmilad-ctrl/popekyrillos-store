// Local-only preview with synthetic customers and an in-memory database.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { airtableFixture } from "../tests/helpers/customer-order-fixture.mjs";
import { handleRequest } from "../cloudflare-worker.js";
import { ensureOrderAccess } from "../functions/_customer-orders.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = airtableFixture();
const order = fixture.record("قيد التجهيز", { "Customer Name": "مريم — طلب تجريبي", Notes: "العنوان: القاهرة، شارع المكتبة، مبنى ١٢ | برجاء الاتصال قبل الوصول", Products: "تسبحة نصف الليل السنوي – كنيسة العذراء | SKU: BOOK-1 | الكمية: 1 | السعر النهائي: 120 ج.م | الإجمالي: 120 ج.م" });
fixture.addDetail(order);
globalThis.fetch = fixture.fetch;
const access = await ensureOrderAccess(fixture.env, order.id);
const allowed = new Set(["track-order.html", "order.html", "order-success.html", "customer-orders.css", "customer-orders.js", "styles.min.css", "assets/fonts/ge-ss-two-bold.woff2"]);
fixture.env.ASSETS = { async fetch(request) {
  let name = new URL(request.url).pathname.slice(1);
  if (["track-order", "order", "order-success"].includes(name)) name += ".html";
  if (!allowed.has(name)) return new Response("Not found", { status: 404 });
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2" };
  return new Response(await fs.readFile(path.join(root, name)), { headers: { "Content-Type": types[path.extname(name)] || "application/octet-stream" } });
} };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1:8788${req.url}`, { method: req.method, headers: req.headers, ...(["GET", "HEAD"].includes(req.method) ? {} : { body }) });
    const response = await handleRequest(request, fixture.env, { waitUntil() {} });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end("Preview error"); }
});
server.listen(8788, "127.0.0.1", () => console.log(JSON.stringify({ lookup: "http://127.0.0.1:8788/track-order", order: `http://127.0.0.1:8788/order/${access.token}`, orderNumber: 1, phone: "01012345678" })));
