// Server-side pricing for website orders. Every line is priced from the live catalog with
// the same rules the cart page uses (checkout-flow.js getProductVariants / findVariant /
// variantPrice / isCartLineUnavailable), so an honest order gets exactly the price the
// customer saw, and an edited request cannot lower a price or the total.

const MEDAL_PATTERN = /(?:مادلي|ميدالي|medal)/i;
const MEDAL_VARIANTS = [
  { id: "medal-wood-plywood", title: "خشب كونتر", price: 18, compareAtPrice: 20, discountRate: 0.1, options: { "نوع الخشب": "كونتر" }, available: true },
  { id: "medal-wood-beech", title: "خشب زان", price: 27, compareAtPrice: 30, discountRate: 0.1, options: { "نوع الخشب": "زان" }, available: true }
];
const UNAVAILABLE_STOCK = new Set(["غير متاح حاليا", "Currently unavailable"]);
export const MAX_LINE_QUANTITY = 999;
// The cart page and the server use the same numbers; this only absorbs float rounding.
export const TOTAL_TOLERANCE = 0.5;

function positivePrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function productVariants(product) {
  if (MEDAL_PATTERN.test(String(product?.name || ""))) return MEDAL_VARIANTS;
  if (Array.isArray(product?.variants) && product.variants.length) return product.variants;
  return [{ id: "default", price: positivePrice(product?.price), options: {}, available: product?.stock !== "غير متاح حاليا" }];
}

function findVariant(product, variantId) {
  const variants = productVariants(product);
  return variants.find((variant) => String(variant.id || "default") === String(variantId || "default")) || variants[0];
}

function lineUnavailable(product, variant) {
  if (UNAVAILABLE_STOCK.has(product?.stock) || product?.available === false) return true;
  if (variant?.quantity !== null && variant?.quantity !== undefined && variant?.quantity !== "" && Number(variant.quantity) <= 0) return true;
  return variant?.available === false;
}

// items: normalizeOrderItems(...).items (websiteProductId, sku, variantId, quantity).
// Returns { lines, total, errors }; lines[i] has the server price for items[i].
export function priceOrderItems(items, catalog) {
  const byId = new Map();
  const bySku = new Map();
  for (const product of Array.isArray(catalog) ? catalog : []) {
    if (product?.id !== undefined) byId.set(String(product.id), product);
    if (product?.sku) bySku.set(String(product.sku).trim(), product);
    for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
      if (variant?.sku) bySku.set(String(variant.sku).trim(), product);
    }
  }
  const errors = [];
  const lines = items.map((item, index) => {
    const product = byId.get(String(item.websiteProductId || "")) || bySku.get(String(item.sku || "").trim());
    if (!product) {
      errors.push({ index, code: "product_not_found" });
      return null;
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      errors.push({ index, code: "invalid_quantity" });
      return null;
    }
    const variant = findVariant(product, item.variantId);
    if (lineUnavailable(product, variant)) {
      errors.push({ index, code: "unavailable" });
      return null;
    }
    const stock = variant?.quantity === null || variant?.quantity === undefined || variant?.quantity === "" ? null : Number(variant.quantity);
    if (Number.isFinite(stock) && quantity > stock) {
      errors.push({ index, code: "not_enough_stock" });
      return null;
    }
    const unitPrice = positivePrice(variant?.price ?? product?.price);
    if (unitPrice === null) {
      errors.push({ index, code: "no_price" });
      return null;
    }
    const compareAt = Number(variant?.compareAtPrice);
    const basePrice = Number.isFinite(compareAt) && compareAt >= unitPrice ? compareAt : unitPrice;
    return {
      productId: String(product.id),
      variantId: String(variant?.id || "default"),
      quantity,
      unitPrice,
      basePrice,
      discountValue: basePrice - unitPrice,
      discountRate: Number(variant?.discountRate) || 0,
      lineTotal: unitPrice * quantity
    };
  });
  const total = lines.reduce((sum, line) => sum + (line ? line.lineTotal : 0), 0);
  return { lines, total, errors };
}

// The payment state of a new website order follows from its payment method; the browser
// never sets it. Transfers wait for the shop to check the proof; cash is paid on pickup.
const REVIEW_METHODS = new Set(["InstaPay", "Vodafone Cash", "Online Payment", "Bank Transfer"]);
export const ALLOWED_PAYMENT_METHODS = new Set([...REVIEW_METHODS, "Cash"]);
export const NEW_ORDER_STATUS = "جديد";

export function paymentStatusForMethod(paymentMethod) {
  return REVIEW_METHODS.has(paymentMethod) ? "تحويل للمراجعة" : "غير مدفوع";
}
