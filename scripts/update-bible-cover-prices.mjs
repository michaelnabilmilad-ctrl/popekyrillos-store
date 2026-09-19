import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productId = "old-10121173303603";
const pricesBySize = new Map([
  ["صغير 13*19 سم", 70],
  ["متوسط 15*22 سم", 90],
  ["كبير بيد 20*30 سم", 140],
]);

function toArabicDigits(value) {
  return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function updateFile(relativePath) {
  const filePath = path.join(root, relativePath);
  const products = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const product = products.find(({ id }) => id === productId);
  if (!product) throw new Error(`Product ${productId} was not found in ${relativePath}`);

  product.price = 70;
  product.priceNote = "يبدأ من ٧٠ ج.م حتى ١٤٠ ج.م";
  product.variants.forEach((variant) => {
    const size = variant.options?.["المقاس"];
    const price = pricesBySize.get(size);
    if (price == null) throw new Error(`Unknown size in ${relativePath}: ${size}`);
    variant.price = price;
  });

  const lines = product.description.split("\n");
  product.description = lines.map((line) => {
    for (const [englishSize, arabicSize] of [
      ["Small 13*19 cm", "صغير 13*19 سم"],
      ["Medium 15*22 cm", "متوسط 15*22 سم"],
      ["Large with hand 20*30 cm", "كبير بيد 20*30 سم"],
    ]) {
      if (line.startsWith(`${englishSize} /`)) {
        return line.replace(/: [٠-٩]+ ج\.م/, `: ${toArabicDigits(pricesBySize.get(arabicSize))} ج.م`);
      }
    }
    return line;
  }).join("\n");

  fs.writeFileSync(filePath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

for (const file of ["products.json", "firebase-functions/products.json", "dist/products.json"]) {
  updateFile(file);
}

