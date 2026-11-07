// Made-to-order hand crosses (priest-name engraving).
// The factory makes these crosses for each order (with or without a priest name), so every
// line of an eligible cross is made to order and never depends on stock: not on the site's
// stock text, not on a variant quantity, and not on Airtable. Every other product keeps the
// normal stock rules.
// The same rules are mirrored in the browser (checkout-flow.js, product-page.js, script.js).

// Same rule as CrossEngraving.zoneKey in cross-engraving.js.
export function engravingZoneKey(zone) {
  return ["x", "y", "len", "thick", "angle"].map((k) => (Math.round(Number(zone?.[k]) * 10000) / 10000).toString()).join(",");
}

// Customers see engraving only after the admin enabled it AND set the watermarked preview made
// for the current writing area, confirmed the photo, the writing colour and the writing area
// (same rule as CrossEngraving.normalizeSettings).
export function engravingReady(settings) {
  return Boolean(settings && settings.enabled === true && typeof settings.previewImage === "string"
    && /(^|\/)engraving-[^/]*\.webp$/i.test(settings.previewImage)
    && settings.previewWatermark?.zone === engravingZoneKey(settings.zone)
    && settings.photoConfirmed === true
    && /^#[0-9a-f]{6}$/i.test(String(settings.zone?.color || "")) && settings.zone?.confirmed === true);
}

// A product the customer can always order with a name written on it.
export function isMadeToOrderProduct(product) {
  return engravingReady(product?.engraving);
}

// A cart/order line made at the factory for this order: any line of an eligible cross, named or
// not, decided per line from the product (a name, if any, is validated separately).
export function isMadeToOrderLine(product) {
  return isMadeToOrderProduct(product);
}

export const MADE_TO_ORDER_LABEL = "تصنيع مخصوص";
