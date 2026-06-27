const whatsappNumber = "201016125589";
const paymobIntentionEndpointPath = "/api/create-paymob-intention";
const bostaDeliveryEndpointPath = "/api/create-bosta-delivery";
const guestCartStorageKey = "pope-kyrillos-cart:guest";
const userCartStoragePrefix = "pope-kyrillos-cart:user:";
const checkoutStorageKey = "pope-kyrillos-checkout";
const cartSeparator = "::";

const formatter = new Intl.NumberFormat("ar-EG");
let products = [];
let cart = new Map();
let customer = loadCustomer();

const translations = {
  available: "متاح",
  askPrice: "اسأل عن السعر",
  emptyCart: "السلة فارغة حاليا.",
  total: "الإجمالي",
  productsTotal: "إجمالي المنتجات",
  continueShopping: "الرجوع للتسوق",
  checkout: "إدخال بيانات الاستلام",
  continuePayment: "الذهاب للدفع",
  updateCart: "تم تحديث السلة",
  remove: "حذف",
  quantity: "الكمية",
  detailsRequired: "اكتب بيانات الاستلام الأول",
  invalidPhone: "اكتب رقم موبايل صحيح",
  invalidEmail: "اكتب بريد إلكتروني صحيح أو سيبه فاضي",
  governorateRequired: "اختار المحافظة",
  cityRequired: "اكتب المدينة أو المنطقة",
  addressRequired: "اكتب العنوان بالتفصيل",
  bostaNote: "الشحن مع بوسطا يتم تأكيده حسب العنوان.",
  pickupNote: "استلام من الفرع بدون شحن.",
  paymobBusy: "جاري فتح Paymob...",
  paymobFailed: "تعذر فتح Paymob الآن. حاول مرة أخرى.",
  sendOrder: "إرسال الطلب",
  payPaymob: "ادفع Paymob الآن",
  copied: "تم النسخ",
  bostaBusy: "جاري إنشاء شحنة بوسطا...",
  bostaFailed: "تعذر إنشاء شحنة بوسطا الآن. هنرسل الطلب وتقدر تتابعه يدويًا.",
  bostaReady: "تم إنشاء شحنة بوسطا",
  bostaReferenceLine: "رقم شحنة بوسطا: {reference}"
};

function t(key) {
  return translations[key] || key;
}

function text(key, values = {}) {
  return Object.entries(values).reduce((message, [name, value]) => message.replaceAll(`{${name}}`, value), t(key));
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return t("askPrice");
  return `${formatter.format(amount)} ج.م`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cartKey(productId, variantId = "default") {
  return `${productId}${cartSeparator}${variantId || "default"}`;
}

function parseCartKey(key) {
  const [productId, variantId = "default"] = String(key).split(cartSeparator);
  return { productId, variantId };
}

function cartPayloadFromMap(map = cart) {
  return [...map.entries()]
    .map(([key, qty]) => {
      const { productId, variantId } = parseCartKey(key);
      return { productId, variantId, qty: Number(qty) || 0 };
    })
    .filter((item) => item.productId && item.qty > 0);
}

function cartMapFromPayload(items = []) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  items.forEach((item) => {
    const productId = item.productId || parseCartKey(item.key || "").productId;
    const variantId = item.variantId || parseCartKey(item.key || "").variantId || "default";
    const qty = Number(item.qty);
    if (!productId || !Number.isFinite(qty) || qty <= 0) return;
    map.set(cartKey(productId, variantId), Math.floor(qty));
  });
  return map;
}

function mergeCartMaps(first, second) {
  const merged = new Map(first);
  second.forEach((qty, key) => merged.set(key, (merged.get(key) || 0) + qty));
  return merged;
}

function loadCartKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const data = JSON.parse(raw);
    return cartMapFromPayload(data.items || data);
  } catch {
    return new Map();
  }
}

function loadCart() {
  let next = loadCartKey(guestCartStorageKey);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    if (key.startsWith(userCartStoragePrefix)) next = mergeCartMaps(next, loadCartKey(key));
  }
  return next;
}

function saveCart() {
  localStorage.setItem(
    guestCartStorageKey,
    JSON.stringify({ items: cartPayloadFromMap(), updatedAt: new Date().toISOString() })
  );
}

function loadCustomer() {
  try {
    return JSON.parse(localStorage.getItem(checkoutStorageKey) || "{}");
  } catch {
    return {};
  }
}

function saveCustomer(next) {
  customer = next;
  localStorage.setItem(checkoutStorageKey, JSON.stringify(next));
}

function getProduct(id) {
  return products.find((item) => item.id === id);
}

function productPrice(product) {
  const value = Number(product?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getProductVariants(product) {
  if (Array.isArray(product?.variants) && product.variants.length) return product.variants;
  return [{ id: "default", price: productPrice(product), options: {}, available: product?.stock !== "غير متاح حاليا" }];
}

function findVariant(product, variantId = "default") {
  return getProductVariants(product).find((variant) => String(variant.id || "default") === String(variantId)) || getProductVariants(product)[0];
}

function variantPrice(variant, product) {
  const value = Number(variant?.price ?? product?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function variantOptionText(variant) {
  const options = Object.entries(variant?.options || {});
  return options.map(([name, value]) => `${name}: ${value}`).join("، ");
}

function productImage(product) {
  if (Array.isArray(product?.images) && product.images[0]) return product.images[0];
  return product?.image || "";
}

function cartEntries() {
  return [...cart.entries()]
    .map(([key, qty]) => {
      const { productId, variantId } = parseCartKey(key);
      const product = getProduct(productId);
      if (!product) return null;
      const variant = findVariant(product, variantId);
      return { key, product, variant, qty, price: variantPrice(variant, product), optionText: variantOptionText(variant) };
    })
    .filter(Boolean);
}

function cartTotal() {
  return cartEntries().reduce((sum, item) => sum + (item.price || 0) * item.qty, 0);
}

function setCartCount() {
  const count = [...cart.values()].reduce((sum, qty) => sum + qty, 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => {
    node.textContent = formatter.format(count);
  });
}

function renderOrderSummary(targetSelector = "[data-order-summary]") {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  const entries = cartEntries();
  if (!entries.length) {
    target.innerHTML = `<p class="checkout-empty">${t("emptyCart")}</p>`;
    return;
  }
  target.innerHTML = `
    <div class="checkout-summary-list">
      ${entries
        .map((item) => {
          const image = productImage(item.product);
          const lineTotal = item.price === null ? t("askPrice") : money(item.price * item.qty);
          return `
            <article class="checkout-summary-item">
              ${image ? `<img src="${escapeHtml(image)}" alt="" width="72" height="72" loading="lazy" decoding="async" />` : ""}
              <div>
                <h3>${escapeHtml(item.product.name)}</h3>
                ${item.optionText ? `<p>${escapeHtml(item.optionText)}</p>` : ""}
                <span>${t("quantity")}: ${formatter.format(item.qty)}</span>
              </div>
              <strong>${lineTotal}</strong>
            </article>
          `;
        })
        .join("")}
    </div>
    <div class="checkout-summary-total">
      <span>${t("productsTotal")}</span>
      <strong>${money(cartTotal())}</strong>
    </div>
  `;
}

function renderCartPage() {
  const list = document.querySelector("[data-cart-page-items]");
  if (!list) return;
  const entries = cartEntries();
  if (!entries.length) {
    list.innerHTML = `<p class="checkout-empty">${t("emptyCart")}</p>`;
    document.querySelector("[data-cart-page-total]").textContent = money(0);
    document.querySelector("[data-cart-next]")?.setAttribute("aria-disabled", "true");
    return;
  }
  list.innerHTML = entries
    .map((item) => {
      const image = productImage(item.product);
      const unitPrice = item.price === null ? t("askPrice") : money(item.price);
      return `
        <article class="cart-page-item">
          ${image ? `<img src="${escapeHtml(image)}" alt="" width="96" height="96" loading="lazy" decoding="async" />` : ""}
          <div>
            <h2>${escapeHtml(item.product.name)}</h2>
            ${item.optionText ? `<p>${escapeHtml(item.optionText)}</p>` : ""}
            <span>${unitPrice}</span>
          </div>
          <div class="cart-page-actions">
            <div class="qty-control">
              <button type="button" data-cart-delta="-1" data-cart-key="${escapeHtml(item.key)}">-</button>
              <span>${formatter.format(item.qty)}</span>
              <button type="button" data-cart-delta="1" data-cart-key="${escapeHtml(item.key)}">+</button>
            </div>
            <button type="button" class="cart-remove" data-cart-remove="${escapeHtml(item.key)}">${t("remove")}</button>
          </div>
        </article>
      `;
    })
    .join("");
  document.querySelector("[data-cart-page-total]").textContent = money(cartTotal());
  document.querySelector("[data-cart-next]")?.removeAttribute("aria-disabled");
}

function bindCartPage() {
  const list = document.querySelector("[data-cart-page-items]");
  if (!list) return;
  document.querySelector("[data-cart-next]")?.addEventListener("click", (event) => {
    if (!cartEntries().length) event.preventDefault();
  });
  list.addEventListener("click", (event) => {
    const deltaButton = event.target.closest("[data-cart-delta]");
    const removeButton = event.target.closest("[data-cart-remove]");
    if (deltaButton) {
      const key = deltaButton.dataset.cartKey;
      const next = (cart.get(key) || 0) + Number(deltaButton.dataset.cartDelta || 0);
      if (next <= 0) cart.delete(key);
      else cart.set(key, next);
    }
    if (removeButton) cart.delete(removeButton.dataset.cartRemove);
    saveCart();
    renderCartPage();
    setCartCount();
  });
}

function checkoutFormValues() {
  const deliveryMethod = document.querySelector("[name='deliveryMethod']:checked")?.value || "bosta";
  return {
    deliveryMethod,
    name: document.querySelector("[data-checkout-name]")?.value.trim() || "",
    phone: String(document.querySelector("[data-checkout-phone]")?.value || "").replace(/[^\d+]/g, "").trim(),
    email: document.querySelector("[data-checkout-email]")?.value.trim() || "",
    governorate: document.querySelector("[data-checkout-governorate]")?.value.trim() || "",
    city: document.querySelector("[data-checkout-city]")?.value.trim() || "",
    address: document.querySelector("[data-checkout-address]")?.value.trim() || "",
    notes: document.querySelector("[data-checkout-notes]")?.value.trim() || ""
  };
}

function validateCustomer(next) {
  if (!next.name) return "اكتب اسم العميل";
  if (!next.phone || next.phone.length < 10) return t("invalidPhone");
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return t("invalidEmail");
  if (next.deliveryMethod === "bosta") {
    if (!next.governorate) return t("governorateRequired");
    if (!next.city) return t("cityRequired");
    if (!next.address) return t("addressRequired");
  }
  return "";
}

function fillCheckoutForm() {
  if (!document.querySelector("[data-checkout-form]")) return;
  document.querySelector(`[name='deliveryMethod'][value='${customer.deliveryMethod || "bosta"}']`)?.click();
  const fields = {
    "[data-checkout-name]": customer.name,
    "[data-checkout-phone]": customer.phone,
    "[data-checkout-email]": customer.email,
    "[data-checkout-governorate]": customer.governorate,
    "[data-checkout-city]": customer.city,
    "[data-checkout-address]": customer.address,
    "[data-checkout-notes]": customer.notes
  };
  Object.entries(fields).forEach(([selector, value]) => {
    const node = document.querySelector(selector);
    if (node && value) node.value = value;
  });
  updateShippingFields();
}

function updateShippingFields() {
  const needsShipping = (document.querySelector("[name='deliveryMethod']:checked")?.value || "bosta") === "bosta";
  const shipping = document.querySelector("[data-shipping-fields]");
  if (shipping) shipping.hidden = !needsShipping;
  const note = document.querySelector("[data-delivery-note]");
  if (note) note.textContent = needsShipping ? t("bostaNote") : t("pickupNote");
}

function bindCheckoutPage() {
  const form = document.querySelector("[data-checkout-form]");
  if (!form) return;
  form.addEventListener("change", updateShippingFields);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = checkoutFormValues();
    const error = validateCustomer(next);
    const status = document.querySelector("[data-checkout-status]");
    if (error) {
      if (status) status.textContent = error;
      return;
    }
    saveCustomer(next);
    window.location.href = "payment.html";
  });
}

function paymentMessageLine(paymentMethod) {
  if (paymentMethod === "paymob") return "طريقة الدفع: Paymob Checkout.";
  if (paymentMethod === "pickupCash") return "طريقة الاستلام والدفع: استلام من الفرع، والدفع كاش بعد تجهيز الأوردر والتأكيد.";
  return "طريقة الدفع: إنستاباي / تحويل بنكي على رقم 01223515989 باسم مايكل نبيل ميلاد. بعد التحويل سأرسل صورة الإيصال.";
}

function bostaReferenceLine(delivery = {}) {
  const reference =
    delivery.bostaReference ||
    delivery.trackingNumber ||
    delivery.awbNumber ||
    delivery.trackingCode ||
    delivery._id ||
    delivery.id ||
    delivery.businessReference ||
    "";
  return reference ? text("bostaReferenceLine", { reference }) : "";
}

async function createBostaDelivery(paymentMethod) {
  if (customer.deliveryMethod !== "bosta") return null;
  const response = await fetch(bostaDeliveryEndpointPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: cartPayloadFromMap(),
      customer,
      paymentMethod
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || data.message || t("bostaFailed"));
  return data;
}

function shippingMessageLine() {
  const email = customer.email ? `\nالبريد الإلكتروني: ${customer.email}` : "";
  const notes = customer.notes ? `\nملاحظات: ${customer.notes}` : "";
  if (customer.deliveryMethod === "pickup") {
    return `طريقة الاستلام: استلام من الفرع\nبيانات الاستلام:\nالاسم: ${customer.name}\nالموبايل: ${customer.phone}${email}${notes}`;
  }
  return `طريقة الاستلام: شحن مع بوسطا\nبيانات الشحن:\nالاسم: ${customer.name}\nالموبايل: ${customer.phone}\nالمحافظة: ${customer.governorate}\nالمدينة/المنطقة: ${customer.city}\nالعنوان: ${customer.address}${email}${notes}`;
}

function orderLines() {
  return cartEntries()
    .map((item) => {
      const price = item.price === null ? t("askPrice") : money(item.price);
      return `- ${item.product.name}${item.optionText ? ` (${item.optionText})` : ""}: ${formatter.format(item.qty)} × ${price}`;
    })
    .join("\n");
}

function whatsappOrderUrl(paymentMethod, extra = "") {
  const note = customer.deliveryMethod === "bosta" ? t("bostaNote") : t("pickupNote");
  const body = `مرحباً، أريد طلب المنتجات التالية من مكتبة البابا كيرلس:\n${orderLines()}\nإجمالي المنتجات المسعرة: ${money(cartTotal())}\n${note}\n${shippingMessageLine()}${extra ? `\n${extra}` : ""}\n${paymentMessageLine(paymentMethod)}`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(body)}`;
}

async function startPaymob(button) {
  const items = cartPayloadFromMap();
  if (!items.length) return;
  button.disabled = true;
  button.textContent = t("paymobBusy");
  try {
    const response = await fetch(paymobIntentionEndpointPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, customer, language: "ar" })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error || !data.checkoutUrl) throw new Error(data.message || data.error || t("paymobFailed"));
    window.location.href = data.checkoutUrl;
  } catch (error) {
    const status = document.querySelector("[data-payment-status]");
    if (status) status.textContent = error.message || t("paymobFailed");
    button.disabled = false;
    button.textContent = t("payPaymob");
  }
}

function bindPaymentPage() {
  const page = document.querySelector("[data-payment-page]");
  if (!page) return;
  const missingCustomer = validateCustomer(customer);
  if (missingCustomer) {
    window.location.href = "checkout.html";
    return;
  }
  document.querySelectorAll("[data-payment-action]").forEach((button) => {
    if (button.dataset.paymentAction === "pickupCash" && customer.deliveryMethod !== "pickup") {
      button.disabled = true;
      button.closest("article")?.classList.add("payment-option-disabled");
      return;
    }
    button.addEventListener("click", () => {
      const method = button.dataset.paymentAction;
      if (method === "paymob") {
        startPaymob(button);
        return;
      }
      const sendOrder = async () => {
        const status = document.querySelector("[data-payment-status]");
        let extraLine = "";
        button.disabled = true;
        try {
          if (customer.deliveryMethod === "bosta") {
            if (status) status.textContent = t("bostaBusy");
            const result = await createBostaDelivery(method);
            extraLine = bostaReferenceLine(result) || bostaReferenceLine(result.delivery);
            if (status) status.textContent = extraLine ? `${t("bostaReady")} - ${extraLine}` : t("bostaReady");
          }
        } catch (error) {
          if (status) status.textContent = error.message || t("bostaFailed");
          extraLine = t("bostaFailed");
        } finally {
          button.disabled = false;
        }
        window.open(whatsappOrderUrl(method, extraLine), "_blank", "noopener");
      };
      sendOrder();
    });
  });
  const copyButton = document.querySelector("[data-copy-instapay]");
  copyButton?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText("إنستاباي / تحويل بنكي\nرقم التحويل: 01223515989\nاسم الحساب: مايكل نبيل ميلاد");
    const status = document.querySelector("[data-payment-status]");
    if (status) status.textContent = t("copied");
  });
}

async function initCheckoutFlow() {
  cart = loadCart();
  setCartCount();
  try {
    const response = await fetch(`products.json?v=${Date.now()}`, { cache: "no-store" });
    products = await response.json();
  } catch {
    products = [];
  }
  if (!cartEntries().length && !location.pathname.endsWith("/cart.html")) {
    window.location.href = "cart.html";
    return;
  }
  renderCartPage();
  renderOrderSummary();
  fillCheckoutForm();
  bindCartPage();
  bindCheckoutPage();
  bindPaymentPage();
}

initCheckoutFlow();
