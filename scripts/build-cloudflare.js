const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "cart.html",
  "checkout.html",
  "payment.html",
  "styles.min.css",
  "styles.css",
  "checkout-flow.min.js",
  "checkout-flow.js",
  "script.min.js",
  "script.js",
  "firebase-config.min.js",
  "firebase-config.js",
  "products.json",
  "policies.html",
  "admin.html",
  "admin.css",
  "admin.js",
  "payment-success.html",
  "payment-failed.html",
  "payment-pending.html",
  "CNAME",
  ".nojekyll",
  "_headers",
  "_redirects",
];

const directories = ["assets"];

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
copyFileAs("admin.html", "admin/index.html", (content) =>
  content.replace('href="index.html"', 'href="/"')
);
copyFileAs("admin.css", "admin/admin.css", null);
copyFileAs("admin.js", "admin/admin.js", null);

console.log(`Cloudflare build ready: ${path.relative(root, dist)}`);
