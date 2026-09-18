const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const terser = require("terser");

const root = path.resolve(__dirname, "..");

const cacheableAssets = [
  "admin.css",
  "admin.js",
  "admin-orders.js",
  "admin-analytics.js",
  "analytics.js",
  "analytics-config.js",
  "checkout-flow.min.js",
  "styles.min.css",
  "script.min.js",
  "product-page.css",
  "product-page.js",
  "product-page-wood-v1.js",
  "yota-colors.js",
  "coloringDesigns.js",
  "category-migration.js",
  "category-taxonomy.js",
  "subcategory-image-policy.js"
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}

async function minifyFile(sourcePath, targetPath) {
  const source = read(sourcePath);
  const result = await terser.minify(source, {
    compress: true,
    mangle: true
  });

  if (result.error) throw result.error;
  if (!result.code) throw new Error(`Terser did not produce ${targetPath} content.`);
  write(targetPath, `${result.code}\n`);
}

async function minifyScripts() {
  // Keep the storefront taxonomy and its consumer in one versioned artifact.
  // Loading them as two independent scripts allowed a transient/cache failure
  // to leave products usable while categories were permanently unavailable.
  const storefrontSource = `${read("category-taxonomy.js")}\n${read("script.js")}`;
  const result = await terser.minify(storefrontSource, { compress: true, mangle: true });
  if (result.error) throw result.error;
  if (!result.code) throw new Error("Terser did not produce script.min.js content.");
  write("script.min.js", `${result.code}\n`);
  await minifyFile("checkout-flow.js", "checkout-flow.min.js");
}

function syncStylesheet() {
  const css = read("styles.css")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
  write("styles.min.css", `${css}\n`);
}

function assetVersion() {
  const hash = crypto.createHash("sha1");
  cacheableAssets.forEach((asset) => {
    hash.update(asset);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, asset)));
    hash.update("\0");
  });
  return `asset-${hash.digest("hex").slice(0, 12)}`;
}

function updateHtmlAssetVersions(version) {
  const htmlFiles = fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join(root, name));

  const assetPattern = /(href|src)=("|')([^"']*\/?(?:admin\.css|admin\.js|admin-orders\.js|admin-analytics\.js|analytics\.js|analytics-config\.js|styles\.min\.css|script\.min\.js|product-page\.css|product-page\.js|yota-colors\.js|checkout-flow\.min\.js|category-migration\.js|category-taxonomy\.js|subcategory-image-policy\.js))(?:\?v=[^"']*)?(\2)/g;

  htmlFiles.forEach((filePath) => {
    const before = fs.readFileSync(filePath, "utf8");
    const after = before.replace(assetPattern, (_match, attribute, quote, assetPath, closingQuote) => {
      return `${attribute}=${quote}${assetPath}?v=${version}${closingQuote}`;
    });
    if (after !== before) fs.writeFileSync(filePath, after);
  });
}

async function main() {
  await minifyScripts();
  syncStylesheet();
  const version = assetVersion();
  updateHtmlAssetVersions(version);
  console.log(`Prepared static assets with cache version ${version}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
