import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const sourceOrigin = "https://www.atb3ho.com";
const productsPath = "products.json";
const importedIdPrefix = "atb3ho-";
const atb3hoMainCategory = "منتجات أتبعه";

const collections = [
  { handle: "اجندة", subCategory: "جورنالينج" },
  { handle: "نوت-بوك", subCategory: "نوت بوك" },
  { handle: "كروت-التحديات", subCategory: "كروت" },
  { handle: "بوك-مارك", subCategory: "بوك مارك" },
  { handle: "باكيذج", subCategory: "باكيدج" }
];

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function stripHtml(html = "") {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function inferSubCategory(product, collectionSubCategory = "") {
  if (collectionSubCategory) return collectionSubCategory;
  const text = `${product.title || ""} ${product.handle || ""}`;
  if (/شنط|شنطه|شنطة|كافر|مستلزمات/i.test(text)) return "شنط ومستلزمات روحية";
  if (/نوت|دفتر|اجندة|أجندة/i.test(text)) return "نوت بوك";
  if (/جورنال|رحلة|٢١٤|365|٣٦٥/i.test(text)) return "جورنالينج";
  if (/كارت|كروت|تحدي|تحديات/i.test(text)) return "كروت";
  if (/بوك\s*مارك|bookmark/i.test(text)) return "بوك مارك";
  if (/باكدج|باكيدج|package/i.test(text)) return "باكيدج";
  return "جورنالينج";
}

function optionName(option) {
  if (!option || option.name === "Title") return "";
  if (option.name === "Color") return "اللون";
  if (option.name === "Language") return "اللغة";
  return option.name;
}

function optionValues(product) {
  return (product.options || [])
    .map((option, index) => ({
      sourceName: option.name,
      name: optionName(option),
      index: index + 1,
      values: option.values || []
    }))
    .filter((option) => option.name && option.values.length && !(option.values.length === 1 && option.values[0] === "Default Title"));
}

function variantOptions(variant, options) {
  const mapped = {};
  options.forEach((option) => {
    const value = variant[`option${option.index}`];
    if (value && value !== "Default Title") mapped[option.name] = value;
  });
  return mapped;
}

function variantImage(variant) {
  return variant.featured_image?.src || null;
}

function mapProduct(product, collectionSubCategory = "") {
  const options = optionValues(product);
  const images = unique((product.images || []).map((image) => image.src));
  const variants = (product.variants || []).map((variant, index) => {
    const image = variantImage(variant);
    const price = numberOrNull(variant.price) ?? 0;
    const compareAtPrice = numberOrNull(variant.compare_at_price);

    return {
      id: `${importedIdPrefix}${product.id}-variant-${variant.id || index + 1}`,
      title: variant.title && variant.title !== "Default Title" ? variant.title : "الاختيار الافتراضي",
      options: variantOptions(variant, options),
      price,
      compareAtPrice: compareAtPrice && compareAtPrice > price ? compareAtPrice : null,
      available: Boolean(variant.available),
      image,
      images: image ? [image] : [],
      sku: variant.sku || "",
      quantity: null
    };
  });
  const prices = variants.map((variant) => variant.price).filter((price) => price > 0);
  const subCategory = inferSubCategory(product, collectionSubCategory);

  return {
    id: `${importedIdPrefix}${product.id}`,
    name: product.title || "",
    category: "atb3ho",
    label: subCategory,
    description: stripHtml(product.body_html),
    price: prices.length ? Math.min(...prices) : 0,
    priceNote: "",
    stock: variants.some((variant) => variant.available) ? "متاح" : "غير متاح حاليا",
    badge: variants.some((variant) => variant.compareAtPrice && variant.compareAtPrice > variant.price) ? "خصم" : subCategory,
    image: images[0] || "",
    url: `${sourceOrigin}/products/${encodeURIComponent(product.handle)}`,
    source: "atb3ho",
    sourceUpdatedAt: product.updated_at || "",
    tags: unique(["أتبعه", "Atb3ho", subCategory, ...(product.tags || [])]),
    images,
    options: options.map((option) => ({ name: option.name, values: option.values })),
    variants,
    mainCategory: atb3hoMainCategory,
    subCategory,
    updatedAt: product.updated_at || ""
  };
}

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.json();
  } catch (error) {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Invoke-WebRequest -UseBasicParsing '${url}').Content`
    ], {
      maxBuffer: 20 * 1024 * 1024
    });
    return JSON.parse(stdout);
  }
}

async function main() {
  const collectionByProductId = new Map();

  for (const collection of collections) {
    const url = `${sourceOrigin}/collections/${encodeURIComponent(collection.handle)}/products.json?limit=250`;
    const data = await fetchJson(url);
    (data.products || []).forEach((product) => {
      if (!collectionByProductId.has(product.id)) collectionByProductId.set(product.id, collection.subCategory);
    });
  }

  const sourceData = await fetchJson(`${sourceOrigin}/products.json?limit=250`);
  const importedProducts = (sourceData.products || []).map((product) => mapProduct(product, collectionByProductId.get(product.id) || ""));
  const currentProducts = JSON.parse(await fs.readFile(productsPath, "utf8"));
  const withoutOldImports = currentProducts.filter((product) => !String(product.id || "").startsWith(importedIdPrefix));
  const nextProducts = [...importedProducts, ...withoutOldImports];

  await fs.writeFile(productsPath, `${JSON.stringify(nextProducts, null, 2)}\n`, "utf8");

  console.log(`Imported ${importedProducts.length} Atb3ho products.`);
  console.log(`Total products: ${nextProducts.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
