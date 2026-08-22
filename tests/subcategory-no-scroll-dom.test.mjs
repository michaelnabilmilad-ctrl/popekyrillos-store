import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM, ResourceLoader, VirtualConsole } from "jsdom";

const root = process.cwd();
const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
const crossProducts = products.filter((product) => product.mainCategory === "crosses" && product.available !== false);
const subcategoryCounts = crossProducts.reduce((counts, product) => {
  counts[product.subcategory] = (counts[product.subcategory] || 0) + 1;
  return counts;
}, {});

class LocalAssets extends ResourceLoader {
  fetch(url) {
    const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "");
    if (!/\.(?:js|css)$/i.test(pathname)) return null;
    const filename = path.resolve(root, pathname === "script.min.js" ? "script.js" : pathname);
    if (!filename.startsWith(root) || !fs.existsSync(filename)) return null;
    return Promise.resolve(fs.readFileSync(filename));
  }
}

function catalogResponse(authoritativeCounts = subcategoryCounts) {
  const items = crossProducts.slice(0, 24).map((product) => ({
    ...product,
    category: product.mainCategory,
    subcategory: product.subcategory,
    availability: "available",
    thumbnail: product.image || product.images?.[0] || ""
  }));
  const total = Object.values(authoritativeCounts).reduce((sum, count) => sum + count, 0);
  return { items, page: 1, limit: 24, total, hasMore: crossProducts.length > 24, categoryCounts: { crosses: total }, subcategoryCounts: authoritativeCounts };
}

async function coldLoadWithoutScroll(viewportWidth, authoritativeCounts = subcategoryCounts) {
  let scrollEvents = 0;
  const dom = await JSDOM.fromFile(path.join(root, "index.html"), {
    url: "https://local.test/category/crosses#catalog",
    runScripts: "dangerously",
    resources: new LocalAssets(),
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: viewportWidth });
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.addEventListener("scroll", () => { scrollEvents += 1; });
      window.fetch = async (input) => {
        const url = new URL(String(input), window.location.origin);
        if (url.pathname === "/api/catalog") return new Response(JSON.stringify(catalogResponse(authoritativeCounts)), { status: 200, headers: { "Content-Type": "application/json" } });
        if (url.pathname === "/api/best-sellers") return new Response(JSON.stringify({ items: [] }), { status: 200 });
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      };
    }
  });

  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 2_000;
    const expectedCardCount = Object.values(authoritativeCounts).filter((count) => count > 0).length + 1;
    const inspect = () => {
      const cards = dom.window.document.querySelectorAll("[data-subcategory-card]");
      if (cards.length === expectedCardCount) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`Expected ${expectedCardCount} cards before scroll, found ${cards.length}`));
      setImmediate(inspect);
    };
    inspect();
  });
  const ids = [...dom.window.document.querySelectorAll("[data-subcategory-card]")].map((card) => card.dataset.subcategoryCard);
  dom.window.close();
  return { ids, scrollEvents };
}

test("only populated subcategories render immediately on desktop and mobile", async () => {
  const expectedIds = ["", ...Object.keys(subcategoryCounts).filter((id) => subcategoryCounts[id] > 0)];
  for (const viewportWidth of [375, 768, 1440]) {
    const result = await coldLoadWithoutScroll(viewportWidth);
    assert.deepEqual(new Set(result.ids), new Set(expectedIds));
    assert.equal(result.scrollEvents, 0);
  }
});

test("complete counts show beyond-page-one products and hide zero-count subcategories", async () => {
  const newlyPopulated = await coldLoadWithoutScroll(375, { ...subcategoryCounts, "brass-crosses": 1 });
  assert.ok(newlyPopulated.ids.includes("brass-crosses"));
  const emptiedCounts = { ...subcategoryCounts };
  delete emptiedCounts["pectoral-crosses"];
  const emptied = await coldLoadWithoutScroll(375, emptiedCounts);
  assert.ok(!emptied.ids.includes("pectoral-crosses"));
  assert.ok(emptied.ids.includes("processional-crosses"));
});
