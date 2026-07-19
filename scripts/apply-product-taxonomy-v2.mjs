import fs from "node:fs";

const target = process.argv[2] || "products.json";
const source = JSON.parse(fs.readFileSync("products.json", "utf8"));
const sourceById = new Map(source.map((product) => [product.id, product]));
const products = JSON.parse(fs.readFileSync(target, "utf8"));

const unique = (items) => [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
const subcategoryAliases = new Map([
  ["شنط ومستلزمات روحية", "tote-bags"], ["كروت", "cards"], ["بوك مارك", "bookmarks"],
  ["جورنالينج", "planners"], ["نوت بوك", "notebooks"], ["باكيدج", "meeting-games"],
  ["أيقونات صغيرة", "small-icons"], ["قطمارس", "katameros"], ["كتب طقسية", "liturgical-books"],
  ["شموع", "candles"], ["أطقم بخور", "incense-sets"], ["بخور", "incense"],
  ["أدوات خدمة", "service-tools"], ["شمعدانات", "candlesticks"], ["ذخائر وعلب", "relic-boxes"],
  ["أواني المذبح", "altar-vessels"], ["بطرشيلات", "stoles"]
]);

function classify(product) {
  const name = product.name || "";
  const main = product.mainCategory || "";
  const sub = product.subcategory || product.subCategory || "";
  if (/صليب زفة/.test(name)) return ["crosses", "processional-crosses"];
  if (/صليب إفنوتي|صليب افنوتي/.test(name)) return ["crosses", "altar-crosses"];
  if (/صليب صدر/.test(name)) return ["crosses", "pectoral-crosses"];
  if (/صليب يوتا|صليب يوطا/.test(name)) return ["crosses", "wooden-crosses"];
  if (/لون تلوين اليوتا|ألوان اليوطا/.test(name)) return ["gifts-accessories", "meeting-games"];
  if (main === "منتجات أتبعه" || product.category === "atb3ho") {
    if (/بالاسم|بالإسم/.test(name)) return ["gifts-accessories", "personalized"];
    if (/بوك مارك/.test(name) || sub === "بوك مارك") return ["gifts-accessories", "bookmarks"];
    if (/نوت بوك|نوت\b/.test(name) || sub === "نوت بوك") return ["gifts-accessories", "notebooks"];
    if (/جورنال|أجندة|اجندة/.test(name) || sub === "جورنالينج") return ["gifts-accessories", "planners"];
    if (/تحدي|لعبة|ألعاب|باكدج/.test(name) || sub === "باكيدج") return ["gifts-accessories", "meeting-games"];
    if (/كارت|كروت/.test(name) || sub === "كروت") return ["gifts-accessories", "cards"];
    return ["gifts-accessories", "tote-bags"];
  }
  if (main === "الصلبان والهدايا") return ["gifts-accessories", "meeting-games"];
  if (main === "الأيقونات والبراويز") return ["icons-frames", subcategoryAliases.get(sub) || "small-icons"];
  if (main === "الكتب والطقوس") return ["books-rituals", subcategoryAliases.get(sub) || "liturgical-books"];
  if (main === "الشمع والبخور") return ["candles-incense", subcategoryAliases.get(sub) || "incense"];
  if (main === "الملابس الكنسية" || main === "المفارش والتطريز") return ["church-vestments", subcategoryAliases.get(sub) || "stoles"];
  if (main === "أدوات المذبح" || main === "مستلزمات المذبح والخدمة") return ["altar-tools", subcategoryAliases.get(sub) || "service-tools"];
  return ["uncategorized", "needs-review"];
}

const migrated = products.map((product) => {
  const known = sourceById.get(product.id);
  if (known) return { ...product, mainCategory: known.mainCategory, subcategory: known.subcategory, subCategory: known.subcategory, collections: known.collections, searchKeywords: known.searchKeywords };
  const [mainCategory, subcategory] = classify(product);
  const collections = unique([
    ...(product.collections || []),
    mainCategory === "altar-tools" || ["altar-crosses", "processional-crosses"].includes(subcategory) ? "مستلزمات المذبح" : "",
    ["gifts-accessories", "crosses"].includes(mainCategory) ? "هدايا الخدمة" : "",
    ["meeting-games", "cards", "bookmarks", "wooden-crosses"].includes(subcategory) ? "منتجات الأطفال" : ""
  ]);
  const searchKeywords = unique([...(product.searchKeywords || []), product.name, product.label, ...(product.tags || []), mainCategory, subcategory, ...collections]);
  return { ...product, mainCategory, subcategory, subCategory: subcategory, collections, searchKeywords };
});

fs.writeFileSync(target, `${JSON.stringify(migrated, null, 2)}\n`);
console.log(`${target}: migrated ${migrated.length} products`);
