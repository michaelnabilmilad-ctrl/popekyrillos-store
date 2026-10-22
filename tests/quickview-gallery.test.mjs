// Quick view must show the full gallery even though /api/catalog cards carry
// variants (added for the price-range filter) but only one thumbnail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { extractFunction } from "./helpers/storefront-sandbox.mjs";

const scriptSource = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const catalogData = JSON.parse(fs.readFileSync(new URL("../products.json", import.meta.url), "utf8"));
const fullProducts = Array.isArray(catalogData) ? catalogData : catalogData.products;
const fullProduct = (id) => structuredClone(fullProducts.find((product) => product.id === id));

const FUNCTIONS = [
  "getProduct", "hasFreshProductDetails", "hasProductDetails", "loadProductDetails",
  "getProductImages", "uniqueImages", "getVariantImages", "modalGalleryImages",
  "openProductModal", "closeProductModal"
];

// Same shape as cloudflare-worker.js catalogDto() after the client mapping in loadCatalogPage().
function catalogCard(product) {
  const thumbnail = `/assets/thumbnails/320/${product.id}.webp`;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    variants: product.variants,
    thumbnail,
    availability: "available",
    category: product.subcategory,
    subcategory: product.subcategory,
    collections: [],
    image: thumbnail,
    stock: "متاح"
  };
}

function storefront({ catalog = [], staticCatalog = null, bestSellers = [], details = fullProducts } = {}) {
  const requests = [];
  const pending = [];
  const context = {
    console: { warn() {}, error() {} }, Date, Math, JSON, Map, Set, Number, String, Array, Object, Promise, Error,
    encodeURIComponent,
    products: catalog,
    staticCatalogProducts: staticCatalog,
    bestSellerProducts: bestSellers,
    productDetailsCache: new Map(),
    productDetailsRequests: new Map(),
    productDetailsFetchedAt: new Map(),
    productDetailsMaxAgeMs: 5 * 60 * 1000,
    productModalOpenSequence: 0,
    holdRequests: false,
    navigatedTo: "",
    rendered: [],
    state: { modal: {}, cart: new Map() },
    window: { scrollY: 0, location: { assign(url) { context.navigatedTo = url; } } },
    busyCards: [],
    CSS: { escape: (value) => String(value).replace(/["\\]/g, "\\$&") },
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelectorAll(selector) {
        const card = {
          selector,
          setAttribute(name, value) { context.busyCards.push(`${selector} ${name}=${value}`); },
          removeAttribute(name) { context.busyCards.push(`${selector} -${name}`); }
        };
        return [card];
      }
    },
    productModal: { inert: true, setAttribute() {} },
    productModalClose: { focus() {} },
    fetch(url) {
      requests.push(url);
      const id = decodeURIComponent(url.slice("/api/products/".length));
      const product = details.find((item) => item.id === id || item.slug === id);
      const response = product
        ? { ok: true, status: 200, json: async () => structuredClone(product) }
        : { ok: false, status: 404, json: async () => ({}) };
      if (!context.holdRequests) return Promise.resolve(response);
      return new Promise((resolve) => pending.push(() => resolve(response)));
    },
    findVariant(product, variantId) {
      return (product.variants || []).find((variant) => variant.id === variantId) || context.defaultVariant(product);
    },
    defaultVariant(product) { return (product.variants || [])[0] || null; },
    selectedModalVariant(product) { return context.findVariant(product, context.state.modal.variantId); },
    canonicalProductPath(product) { return `/products/${product.slug}`; },
    renderProductModal() {
      const product = context.getProduct(context.state.modal.productId);
      context.rendered.push({ productId: product.id, images: context.modalGalleryImages(product) });
    },
    closeImageLightbox() {},
    updatePageMeta() {},
    clearProductUrl() {},
    setProductUrl() {},
    trackStoreEvent() {},
    analyticsProduct() { return {}; }
  };
  vm.createContext(context);
  vm.runInContext(FUNCTIONS.map((name) => extractFunction(scriptSource, name)).join("\n\n"), context);
  return {
    context,
    requests,
    release() { pending.splice(0).forEach((resolve) => resolve()); },
    // Copy out of the sandbox realm so deepStrictEqual compares plain arrays.
    lastGallery() { return [...(context.rendered.at(-1)?.images || [])]; },
    selectVariant(variantId) {
      context.state.modal.variantId = variantId;
      context.state.modal.image = context.findVariant(context.getProduct(context.state.modal.productId), variantId)?.image || context.state.modal.image;
      context.renderProductModal();
    }
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("catalog and best-seller cards are not mistaken for full product records", () => {
  const altar = fullProduct("old-9762682011955");
  const card = catalogCard(altar);
  const bestSeller = { ...card, ...altar, images: [card.thumbnail], variants: card.variants };
  const tab = storefront({ catalog: [card], bestSellers: [bestSeller] });
  assert.equal(tab.context.hasProductDetails(card), false);
  assert.equal(tab.context.hasProductDetails(bestSeller), false);
  assert.equal(tab.context.hasProductDetails(null), false);
});

test("the static products.json fallback already has every image and needs no request", async () => {
  const altar = fullProduct("old-9762682011955");
  const tab = storefront({ catalog: [altar], staticCatalog: [altar] });
  await tab.context.openProductModal(altar.id);
  assert.equal(tab.requests.length, 0);
  assert.equal(tab.lastGallery().length, 5);
});

test("Greek altar vessel set shows all four gallery photos plus the chosen cup size", async () => {
  const altar = fullProduct("old-9762682011955");
  const tab = storefront({ catalog: [catalogCard(altar)] });
  await tab.context.openProductModal(altar.id, { variantId: "old-51620385882419" });

  assert.deepEqual(tab.requests, ["/api/products/old-9762682011955"]);
  assert.deepEqual(tab.lastGallery(), [
    "assets/optimized/products/gallery/041-9762682011955-01.webp",
    ...altar.images
  ]);
  assert.ok(tab.lastGallery().includes("assets/optimized/products/gallery/product-78-3-20260705061653-c60736.webp"), "tray with dome");
  assert.ok(tab.lastGallery().includes("assets/optimized/products/gallery/product-78-4-20260705061658-b5d4ff.webp"), "tray alone");
  assert.ok(!tab.lastGallery().some((image) => image.includes("/thumbnails/")), "no card thumbnail in the gallery");

  tab.selectVariant("old-51620385915187");
  assert.deepEqual(tab.lastGallery(), [
    "assets/optimized/products/gallery/041-9762682011955-02.webp",
    ...altar.images
  ], "half-litre keeps its own photo and the whole gallery");
});

test("multi-image product with per-variant photos keeps every image once, in order", async () => {
  const cover = fullProduct("old-10121173303603");
  const tab = storefront({ catalog: [catalogCard(cover)] });
  await tab.context.openProductModal(cover.id);
  const gallery = tab.lastGallery();
  const variantImage = cover.variants[0].image;
  assert.equal(gallery[0], variantImage);
  assert.deepEqual(gallery.filter((image) => image !== variantImage), cover.images.filter((image) => image !== variantImage));
  assert.equal(new Set(gallery).size, gallery.length, "no duplicates");
});

test("multi-image product without variant photos shows the gallery in its saved order", async () => {
  const jug = fullProduct("old-10067794067763");
  const tab = storefront({ catalog: [catalogCard(jug)] });
  await tab.context.openProductModal(jug.id);
  assert.deepEqual(tab.lastGallery(), jug.images);
});

test("single-image product and product without size choices still open with their one photo", async () => {
  for (const id of ["atb3ho-10618130956453", "old-9762774024499"]) {
    const product = fullProduct(id);
    const tab = storefront({ catalog: [catalogCard(product)] });
    await tab.context.openProductModal(id);
    assert.deepEqual(tab.lastGallery(), uniqueList([...(product.variants[0]?.images || []), ...product.images]), id);
  }
});

test("legacy record without variants uses its image list", async () => {
  const legacy = { id: "legacy-1", slug: "legacy-1", name: "x", image: "assets/a.webp", images: ["assets/a.webp", "assets/b.webp"] };
  const tab = storefront({ catalog: [{ id: "legacy-1", slug: "legacy-1", name: "x", image: "/assets/thumbnails/320/legacy-1.webp" }], details: [legacy] });
  await tab.context.openProductModal("legacy-1");
  assert.deepEqual(tab.lastGallery(), ["assets/a.webp", "assets/b.webp"]);
});

test("details load once per product and are refreshed after five minutes", async () => {
  const altar = fullProduct("old-9762682011955");
  const tab = storefront({ catalog: [catalogCard(altar)] });
  await tab.context.openProductModal(altar.id);
  tab.context.closeProductModal({ updateUrl: false });
  await tab.context.openProductModal(altar.id);
  assert.equal(tab.requests.length, 1, "reopening uses the cached details");

  const old = Date.now() - 5 * 60 * 1000 - 1;
  tab.context.productDetailsFetchedAt.forEach((_, key) => tab.context.productDetailsFetchedAt.set(key, old));
  await tab.context.openProductModal(altar.id);
  assert.equal(tab.requests.length, 2, "stale details are fetched again for current price and stock");
});

test("simultaneous opens share one request", async () => {
  const altar = fullProduct("old-9762682011955");
  const tab = storefront({ catalog: [catalogCard(altar)] });
  tab.context.holdRequests = true;
  const first = tab.context.openProductModal(altar.id);
  const second = tab.context.openProductModal(altar.id);
  tab.release();
  await Promise.all([first, second]);
  assert.equal(tab.requests.length, 1);
});

test("a slow product cannot replace a product opened after it", async () => {
  const altar = fullProduct("old-9762682011955");
  const jug = fullProduct("old-10067794067763");
  const tab = storefront({ catalog: [catalogCard(altar), catalogCard(jug)] });
  tab.context.holdRequests = true;
  const slow = tab.context.openProductModal(altar.id);
  const fast = tab.context.openProductModal(jug.id);
  tab.release();
  await Promise.all([slow, fast]);
  await flush();
  assert.equal(tab.context.state.modal.productId, jug.id);
  assert.ok(tab.context.rendered.every((entry) => entry.productId === jug.id));
});

test("closing while details load cancels the pending quick view", async () => {
  const altar = fullProduct("old-9762682011955");
  const tab = storefront({ catalog: [catalogCard(altar)] });
  tab.context.holdRequests = true;
  const opening = tab.context.openProductModal(altar.id);
  tab.context.closeProductModal({ updateUrl: false });
  tab.release();
  await opening;
  assert.equal(tab.context.rendered.length, 0);
});

test("the clicked card shows it is loading only while details are fetched", async () => {
  const altar = fullProduct("old-9762682011955");
  const tab = storefront({ catalog: [catalogCard(altar)] });
  await tab.context.openProductModal(altar.id);
  assert.deepEqual([...tab.context.busyCards], [
    '[data-card-product="old-9762682011955"] aria-busy=true',
    '[data-card-product="old-9762682011955"] -aria-busy'
  ]);
  tab.context.closeProductModal({ updateUrl: false });
  await tab.context.openProductModal(altar.id);
  assert.equal(tab.context.busyCards.length, 2, "cached details open without a loading state");
});

test("full records price from their cheapest size, like the Worker", () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(["productHasVariants", "productPrice"].map((name) => extractFunction(scriptSource, name)).join("\n\n"), context);
  // Its saved top-level price (26500) lags behind the size prices (36000 / 30000).
  assert.equal(context.productPrice(fullProduct("old-9762682011955")), 30000);
  assert.equal(context.productPrice({ price: 120, variants: [{ id: "default", price: 120 }] }), 120);
  assert.equal(context.productPrice({ price: "450" }), 450);
  assert.equal(context.productPrice({ price: 0 }), null);
});

test("a failed details request falls back to the full product page", async () => {
  const altar = fullProduct("old-9762682011955");
  const tab = storefront({ catalog: [catalogCard(altar)], details: [] });
  await tab.context.openProductModal(altar.id);
  assert.equal(tab.context.navigatedTo, `/products/${altar.slug}`);
  assert.equal(tab.context.rendered.length, 0);
});

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}
