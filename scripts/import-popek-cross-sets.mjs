import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const sourceDir = process.argv[2];
if (!sourceDir) {
  throw new Error("Usage: node scripts/import-popek-cross-sets.mjs <source-directory>");
}

const rootDir = path.resolve(import.meta.dirname, "..");
const productsPath = path.join(rootDir, "products.json");
const galleryDir = path.join(rootDir, "assets", "products", "gallery");
const modelNumbers = Array.from({ length: 22 }, (_, index) => index + 1);

fs.mkdirSync(galleryDir, { recursive: true });

const copiedImages = new Map();
for (const model of modelNumbers) {
  const boxedSource = path.join(sourceDir, `${model}.webp`);
  const unboxedSource = path.join(sourceDir, model === 2 ? "2-2.webp" : `${model}-1.webp`);
  const boxedName = `popek-corian-hand-pectoral-cross-set-model-${model}-boxed.webp`;
  const unboxedName = `popek-corian-hand-pectoral-cross-set-model-${model}-unboxed.webp`;

  for (const source of [boxedSource, unboxedSource]) {
    if (!fs.existsSync(source)) throw new Error(`Missing product image: ${source}`);
  }

  await Promise.all([
    [boxedSource, boxedName],
    [unboxedSource, unboxedName],
  ].map(([source, fileName]) => {
    const destination = path.join(galleryDir, fileName);
    const temporary = `${destination}.tmp`;
    return sharp(source)
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, effort: 5 })
      .toFile(temporary)
      .then(() => {
        if (fs.existsSync(destination)) fs.rmSync(destination);
        fs.renameSync(temporary, destination);
      });
  }));
  copiedImages.set(model, {
    boxed: `assets/products/gallery/${boxedName}`,
    unboxed: `assets/products/gallery/${unboxedName}`,
  });
}

const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
const importedIds = new Set(modelNumbers.map((model) => `popek-corian-cross-set-${model}`));
const remainingProducts = products.filter((product) => !importedIds.has(product.id));
const description =
  "طقم صلبان يد وصدر من الكوريان، بديل الرخام المعروف بمتانته ومظهره الأنيق. يضم الطقم صليب يد وصليب صدر بسلسلة، ويأتي داخل علبة قطيفة مناسبة للحفظ والتقديم كهدية. طول صليب اليد نحو 21–22 سم، وقد توجد فروق بسيطة بحسب الموديل.";

const importedProducts = modelNumbers.map((model) => {
  const id = `popek-corian-cross-set-${model}`;
  const slug = `طقم-صلبان-يد-وصدر-كوريان-موديل-${model}`;
  const images = copiedImages.get(model);
  return {
    id,
    name: `طقم صلبان يد وصدر كوريان بالعلبة - موديل ${model}`,
    category: "icons",
    label: "صلبان يد وصدر",
    description,
    price: 770,
    priceNote: "السعر للطقم كاملًا بالعلبة",
    stock: "متاح",
    badge: "جديد",
    isBestSeller: false,
    image: images.boxed,
    images: [images.boxed, images.unboxed],
    options: [],
    variants: [
      {
        id: `${id}-variant-1`,
        title: "الاختيار الافتراضي",
        options: {},
        price: 770,
        compareAtPrice: null,
        available: true,
        image: null,
        images: [],
        sku: `POPEK-CORIAN-CROSS-${String(model).padStart(2, "0")}`,
        quantity: null,
      },
    ],
    mainCategory: "الصلبان",
    subCategory: "صلبان يد",
    subcategory: "hand-crosses",
    collections: ["الصلبان", "صلبان يد", "صلبان صدر"],
    tags: ["طقم صلبان", "صليب يد", "صليب صدر", "كوريان", "بديل الرخام", "علبة قطيفة", `موديل ${model}`],
    searchKeywords: [
      `طقم صلبان يد وصدر كوريان بالعلبة موديل ${model}`,
      "طقم صلبان",
      "صليب يد",
      "صليب صدر",
      "صلبان كوريان",
      "بديل الرخام",
      "علبة قطيفة",
      "21 سم",
      "22 سم",
      "crosses",
      "hand-crosses",
      "pectoral-crosses",
      "الصلبان",
    ],
    slug,
  };
});

fs.writeFileSync(productsPath, `${JSON.stringify([...importedProducts, ...remainingProducts], null, 2)}\n`);
console.log(`Imported ${importedProducts.length} POPEK cross sets and ${modelNumbers.length * 2} images.`);
