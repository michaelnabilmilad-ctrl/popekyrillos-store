const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "cart.html",
  "checkout.html",
  "payment.html",
  "order-success.html",
  "styles.min.css",
  "styles.css",
  "checkout-flow.min.js",
  "checkout-flow.js",
  "script.min.js",
  "script.js",
  "product-page.css",
  "product-page.js",
  "product-page-wood-v1.js",
  "yota-colors.js",
  "coloringDesigns.js",
  "firebase-config.min.js",
  "firebase-config.js",
  "category-taxonomy.js",
  "subcategory-image-policy.js",
  "products.json",
  "thumbnail-manifest.json",
  "thumbnail-manifest-v2.json",
  "sitemap.xml",
  "robots.txt",
  "policies.html",
  "admin.html",
  "admin-orders.html",
  "admin-analytics.html",
  "admin.css",
  "admin.js",
  "admin-orders.js",
  "admin-analytics.js",
  "analytics-config.js",
  "analytics.js",
  "coloring-game.html",
  "coloring-game.css",
  "coloring-game.js",
  "payment-success.html",
  "payment-failed.html",
  "payment-pending.html",
  "CNAME",
  ".nojekyll",
  "_headers",
  "_redirects",
];

const directories = ["assets", "coloring"];

function remove(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(dist, relativePath);

  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyFileAs(sourceRelativePath, targetRelativePath, transform = (content) => content) {
  const source = path.join(root, sourceRelativePath);
  const target = path.join(dist, targetRelativePath);

  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (transform === null) {
    fs.copyFileSync(source, target);
    return;
  }

  fs.writeFileSync(target, transform(fs.readFileSync(source, "utf8")));
}

function copyDirectory(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(dist, relativePath);

  if (!fs.existsSync(source)) {
    return;
  }

  fs.cpSync(source, target, { recursive: true });
}

remove(dist);
fs.mkdirSync(dist, { recursive: true });

files.forEach(copyFile);
directories.forEach(copyDirectory);
copyFileAs("public/favicon.png", "favicon.png", null);
copyFileAs("admin.html", "admin/index.html", (content) =>
  content.replace('href="index.html"', 'href="/"')
);
copyFileAs("admin-orders.html", "admin/orders/index.html", null);
copyFileAs("admin-analytics.html", "admin/analytics/index.html", null);
copyFileAs("admin.css", "admin/admin.css", null);
copyFileAs("admin.js", "admin/admin.js", null);
copyFileAs("admin-orders.js", "admin/admin-orders.js", null);
copyFileAs("admin-analytics.js", "admin/admin-analytics.js", null);
copyFileAs("category-taxonomy.js", "admin/category-taxonomy.js", null);
copyFileAs("coloring-game.html", "coloring-game/index.html", null);

console.log(`Cloudflare build ready: ${path.relative(root, dist)}`);
