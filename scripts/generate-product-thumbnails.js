const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const productsPath = path.join(root, "products.json");
const sizes = [320, 480, 640];
const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));

function filename(product) {
  const raw = String(product.id || product.slug || "product").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const safe = raw.length > 80 ? `${raw.slice(0, 56)}-${crypto.createHash("sha1").update(raw).digest("hex").slice(0, 12)}` : raw;
  return `${safe}.webp`;
}

async function sourceBuffer(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { headers: { "User-Agent": "popekyrillos-store-thumbnail-builder" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const localPath = path.join(root, String(source).replace(/^\/+/, ""));
  return fs.promises.readFile(localPath);
}

(async () => {
  let generated = 0;
  const manifest = {};
  for (const product of products) {
    const source = product.image || product.images?.[0];
    if (!source) continue;
    try {
      const buffer = await sourceBuffer(source);
      const targetName = filename(product);
      for (const width of sizes) {
        const directory = path.join(root, "assets", "thumbnails", String(width));
        await fs.promises.mkdir(directory, { recursive: true });
        await sharp(buffer, { failOn: "none" }).rotate().resize({ width, height: width, fit: "contain", background: "#fffdf7", withoutEnlargement: true }).webp({ quality: 72, effort: 5 }).toFile(path.join(directory, targetName));
      }
      product.thumbnail = `/assets/thumbnails/320/${targetName}`;
      manifest[String(product.id)] = product.thumbnail;
      generated += 1;
    } catch (error) {
      console.warn(`Thumbnail skipped for ${product.id}: ${error.message}`);
    }
  }
  fs.writeFileSync(productsPath, `${JSON.stringify(products, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "thumbnail-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated responsive thumbnails for ${generated}/${products.length} products.`);
})();
