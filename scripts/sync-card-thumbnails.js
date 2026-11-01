#!/usr/bin/env node
// Builds small card images (320/480/640 px WebP) for every product whose
// first photo is stored in the repo or in the products-data branch, and
// records them in thumbnail-manifest-v2.json together with the photo they
// were made from. The Worker only uses a card image while that photo is still
// the product's first photo, so replacing a photo in /admin never shows an
// old picture: the card falls back to the full photo until this runs again.
//
// Usage: node scripts/sync-card-thumbnails.js <path to a products-data checkout>
// It never edits products.json or any product data.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const dataRoot = path.resolve(process.argv[2] || root);
const manifestPath = path.join(root, "thumbnail-manifest-v2.json");
const sizes = [320, 480, 640];

function readProducts() {
  const file = path.join(dataRoot, "products.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.products || [];
}

function firstImage(product) {
  if (Array.isArray(product?.images) && product.images.length) return String(product.images[0] || "");
  return String(product?.image || "");
}

function localSource(source) {
  if (!source || /^(?:https?|data|blob):/i.test(source)) return "";
  const relative = source.split(/[?#]/)[0].replace(/^\/+/, "");
  for (const base of [dataRoot, root]) {
    const candidate = path.join(base, relative);
    if (candidate.startsWith(base) && fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function targetName(product, source) {
  const raw = String(product.id || "product").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const safe = raw.length > 60 ? `${raw.slice(0, 40)}-${crypto.createHash("sha1").update(raw).digest("hex").slice(0, 12)}` : raw;
  return `${safe}-${crypto.createHash("sha1").update(source).digest("hex").slice(0, 10)}.webp`;
}

(async () => {
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  let made = 0;
  let reused = 0;
  const skipped = [];

  for (const product of readProducts()) {
    const id = String(product?.id || "");
    const source = firstImage(product);
    const file = localSource(source);
    if (!id || !file) {
      if (id && source) skipped.push(id);
      continue;
    }

    const name = targetName(product, source);
    const outputs = sizes.map((width) => path.join(root, "assets", "thumbnails", String(width), name));
    if (outputs.every((output) => fs.existsSync(output))) {
      reused += 1;
    } else {
      const buffer = await fs.promises.readFile(file);
      for (const [index, width] of sizes.entries()) {
        await fs.promises.mkdir(path.dirname(outputs[index]), { recursive: true });
        await sharp(buffer, { failOn: "none" })
          .rotate()
          .resize({ width, height: width, fit: "contain", background: "#fffdf7", withoutEnlargement: true })
          .webp({ quality: 74, effort: 5 })
          .toFile(outputs[index]);
      }
      made += 1;
    }
    manifest[id] = { thumbnail: `/assets/thumbnails/320/${name}`, source };
  }

  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((key) => [key, manifest[key]]));
  fs.writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Card images: ${made} new, ${reused} already up to date, ${skipped.length} skipped (remote or missing photo).`);
})();
