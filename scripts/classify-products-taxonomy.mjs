import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const productFiles = ["products.json", "firebase-functions/products.json"];
const backupDir = path.join(root, "backups");

const taxonomy = {
  "أدوات المذبح": {
    "شمعدانات": ["شمعدان"],
    "صلبان مذبح": ["صليب زفة", "صلبان زفة", "صليب إفنوتي", "صليب مذبح"],
    "شورية ومباخر": ["شورية", "مبخرة", "مباخر"],
    "أواني المذبح": ["طقم أواني", "أواني مذبح", "إبريق", "ابريق", "كأس", "صينية", "صواني"],
    "ذخائر وعلب": ["حُق ذخيرة", "حق ذخيرة", "ذخيرة", "أنابيب رفات", "رفات"],
    "حوامل ومنجليات": ["منجلية", "حامل", "ستاند"],
    "أدوات خدمة": ["تريانتو", "دف", "دفوف", "بشارة", "ناقوس"]
  },
  "الشمع والبخور": {
    "شموع": ["شمع أيقونات", "شمعة", "شموع", "شمع"],
    "بخور": ["بخور كنسي", "بخور"],
    "فحم": ["فحم"],
    "أباركة": ["أباركة", "اباركة"],
    "فتائل ومستلزمات الشموع": ["فتيل", "فتائل", "شغل شحن", "وصلة"],
    "أطقم بخور": ["طقم بخور"]
  },
  "الملابس الكنسية": {
    "تواني شمامسة": ["تونية", "تونيه", "تواني", "شماس"],
    "بطرشيلات": ["بطرشيل", "بطرشيلات"],
    "ملابس كهنة": ["كاهن", "كهنة"],
    "ملابس أطفال": ["أطفال", "طفل"],
    "مقاسات خاصة": ["مقاس خاص", "مقاسات خاصة"]
  },
  "المفارش والتطريز": {
    "مفارش مذبح": ["مفرش", "مفارش"],
    "ستائر": ["ستارة", "ستائر"],
    "أغطية وأقمشة كنسية": ["قماش", "أقمشة", "أغطية"],
    "تطريز حسب الطلب": ["تطريز"],
    "أطقم كاملة": ["طقم كامل", "أطقم كاملة"]
  },
  "الكتب والطقوس": {
    "أجبية وصلوات": ["أجبية", "اجبية", "صلاة", "صلوات"],
    "قطمارس": ["قطمارس"],
    "كتب طقسية": ["كتاب طقسي", "كتب طقسية", "البصخة", "الخمسين", "الأيام", "قراءات"],
    "كتب ألحان": ["ألحان", "الحان"],
    "كتب روحية وعقيدة": ["روحية", "عقيدة"],
    "كتب أطفال": ["كتاب أطفال", "كتب أطفال"],
    "كتب باللغة القبطية": ["قبطي", "قبطية"]
  },
  "الأيقونات والبراويز": {
    "أيقونات خشب": ["أيقونة خشب", "ايقونة خشب"],
    "أيقونات مطبوعة": ["أيقونة", "ايقونة"],
    "براويز": ["برواز", "براويز"],
    "صور قديسين": ["صورة", "صور قديسين", "قديس"],
    "أيقونات صغيرة": ["أيقونة صغيرة", "ايقونة صغيرة"]
  },
  "الصلبان والهدايا": {
    "صلبان حائط": ["صليب حائط", "صلبان حائط"],
    "صلبان يد": ["صليب يد", "صلبان يد"],
    "صلبان مكتبية": ["صليب مكتبي", "صلبان مكتبية"],
    "ميداليات": ["ميدالية", "ميداليات"],
    "هدايا اجتماعات": ["هدايا اجتماعات", "هدية اجتماع"],
    "توزيعات وتذكارات": ["توزيعات", "تذكارات"]
  }
};

const fallbackByLegacyCategory = {
  brass: ["أدوات المذبح", "أدوات خدمة"],
  candles: ["الشمع والبخور", "شموع"],
  books: ["الكتب والطقوس", "كتب طقسية"],
  icons: ["الأيقونات والبراويز", "أيقونات مطبوعة"],
  vestments: ["الملابس الكنسية", "بطرشيلات"]
};

const taxonomyNames = new Set([
  ...Object.keys(taxonomy),
  ...Object.values(taxonomy).flatMap((subcategories) => Object.keys(subcategories)),
  "غير مصنف",
  "يحتاج مراجعة"
]);

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

function haystack(product) {
  return [
    product.name,
    product.description,
    product.category,
    product.label,
    product.badge,
    product.image,
    ...(product.images || []),
    ...(product.tags || []).filter((tag) => !taxonomyNames.has(tag)),
    ...(product.variants || []).flatMap((variant) => [variant.title, variant.image, ...(variant.images || [])])
  ].filter(Boolean).join(" ");
}

function includesAny(text, words) {
  const normalized = normalizeText(text);
  return words.some((word) => normalized.includes(normalizeText(word)));
}

function classify(product) {
  const text = haystack(product);
  const normalized = normalizeText(text);

  if (normalized.includes("شمعدان")) return ["أدوات المذبح", "شمعدانات"];
  if (normalized.includes("صليب زفه") || normalized.includes("صلبان زفه") || normalized.includes("صليب افنوتي")) return ["أدوات المذبح", "صلبان مذبح"];
  if (normalized.includes("علبه بخور") || normalized.includes("علب بخور")) return ["الشمع والبخور", "أطقم بخور"];
  if (normalized.includes("بخور")) return ["الشمع والبخور", "بخور"];
  if (normalized.includes("صليب صدر") || normalized.includes("ايقونه")) return ["الأيقونات والبراويز", "أيقونات صغيرة"];

  for (const [mainCategory, subcategories] of Object.entries(taxonomy)) {
    for (const [subCategory, keywords] of Object.entries(subcategories)) {
      if (includesAny(text, keywords)) return [mainCategory, subCategory];
    }
  }

  return fallbackByLegacyCategory[product.category] || ["غير مصنف", "يحتاج مراجعة"];
}

function classifyProducts(products) {
  return products.map((product) => {
    const [mainCategory, subCategory] = classify(product);
    return {
      ...product,
      mainCategory,
      subCategory,
      tags: unique([
        ...(product.tags || []).filter((tag) => !taxonomyNames.has(tag)),
        product.label,
        product.badge,
        product.category,
        mainCategory,
        subCategory
      ])
    };
  });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reports = [];

for (const relativePath of productFiles) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) continue;

  const originalText = fs.readFileSync(filePath, "utf8");
  const original = JSON.parse(originalText);
  const backupPath = path.join(backupDir, `${relativePath.replace(/[\\/]/g, "__").replace(/\.json$/, "")}-before-taxonomy-${timestamp}.json`);
  fs.writeFileSync(backupPath, originalText, "utf8");

  const migrated = classifyProducts(original);
  writeJson(filePath, migrated);

  const byMainCategory = migrated.reduce((acc, product) => {
    acc[product.mainCategory] = (acc[product.mainCategory] || 0) + 1;
    return acc;
  }, {});
  reports.push({
    file: relativePath,
    backup: path.relative(root, backupPath),
    count: migrated.length,
    needsReview: migrated.filter((product) => product.mainCategory === "غير مصنف" || product.subCategory === "يحتاج مراجعة").length,
    byMainCategory
  });
}

console.log(JSON.stringify(reports, null, 2));
