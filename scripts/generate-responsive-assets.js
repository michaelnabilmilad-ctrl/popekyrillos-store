const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "assets", "optimized", "logo-papa-kyrillos-original.webp");
const widths = [64, 128, 160, 320];

Promise.all(widths.map((width) => sharp(source, { failOn: "none" })
  .resize({ width, height: width, fit: "contain", withoutEnlargement: true })
  .webp({ quality: 82, effort: 5 })
  .toFile(path.join(root, "assets", "optimized", `logo-papa-kyrillos-${width}.webp`))))
  .then(() => console.log(`Generated ${widths.length} responsive logo assets.`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
