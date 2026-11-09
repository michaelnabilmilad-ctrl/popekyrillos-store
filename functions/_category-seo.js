// Category page SEO content: one renderer for every category and subcategory.
//
// The content lives in category-seo.json on the products-data branch, edited one
// category at a time from the admin. Every field is optional; a category without an
// entry keeps the generated title and description and shows no intro.
//
// File format:
//   {
//     "version": 1,
//     "updatedAt": "<ISO time of the last save>",
//     "categories": { "<categoryId>[/<subcategoryId>]": { seoTitle, seoDescription, seoIntro, seoRelated, updatedAt } },
//     "history":    { "<key>": [ { "replacedAt": "<ISO>", "entry": { ... } | null }, ... ] }   // newest first, at most 5
//   }

import { escapeHtml } from "./_seo.js";

export const CATEGORY_SEO_FILE = "category-seo.json";
export const CATEGORY_SEO_LIMITS = Object.freeze({ title: 70, description: 160, intro: 700, related: 6, links: 5, history: 5 });
// Lengths Google usually shows in full; longer text is allowed but flagged.
export const CATEGORY_SEO_RECOMMENDED = Object.freeze({ title: 60, description: 155 });

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}(?:\/[a-z0-9][a-z0-9-]{0,80})?$/;
const LINK_PATTERN = /\[([^\[\]\n]{1,80})\]\(([^()\s]{1,300})\)/gu;
const FIELDS = ["seoTitle", "seoDescription", "seoIntro"];

export function categorySeoKey(categoryId = "", subcategoryId = "") {
  return subcategoryId ? `${categoryId}/${subcategoryId}` : String(categoryId || "");
}

export function isCategorySeoKey(key) {
  return KEY_PATTERN.test(String(key || ""));
}

// One line of plain text: control characters and runs of whitespace become one space.
export function cleanSeoText(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanRelated(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(isCategorySeoKey))].slice(0, CATEGORY_SEO_LIMITS.related);
}

// A stored entry as the site uses it: known fields only, cleaned and bounded. The
// file is written only by the admin endpoint, which validates first; this keeps a
// hand-edited or damaged file from ever reaching a page as anything but text.
function storedEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = {
    seoTitle: cleanSeoText(raw.seoTitle).slice(0, CATEGORY_SEO_LIMITS.title),
    seoDescription: cleanSeoText(raw.seoDescription).slice(0, CATEGORY_SEO_LIMITS.description),
    seoIntro: cleanSeoText(raw.seoIntro).slice(0, CATEGORY_SEO_LIMITS.intro),
    seoRelated: cleanRelated(raw.seoRelated),
    updatedAt: cleanSeoText(raw.updatedAt).slice(0, 40)
  };
  return FIELDS.some((field) => entry[field]) || entry.seoRelated.length ? entry : null;
}

export function emptyCategorySeoFile() {
  return { version: 1, updatedAt: "", categories: {}, history: {} };
}

// Parses category-seo.json. Throws on text that is not a JSON object.
export function parseCategorySeoFile(text) {
  const raw = JSON.parse(String(text || ""));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("category-seo.json is not an object");
  const file = emptyCategorySeoFile();
  file.updatedAt = cleanSeoText(raw.updatedAt).slice(0, 40);
  for (const [key, value] of Object.entries(raw.categories && typeof raw.categories === "object" ? raw.categories : {})) {
    const entry = isCategorySeoKey(key) ? storedEntry(value) : null;
    if (entry) file.categories[key] = entry;
  }
  for (const [key, list] of Object.entries(raw.history && typeof raw.history === "object" ? raw.history : {})) {
    if (!isCategorySeoKey(key) || !Array.isArray(list)) continue;
    file.history[key] = list.slice(0, CATEGORY_SEO_LIMITS.history).map((item) => ({
      replacedAt: cleanSeoText(item?.replacedAt).slice(0, 40),
      entry: storedEntry(item?.entry)
    }));
  }
  return file;
}

export function serializeCategorySeoFile(file) {
  return `${JSON.stringify(file, null, 2)}\n`;
}

// SEO content of one route; empty fields mean "use the automatic value".
export function categorySeoContent({ categoryId, subcategoryId, entries = {} }) {
  const key = categorySeoKey(categoryId, subcategoryId);
  const entry = entries[key] || null;
  return {
    key,
    seoTitle: entry?.seoTitle || "",
    seoDescription: entry?.seoDescription || "",
    seoIntro: entry?.seoIntro || "",
    seoRelated: (entry?.seoRelated || []).filter((item) => item !== key)
  };
}

// Path of an intro link, normalised for lookups: "/category/a/b" or "/products/<slug>".
export function introLinkTarget(path) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(path || ""));
  } catch {
    return null;
  }
  const category = /^\/category\/([a-z0-9][a-z0-9-]*)(?:\/([a-z0-9][a-z0-9-]*))?\/?$/.exec(decoded);
  if (category) return { type: "category", key: categorySeoKey(category[1], category[2] || ""), path: `/category/${category[1]}${category[2] ? `/${category[2]}` : ""}` };
  const product = /^\/products\/([^/?#\s"'<>]{1,200})\/?$/u.exec(decoded);
  if (product) return { type: "product", slug: product[1], path: `/products/${encodeURIComponent(product[1])}` };
  return null;
}

// Intro text with [label](/category/...) or [label](/products/...) links. Everything
// is escaped; a link becomes <a> only when isLinkLive(target) says the page exists now,
// otherwise its label is shown as plain text.
export function introHtml(intro = "", isLinkLive = () => true) {
  const source = String(intro);
  let html = "";
  let last = 0;
  for (const match of source.matchAll(LINK_PATTERN)) {
    html += escapeHtml(source.slice(last, match.index));
    const [, label, path] = match;
    const target = introLinkTarget(path);
    html += target && isLinkLive(target) ? `<a href="${escapeHtml(target.path)}">${escapeHtml(label)}</a>` : escapeHtml(label);
    last = match.index + match[0].length;
  }
  return html + escapeHtml(source.slice(last));
}

// Validates an admin edit. keyExists: the edited category is in the published
// taxonomy (it may still be empty). categoryExists / productExists: a link or related
// category points at a real, public page with products right now.
// Returns the entry to store (null = back to automatic).
export function validateCategorySeoEntry(input, { key, keyExists, categoryExists, productExists }) {
  const errors = [];
  const warnings = [];
  const add = (field, message) => errors.push({ field, message });
  if (!isCategorySeoKey(key) || !(keyExists || categoryExists)(key)) add("key", "القسم غير موجود في الأقسام المنشورة. انشر الأقسام أولًا ثم أعد المحاولة.");
  const source = input && typeof input === "object" ? input : {};
  const entry = {
    seoTitle: cleanSeoText(source.seoTitle),
    seoDescription: cleanSeoText(source.seoDescription),
    seoIntro: cleanSeoText(source.seoIntro),
    seoRelated: Array.isArray(source.seoRelated) ? source.seoRelated.map((item) => String(item ?? "").trim()).filter(Boolean) : []
  };
  const labels = { seoTitle: "عنوان SEO", seoDescription: "وصف Meta", seoIntro: "النص التعريفي" };
  const limits = { seoTitle: CATEGORY_SEO_LIMITS.title, seoDescription: CATEGORY_SEO_LIMITS.description, seoIntro: CATEGORY_SEO_LIMITS.intro };
  for (const field of FIELDS) {
    if (/[<>]/.test(entry[field])) add(field, `${labels[field]}: غير مسموح باستخدام الرمزين < و > (أكواد HTML).`);
    if (/(?:javascript|vbscript|data)\s*:/i.test(entry[field])) add(field, `${labels[field]}: يحتوي على نص غير مسموح.`);
    if (entry[field].length > limits[field]) add(field, `${labels[field]}: الحد الأقصى ${limits[field]} حرفًا (الحالي ${entry[field].length}).`);
  }
  if (entry.seoTitle && entry.seoTitle.length > CATEGORY_SEO_RECOMMENDED.title) warnings.push({ field: "seoTitle", message: `العنوان أطول من ${CATEGORY_SEO_RECOMMENDED.title} حرفًا وقد يظهر مقطوعًا في جوجل.` });
  if (entry.seoDescription && entry.seoDescription.length > CATEGORY_SEO_RECOMMENDED.description) warnings.push({ field: "seoDescription", message: `الوصف أطول من ${CATEGORY_SEO_RECOMMENDED.description} حرفًا وقد يظهر مقطوعًا في جوجل.` });

  // Intro links: only well-formed links to pages that exist in the store.
  const links = [...entry.seoIntro.matchAll(LINK_PATTERN)];
  const withoutLinks = entry.seoIntro.replace(LINK_PATTERN, "");
  if (/\]\(|\[[^\]]*\]\s*\(/.test(withoutLinks)) add("seoIntro", "النص التعريفي: صيغة رابط غير صحيحة. استخدم [النص](/category/القسم).");
  if (links.length > CATEGORY_SEO_LIMITS.links) add("seoIntro", `النص التعريفي: الحد الأقصى ${CATEGORY_SEO_LIMITS.links} روابط.`);
  for (const [, label, path] of links) {
    const target = introLinkTarget(path);
    if (!target) add("seoIntro", `الرابط «${label}» ليس رابط قسم أو منتج داخل المتجر.`);
    else if (target.type === "category" && (target.key === key || !categoryExists(target.key))) add("seoIntro", `الرابط «${label}» يشير إلى قسم غير موجود أو إلى نفس القسم.`);
    else if (target.type === "product" && !productExists(target.slug)) add("seoIntro", `الرابط «${label}» يشير إلى منتج غير موجود.`);
  }

  const related = [...new Set(entry.seoRelated)];
  if (related.length > CATEGORY_SEO_LIMITS.related) add("seoRelated", `الأقسام المرتبطة: الحد الأقصى ${CATEGORY_SEO_LIMITS.related}.`);
  for (const item of related) {
    if (item === key) add("seoRelated", "لا يمكن ربط القسم بنفسه.");
    else if (!isCategorySeoKey(item) || !categoryExists(item)) add("seoRelated", `القسم المرتبط «${item}» غير موجود.`);
  }
  entry.seoRelated = related;

  const empty = !FIELDS.some((field) => entry[field]) && !entry.seoRelated.length;
  return { ok: errors.length === 0, entry: empty ? null : entry, errors, warnings };
}

// The file after setting (or, with null, removing) one category's entry. Only that
// key changes; its previous value goes to the top of its history.
export function applyCategorySeoChange(file, key, entry, now = new Date().toISOString()) {
  const next = {
    version: 1,
    updatedAt: now,
    categories: { ...file.categories },
    history: { ...file.history }
  };
  const previous = file.categories[key] || null;
  if (entry) next.categories[key] = { ...entry, updatedAt: now };
  else delete next.categories[key];
  next.history[key] = [{ replacedAt: now, entry: previous }, ...(file.history[key] || [])].slice(0, CATEGORY_SEO_LIMITS.history);
  return next;
}

// Server-rendered heading of a category page, inside the existing catalog
// header: shown without waiting for JavaScript, with the intro under the H1.
// On phones the intro shows two lines and a «اقرأ المزيد» toggle (CSS only, so
// nothing moves after load); the full text is always in the page.
export function setCategoryHeading(html, { title, breadcrumb, introHtml: intro, key }) {
  const introBlock = intro
    ? `\n          <div class="category-intro-wrap" data-category-intro="${escapeHtml(key)}"><input type="checkbox" id="category-intro-more" class="category-intro-more" aria-label="عرض الوصف كاملًا"><p class="category-intro">${intro}</p><label for="category-intro-more" class="category-intro-toggle" aria-hidden="true"></label></div>`
    : "";
  return html
    .replace(/(<header class="mobile-catalog-heading" data-mobile-catalog-heading)\s+hidden>/i, "$1>")
    .replace(/(<h1 data-mobile-catalog-title>)[\s\S]*?(<\/h1>)/i, `$1${escapeHtml(title)}$2${introBlock}`)
    .replace(/(<small data-mobile-catalog-breadcrumb>)[\s\S]*?(<\/small>)/i, `$1${escapeHtml(breadcrumb)}$2`);
}

// The store name stays in the banner, unchanged on screen, but stops being the
// page's H1 so the category name is the only H1. The home page keeps its H1.
export function demoteHeroHeading(html) {
  return html.replace(/<h1 id="hero-title">([\s\S]*?)<\/h1>/i, '<p id="hero-title" class="hero-title">$1</p>');
}
