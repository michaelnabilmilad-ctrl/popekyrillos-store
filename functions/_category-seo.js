// Category page SEO content: one renderer for every category and subcategory.
//
// Content comes from the live taxonomy first (optional fields an admin can set
// on a category or subcategory: seoTitle, seoDescription, seoIntro,
// seoRelated) and falls back to the defaults below. A page with neither keeps
// the generated title and description and shows no intro.

import { escapeHtml, truncateText } from "./_seo.js";

// Keyed by "<categoryId>/<subcategoryId>" or "<categoryId>".
export const categorySeoDefaults = {
  "altar-vessels/censers": {
    seoTitle: "شوريات كنسية نحاس وستانلس | مكتبة البابا كيرلس",
    seoDescription: "تصفح شوريات كنسية من النحاس والستانلس، بتصميمات قبطية ويونانية ومقاسات متنوعة، بالإضافة إلى حامل شوريات نحاس ومستلزمات التبخير من مكتبة البابا كيرلس.",
    seoIntro: "اكتشف مجموعة الشوريات الكنسية في مكتبة البابا كيرلس، وتشمل شوريات من النحاس والستانلس بتصميمات قبطية ويونانية، وبمقاسات متنوعة للاستخدام في الكنيسة وتبريك المنازل. يتوفر أيضًا حامل شوريات نحاس بارتفاع 180 سم، ويمكنك استكمال مستلزمات التبخير من أقسام [علب البخور](/category/altar-vessels/custom-subcategory-1793199421562) و[البخور الكنسي](/category/candles-lamps/church-incense).",
    seoRelated: [
      "altar-vessels/custom-subcategory-1793199421562",
      "candles-lamps/church-incense",
      "candles-lamps/incense-boxes",
      "candles-lamps/incense-spoons"
    ]
  }
};

const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const INTERNAL_PATH = /^\/(?:category|products)\/[^\s"'<>]+$/u;

export function categorySeoKey(categoryId = "", subcategoryId = "") {
  return subcategoryId ? `${categoryId}/${subcategoryId}` : String(categoryId || "");
}

// Merged SEO content of a route: taxonomy fields win over the defaults, field by field.
export function categorySeoContent({ categoryId, subcategoryId, category, subcategory }) {
  const key = categorySeoKey(categoryId, subcategoryId);
  const own = (subcategoryId ? subcategory : category) || {};
  const fallback = categorySeoDefaults[key] || {};
  const pick = (field) => text(own[field]) || text(fallback[field]);
  const related = Array.isArray(own.seoRelated) && own.seoRelated.length ? own.seoRelated : fallback.seoRelated || [];
  return {
    key,
    seoTitle: pick("seoTitle"),
    seoDescription: pick("seoDescription") ? truncateText(pick("seoDescription")) : "",
    seoIntro: pick("seoIntro"),
    seoRelated: related.map(text).filter(Boolean)
  };
}

// Plain text with optional [label](/category/...) or [label](/products/...) links.
// Everything is escaped; only internal store paths become links.
export function introHtml(intro = "") {
  let html = "";
  let last = 0;
  for (const match of String(intro).matchAll(/\[([^\]\n]{1,80})\]\(([^)\s]{1,300})\)/gu)) {
    html += escapeHtml(intro.slice(last, match.index));
    const [, label, path] = match;
    html += INTERNAL_PATH.test(path) ? `<a href="${escapeHtml(path)}">${escapeHtml(label)}</a>` : escapeHtml(label);
    last = match.index + match[0].length;
  }
  return html + escapeHtml(String(intro).slice(last));
}

// Server-rendered heading of a category page, inside the existing catalog
// header: shown without waiting for JavaScript, with the intro under the H1.
// On phones the intro shows two lines and a «اقرأ المزيد» toggle (CSS only, so
// nothing moves after load); the full text is always in the page.
export function setCategoryHeading(html, { title, breadcrumb, intro, key }) {
  const introBlock = intro
    ? `\n          <div class="category-intro-wrap" data-category-intro="${escapeHtml(key)}"><input type="checkbox" id="category-intro-more" class="category-intro-more" aria-label="عرض الوصف كاملًا"><p class="category-intro">${introHtml(intro)}</p><label for="category-intro-more" class="category-intro-toggle" aria-hidden="true"></label></div>`
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
