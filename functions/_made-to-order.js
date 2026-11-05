// Made-to-order hand crosses (priest-name engraving).
// The factory makes and engraves these crosses for each order, so a line that carries a
// validated name never depends on stock: not on the site's stock text, not on a variant
// quantity, and not on Airtable. A line WITHOUT a name follows the normal stock rules.
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

// A cart/order line made for this customer: it carries engraving details AND the product has
// engraving switched on. The details themselves are validated separately (language, length, font).
export function isMadeToOrderLine(product, engraving) {
  return Boolean(engraving && typeof engraving === "object" && isMadeToOrderProduct(product));
}

export const MADE_TO_ORDER_LABEL = "تصنيع مخصوص";
