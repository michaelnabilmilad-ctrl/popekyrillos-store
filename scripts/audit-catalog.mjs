import fs from "node:fs";
import vm from "node:vm";

const source = process.argv[2] || "products.json";
const products = JSON.parse(fs.readFileSync(source, "utf8"));
const taxonomySource = fs.readFileSync("category-taxonomy.js", "utf8");
const sandbox = { window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.runInNewContext(taxonomySource, sandbox);
const categories = JSON.parse(JSON.stringify(sandbox.window.POPE_KYRILLOS_TAXONOMY.defaultCategories));

const localized = (value) => value && typeof value === "object" ? value.ar || value.en || Object.values(value).find(Boolean) || "" : value || "";
const variantAvailable = (variant) => {
  const raw = variant?.quantity;
  const quantity = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  return quantity !== null && Number.isInteger(quantity) && quantity >= 0 ? quantity > 0 : variant?.available !== false;
};
const available = (product) => Array.isArray(product?.variants) && product.variants.length
  ? product.variants.some(variantAvailable)
  : product?.stock !== "غير متاح حاليا" && product?.available !== false;
const published = (product) => product?.active !== false && product?.hidden !== true && product?.deleted !== true && product?.published !== false;
const active = products.filter((product) => published(product) && available(product));
const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const categoryAliases = { brass: "altar-vessels", candles: "candles-lamps", vestments: "church-vestments", icons: "icons-frames", books: "books-rituals", gifts: "occasions-service" };
const categoryNames = new Map(categories.map((category) => [localized(category.name), category.id]));
const namedCategoryAliases = { "المذبح والأواني المقدسة": "altar-vessels", "مستلزمات المذبح والخدمة": "altar-vessels", "الشمع والبخور": "candles-lamps", "الشمع والقناديل": "candles-lamps", "الملابس والمفارش الكنسية": "church-vestments", "الملابس والأقمشة الكنسية": "church-vestments", "الصلبان": "crosses", "الأيقونات والبراويز": "icons-frames", "الكتب والطقوس": "books-rituals", "المناسبات والخدمة": "occasions-service", "تجهيزات الكنيسة": "church-equipment", "تجهيز الكنائس والطلبات الخاصة": "church-equipment" };
const mainId = (product) => categoryNames.get(localized(product.mainCategory)) || namedCategoryAliases[localized(product.mainCategory)] || categoryAliases[product.category] || product.mainCategory || "uncategorized";
const subId = (product) => String(product.subcategory || product.subCategory || product.label || "");
const counts = Object.fromEntries(categories.map((category) => [category.id, active.filter((product) => mainId(product) === category.id || (category.id === "greek-collection" && (product.collections || []).some((id) => String(id).startsWith("greek-")))).length]));
const emptyCategories = categories.filter((category) => !category.hiddenFromCustomerNav && !counts[category.id]).map(({ id, name }) => ({ id, name: localized(name) }));
const emptySubcategories = categories.flatMap((category) => category.subcategories.filter((subcategory) => !active.some((product) => (mainId(product) === category.id && subId(product) === subcategory.id) || (product.collections || []).includes(subcategory.id))).map((subcategory) => ({ categoryId: category.id, category: localized(category.name), id: subcategory.id, name: localized(subcategory.name) })));
const by = (key) => [...active.reduce((map, product) => { const value = key(product); if (!value) return map; map.set(value, [...(map.get(value) || []), product]); return map; }, new Map())].filter(([, group]) => group.length > 1);
const duplicateGroups = by((product) => `${normalize(localized(product.name))}|${Number(product.price) || ""}`).map(([signature, group]) => ({ signature, products: group.map((product) => ({ id: product.id, sku: product.sku || "", name: localized(product.name), price: product.price, stock: product.stock, slug: product.slug })) }));
const allDuplicateGroups = [...products.reduce((map, product) => { const value = `${normalize(localized(product.name))}|${Number(product.price) || ""}`; map.set(value, [...(map.get(value) || []), product]); return map; }, new Map())].filter(([, group]) => group.length > 1).map(([signature, group]) => ({ signature, products: group.map((product) => ({ id: product.id, sku: product.sku || "", name: localized(product.name), price: product.price, stock: product.stock, active: active.includes(product), slug: product.slug })) }));
const internalLabels = products.filter((product) => /(?:نسخة|\bcopy\b|\bduplicate\b)/iu.test(localized(product.name))).map((product) => ({ id: product.id, sku: product.sku || "", name: localized(product.name), active: active.includes(product) }));
const mappingFlags = products.filter((product) => /(?:تريانتو|\bدف\b|دفوف|triangle|cymbal)/iu.test([localized(product.name), product.label, product.subCategory, ...(product.tags || [])].join(" ")) && mainId(product) === "altar-vessels").map((product) => ({ id: product.id, name: localized(product.name), mainCategory: product.mainCategory, subcategory: subId(product), stock: product.stock }));
const duplicateIds = by((product) => String(product.id || "")).map(([id, group]) => ({ id, count: group.length }));
const duplicateSkus = by((product) => String(product.sku || "").trim()).map(([sku, group]) => ({ sku, products: group.map((product) => ({ id: product.id, name: localized(product.name) })) }));
const duplicateSlugs = by((product) => String(product.slug || "").trim()).map(([slug, group]) => ({ slug, products: group.map((product) => ({ id: product.id, name: localized(product.name) })) }));

const report = { generatedAt: new Date().toISOString(), source, totals: { records: products.length, published: products.filter(published).length, activePublishedAvailable: active.length }, categoryCounts: counts, emptyCategories, emptySubcategories, duplicateGroupsActive: duplicateGroups, duplicateGroupsAllRecords: allDuplicateGroups, duplicateIds, duplicateSkus, duplicateSlugs, internalLabels, mappingFlags };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
