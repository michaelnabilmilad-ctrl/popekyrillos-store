const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname.startsWith("/category/")) pathname = "/index.html";
  else if (pathname === "/cart") pathname = "/cart.html";
  else if (pathname === "/checkout") pathname = "/checkout.html";
  else if (pathname.startsWith("/products/")) pathname = "/index.html";
  const filename = path.resolve(root, `.${pathname}`);
  if (!filename.startsWith(root)) return response.writeHead(403).end();
  fs.readFile(filename, (error, body) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  });
}).listen(8788, "127.0.0.1");
