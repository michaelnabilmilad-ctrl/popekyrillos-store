// One availability rule everywhere a customer can buy: the product page, the
// catalog / Quick View, the cart page and the order system must agree on every
// combination of stock flag, option flag, quantity and price.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { purchasableOffers } from "../functions/_order-pricing.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const page = read("product-page.js");
const store = read("script.js");
const cart = read("checkout-flow.js");

// product-page.js reads the page's product from a top-level const.
const pageRule = (product) => new Function("product",
  `${extract(page, "available")}\n${extract(page, "pageDefaultVariant")}\nreturn { available, pageDefaultVariant };`)(product);

const storeRule = new Function("productHasVariants", "isIotaMedalProduct", "productPrice",
  `${extract(store, "variantQuantity")}\n${extract(store, "isProductUnavailable")}\n${extract(store, "isVariantAvailable")}\n${extract(store, "getProductVariants")}\nreturn { isVariantAvailable, getProductVariants };`);

const cartRule = new Function(`${extract(cart, "variantPrice")}\n${extract(cart, "isCartLineUnavailable")}\nreturn { isCartLineUnavailable };`)();

// What each surface says about a product's option `variantIndex` (or the product itself without options).
function verdicts(product, { withOptions }) {
  const { available, pageDefaultVariant } = pageRule(product);
  const storefront = storeRule(() => withOptions, () => false, (item) => Number(item?.price) || null);
  const storeVariants = storefront.getProductVariants(product);
  const variant = product.variants[0];
  const order = purchasableOffers(product)[0];
  return {
    page: available(withOptions ? variant : pageDefaultVariant(product)),
    catalog: storefront.isVariantAvailable(storeVariants[0], product),
    cart: !cartRule.isCartLineUnavailable(product, variant),
    order: order.available && order.price !== null
  };
}

const stocks = ["متاح", "غير متاح حاليا"];
const flags = [undefined, true, false];
const quantities = [null, undefined, "", 0, "0", 3, "3"];
const prices = [120, 0, null];

test("every surface agrees on every stock / flag / quantity / price combination", () => {
  let cases = 0;
  for (const withOptions of [true, false]) {
    for (const stock of stocks) for (const flag of flags) for (const quantity of quantities) for (const price of prices) {
      const variant = { id: "v1", price, quantity, options: withOptions ? { "المقاس": "صغير" } : {} };
      if (flag !== undefined) variant.available = flag;
      const product = { id: "p1", name: "منتج اختبار", price: price ?? 0, stock, hasVariants: withOptions, variants: [variant] };
      const result = verdicts(product, { withOptions });
      const label = JSON.stringify({ withOptions, stock, flag, quantity, price });
      assert.equal(result.page, result.order, `product page vs orders ${label}`);
      assert.equal(result.catalog, result.order, `catalog vs orders ${label}`);
      assert.equal(result.cart, result.order, `cart vs orders ${label}`);
      cases += 1;
    }
  }
  assert.equal(cases, 2 * 2 * 3 * 7 * 3);
});

test("the rule itself: untracked quantity sells, explicit flags and zero stock do not", () => {
  const product = (variant, extra = {}) => ({ id: "p", name: "قنديل", price: 100, stock: "متاح", hasVariants: true, variants: [{ id: "v", price: 100, ...variant }], ...extra });
  const buyable = (p) => verdicts(p, { withOptions: true }).order;
  assert.equal(buyable(product({ quantity: null })), true, "null quantity = not tracked");
  assert.equal(buyable(product({ quantity: 0 })), false);
  assert.equal(buyable(product({ quantity: 10, available: false })), false, "the option flag wins over leftover stock");
  assert.equal(buyable(product({ quantity: 10 }, { stock: "غير متاح حاليا" })), false, "the product flag wins");
  assert.equal(buyable(product({ quantity: null, price: 0 }, { price: 0 })), false, "no chargeable price, no sale");
});
