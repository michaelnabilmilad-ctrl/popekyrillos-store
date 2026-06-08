const whatsappNumber = "201016125589";
const paymobPaymentLink = "https://accept.paymob.com/payme/popekyrillosstore";
const paymobCheckoutEndpoint = "/api/create-paymob-checkout";
const firebaseSdkVersion = "10.14.1";
const guestCartStorageKey = "pope-kyrillos-cart:guest";
const userCartStoragePrefix = "pope-kyrillos-cart:user:";
const paymentMethods = {
  instapay: {
    label: "إنستاباي / تحويل بنكي",
    note: "حوّل على رقم 01223515989 باسم مايكل نبيل ميلاد، وبعد التحويل ابعت صورة الإيصال على الواتساب.",
    message: "طريقة الدفع: إنستاباي / تحويل بنكي على رقم 01223515989 باسم مايكل نبيل ميلاد. بعد التحويل سأرسل صورة الإيصال.",
    copyText: "إنستاباي / تحويل بنكي\nرقم التحويل: 01223515989\nاسم الحساب: مايكل نبيل ميلاد"
  },
  paymob: {
    label: "Paymob",
    note: "ادفع أونلاين مباشرة ببطاقتك عن طريق Paymob.",
    message: "طريقة الدفع: Paymob Checkout.",
    copyText: "Paymob Checkout\nلينك الدفع الاحتياطي: https://accept.paymob.com/payme/popekyrillosstore"
  }
};

const fallbackProducts = [
  {
    id: "sample-agbeya",
    name: "أجبية فاخرة",
    category: "books",
    label: "كتب وطقوس",
    description: "طباعة واضحة وغلاف متين مناسب للاستخدام اليومي والهدايا.",
    price: 220,
    stock: "متاح",
    badge: "مثال",
    art: "books",
    bg: "#efe6d6",
    bg2: "#d6e5dc",
    fg: "#0c6b68",
    tags: ["غلاف فاخر", "هدية"]
  }
];

let products = [];

const state = {
  filter: "all",
  search: "",
  cart: new Map(),
  paymentMethod: "instapay",
  checkoutBusy: false,
  auth: {
    configured: false,
    ready: false,
    loading: false,
    user: null,
    services: null,
    saveTimer: null
  },
  modal: {
    productId: "",
    selectedOptions: {},
    image: "",
    quantity: 1
  }
};

const formatter = new Intl.NumberFormat("ar-EG");
const productGrid = document.querySelector("[data-products]");
const filterButtons = document.querySelectorAll("[data-filter]");
const searchInput = document.querySelector("#product-search");
const header = document.querySelector(".site-header");
const accountToggle = document.querySelector("[data-account-toggle]");
const accountLabel = document.querySelector("[data-account-label]");
const accountModal = document.querySelector("[data-account-modal]");
const accountClose = document.querySelector("[data-account-close]");
const accountStatus = document.querySelector("[data-account-status]");
const accountUser = document.querySelector("[data-account-user]");
const authProviderList = document.querySelector("[data-auth-provider-list]");
const authProviderButtons = document.querySelectorAll("[data-auth-provider]");
const authSignoutButton = document.querySelector("[data-auth-signout]");
const cartPanel = document.querySelector("[data-cart-panel]");
const cartItems = document.querySelector("[data-cart-items]");
const cartCount = document.querySelector("[data-cart-count]");
const cartTotal = document.querySelector("[data-cart-total]");
const whatsappLink = document.querySelector("[data-whatsapp-link]");
const checkoutLabel = document.querySelector("[data-checkout-label]");
const paymentInputs = document.querySelectorAll("[data-payment-method]");
const paymentSummary = document.querySelector("[data-payment-summary]");
const paymentNote = document.querySelector("[data-payment-note]");
const copyPaymentButton = document.querySelector("[data-copy-payment]");
const paymobFields = document.querySelector("[data-paymob-fields]");
const checkoutNameInput = document.querySelector("[data-checkout-name]");
const checkoutPhoneInput = document.querySelector("[data-checkout-phone]");
const checkoutEmailInput = document.querySelector("[data-checkout-email]");
const toast = document.querySelector("[data-toast]");
const productModal = document.querySelector("[data-product-modal]");
const productModalBody = document.querySelector("[data-product-modal-body]");
const productModalClose = document.querySelector("[data-product-modal-close]");
const imageLightbox = document.querySelector("[data-image-lightbox]");
const imageLightboxImage = document.querySelector("[data-image-lightbox-image]");
const imageLightboxClose = document.querySelector("[data-image-lightbox-close]");
const scrim = document.querySelector("[data-scrim]");
const cartSeparator = "::";

function money(amount) {
  if (amount === null || amount === undefined || amount === "") return "اسأل عن السعر";
  return `${formatter.format(Number(amount))} ج.م`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactText(value = "", maxLength = 150) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function productPrice(product) {
  const value = Number(product.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function variantPrice(variant, product) {
  const value = Number(variant?.price ?? product?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function variantQuantity(variant) {
  const value = Number(variant?.quantity);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function getProduct(id) {
  return products.find((item) => item.id === id);
}

function getProductImages(product) {
  if (Array.isArray(product?.images) && product.images.length) return product.images;
  if (product?.image) return [product.image];
  return [];
}

function getProductVariants(product) {
  if (Array.isArray(product?.variants) && product.variants.length) return product.variants;

  return [
    {
      id: "default",
      title: "الاختيار الأساسي",
      options: {},
      price: productPrice(product),
      available: product?.stock !== "غير متاح حاليا",
      image: product?.image || null
    }
  ];
}

function isVariantAvailable(variant) {
  const quantity = variantQuantity(variant);
  if (quantity !== null) return quantity > 0;
  return variant?.available !== false;
}

function hasProductChoices(product) {
  return Array.isArray(product?.options) && product.options.length > 0;
}

function hasAvailableVariant(product) {
  return getProductVariants(product).some(isVariantAvailable);
}

function variantStockText(variant) {
  if (!isVariantAvailable(variant)) return "غير متاح حاليا";
  const quantity = variantQuantity(variant);
  return quantity === null ? "متاح" : `متاح - ${formatter.format(quantity)} قطعة`;
}

function clampModalQuantity(variant) {
  const requested = Math.max(1, Number(state.modal.quantity) || 1);
  const stock = variantQuantity(variant);
  if (stock === null) return requested;

  const key = cartKey(state.modal.productId, variant?.id || "default");
  const inCart = state.cart.get(key) || 0;
  const remaining = Math.max(0, stock - inCart);
  if (remaining <= 0) return 0;
  return Math.max(1, Math.min(requested, remaining));
}

function productStockText(product) {
  const availableVariants = getProductVariants(product).filter(isVariantAvailable);
  if (!availableVariants.length) return "غير متاح حاليا";

  const quantities = availableVariants.map(variantQuantity).filter((quantity) => quantity !== null);
  if (quantities.length === availableVariants.length && quantities.length) {
    const total = quantities.reduce((sum, quantity) => sum + quantity, 0);
    return `متاح - ${formatter.format(total)} قطعة`;
  }

  return "متاح";
}

function variantOptionText(variant) {
  const options = Object.entries(variant?.options || {});
  return options.map(([name, value]) => `${name}: ${value}`).join("، ");
}

function cartKey(productId, variantId = "default") {
  return `${productId}${cartSeparator}${variantId || "default"}`;
}

function parseCartKey(key) {
  const [productId, variantId = "default"] = String(key).split(cartSeparator);
  return { productId, variantId };
}

function currentCartStorageKey() {
  return state.auth.user?.uid ? `${userCartStoragePrefix}${state.auth.user.uid}` : guestCartStorageKey;
}

function cartPayloadFromMap(map = state.cart) {
  return [...map.entries()]
    .map(([key, qty]) => {
      const { productId, variantId } = parseCartKey(key);
      return {
        productId,
        variantId,
        qty: Number(qty) || 0
      };
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
  second.forEach((qty, key) => {
    merged.set(key, (merged.get(key) || 0) + qty);
  });
  return clampCartMap(merged);
}

function clampCartMap(map) {
  const next = new Map();
  map.forEach((qty, key) => {
    const { productId, variantId } = parseCartKey(key);
    const product = getProduct(productId);
    if (!product && products.length) return;

    const variant = product ? findVariant(product, variantId) : null;
    if (variant && !isVariantAvailable(variant)) return;

    const max = variant ? variantQuantity(variant) : null;
    const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
    next.set(key, max === null ? safeQty : Math.min(safeQty, max));
  });
  return next;
}

function loadCartFromLocal(key = currentCartStorageKey()) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    const data = JSON.parse(raw);
    return cartMapFromPayload(data.items || data);
  } catch (error) {
    console.warn("Could not load saved cart.", error);
    return new Map();
  }
}

function saveCartToLocal(key = currentCartStorageKey(), map = state.cart) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        items: cartPayloadFromMap(map),
        updatedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn("Could not save cart locally.", error);
  }
}

function loadGuestCart() {
  state.cart = loadCartFromLocal(guestCartStorageKey);
}

function findVariant(product, variantId) {
  const variants = getProductVariants(product);
  return variants.find((variant) => variant.id === variantId) || defaultVariant(product);
}

function defaultVariant(product) {
  const variants = getProductVariants(product);
  const available = variants.filter(isVariantAvailable);
  const candidates = available.length ? available : variants;
  const minPrice = productPrice(product);

  if (minPrice !== null) {
    const priced = candidates.find((variant) => variantPrice(variant, product) === minPrice);
    if (priced) return priced;
  }

  return candidates[0];
}

function cleanDescription(description = "") {
  return String(description).split("الاختيارات والأسعار:")[0].trim();
}

function getFilteredProducts() {
  const query = state.search.trim().toLowerCase();
  return products.filter((product) => {
    if (!hasAvailableVariant(product)) return false;
    const matchesCategory = state.filter === "all" || product.category === state.filter;
    const tags = Array.isArray(product.tags) ? product.tags.join(" ") : "";
    const text = `${product.name} ${product.label} ${product.description} ${tags}`.toLowerCase();
    return matchesCategory && (!query || text.includes(query));
  });
}

function renderProducts() {
  const items = getFilteredProducts();

  if (!items.length) {
    productGrid.innerHTML = '<div class="empty-state">لا توجد منتجات مطابقة للبحث الحالي.</div>';
    return;
  }

  productGrid.innerHTML = items
    .map((product) => {
      const tags = Array.isArray(product.tags) ? product.tags : [];
      const galleryImages = getProductImages(product);
      const hasImage = galleryImages.length > 0;
      const hasChoices = hasProductChoices(product);
      const isAvailable = hasAvailableVariant(product);
      const fullDescription = escapeHtml(product.description || "");
      const shortDescription = escapeHtml(compactText(product.description || ""));
      const priceText = product.priceNote || money(product.price);
      const stockText = productStockText(product);
      const productName = escapeHtml(product.name);
      const productId = escapeHtml(product.id);
      const actionLabel = !isAvailable ? "غير متاح" : hasChoices ? "اختار" : "أضف";
      const actionAttribute = hasChoices ? `data-view-product="${productId}"` : `data-add="${productId}"`;
      const disabledAttribute = isAvailable ? "" : "disabled aria-disabled=\"true\"";
      const thumbnails = galleryImages.length > 1
        ? `
          <div class="product-thumbs" aria-label="صور ${productName}">
            ${galleryImages
              .map(
                (image, index) => `
                  <button
                    class="product-thumb ${index === 0 ? "active" : ""}"
                    type="button"
                    data-gallery="${productId}"
                    data-gallery-image="${escapeHtml(image)}"
                    aria-label="عرض صورة ${formatter.format(index + 1)} من ${productName}"
                    aria-pressed="${index === 0 ? "true" : "false"}"
                  >
                    <img src="${escapeHtml(image)}" alt="" loading="lazy" />
                  </button>
                `
              )
              .join("")}
          </div>
        `
        : "";
      const visual = hasImage
        ? `
          <div class="product-gallery ${galleryImages.length > 1 ? "has-thumbs" : ""}">
            <div class="product-gallery-main">
              <img class="product-photo" data-main-image="${productId}" src="${escapeHtml(galleryImages[0])}" alt="${productName}" loading="lazy" />
            </div>
            ${thumbnails}
          </div>
        `
        : `<span class="product-art product-art--${product.art || "icons"}" aria-hidden="true"></span>`;

      return `
        <article class="product-card" data-card-product="${productId}">
          <div class="product-visual ${hasImage ? "has-image" : ""}" style="--visual-bg: ${product.bg || "#efe6d6"}; --visual-bg-2: ${product.bg2 || "#d6e5dc"}; --visual-fg: ${product.fg || "#0c6b68"}">
            <span class="product-badge">${escapeHtml(product.badge || product.stock || "متاح")}</span>
            ${visual}
          </div>
          <div class="product-info">
            <div class="product-meta">
              <span>${escapeHtml(product.label || "منتج")}</span>
              <span class="stock">${escapeHtml(stockText)}</span>
            </div>
            <h3>${productName}</h3>
            <p class="product-summary">${shortDescription}</p>
            <details class="product-details">
              <summary>التفاصيل والأسعار</summary>
              <p>${fullDescription}</p>
            </details>
            <div class="product-tags">
              ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
              ${hasChoices ? "<span>اختيارات</span>" : ""}
            </div>
            <div class="product-bottom">
              <span class="price">${escapeHtml(priceText)}</span>
              <button class="button primary add-button" type="button" ${actionAttribute} ${disabledAttribute}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                ${actionLabel}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function normalizeModalSelection(product, preferredOption = "") {
  const options = Array.isArray(product.options) ? product.options : [];
  const variants = getProductVariants(product);
  const selected = { ...state.modal.selectedOptions };

  if (!options.length) {
    const variant = defaultVariant(product);
    state.modal.selectedOptions = {};
    return variant;
  }

  const exactAvailable = variants.find(
    (variant) =>
      isVariantAvailable(variant) &&
      options.every((option) => variant.options?.[option.name] === selected[option.name])
  );

  if (exactAvailable) {
    state.modal.selectedOptions = { ...exactAvailable.options };
    return exactAvailable;
  }

  const preferredValue = preferredOption ? selected[preferredOption] : "";
  const preferredAvailable = preferredValue
    ? variants.find((variant) => isVariantAvailable(variant) && variant.options?.[preferredOption] === preferredValue)
    : null;
  const fallback = preferredAvailable || defaultVariant(product);
  state.modal.selectedOptions = { ...(fallback?.options || {}) };
  return fallback;
}

function selectedModalVariant(product) {
  return normalizeModalSelection(product);
}

function isOptionValueEnabled(product, optionName, value) {
  const variants = getProductVariants(product).filter(isVariantAvailable);
  if (!variants.length) return false;

  return variants.some((variant) => variant.options?.[optionName] === value);
}

function renderProductModal() {
  const product = getProduct(state.modal.productId);
  if (!product) return;

  const variant = selectedModalVariant(product);
  const images = getProductImages(product);
  const variantImage = variant?.image || "";
  const activeImage = state.modal.image || variantImage || images[0] || "";
  const modalImages = activeImage && !images.includes(activeImage) ? [activeImage, ...images] : images;
  const optionText = variantOptionText(variant);
  const price = variantPrice(variant, product);
  const isAvailable = isVariantAvailable(variant);
  const stockQuantity = variantQuantity(variant);
  const cartQuantity = state.cart.get(cartKey(product.id, variant?.id || "default")) || 0;
  const remainingQuantity = stockQuantity === null ? null : Math.max(0, stockQuantity - cartQuantity);
  state.modal.quantity = clampModalQuantity(variant);
  const modalQuantity = state.modal.quantity;
  const canAddQuantity = isAvailable && (remainingQuantity === null || remainingQuantity > 0);
  const canIncreaseQuantity = canAddQuantity && (remainingQuantity === null || modalQuantity < remainingQuantity);
  const description = cleanDescription(product.description || "");
  const productName = escapeHtml(product.name);

  const media = activeImage
    ? `
      <button
        class="modal-photo-frame modal-photo-zoom"
        type="button"
        data-zoom-image="${escapeHtml(activeImage)}"
        data-zoom-alt="${productName}"
        aria-label="تكبير صورة ${productName}"
      >
        <img class="modal-product-photo" src="${escapeHtml(activeImage)}" alt="${productName}" />
        <span class="zoom-hint">اضغط للتكبير</span>
      </button>
      ${
        modalImages.length > 1
          ? `
            <div class="modal-thumbs" aria-label="صور ${productName}">
              ${modalImages
                .map((image, index) => {
                  const isActive = image === activeImage;
                  return `
                    <button
                      class="modal-thumb ${isActive ? "active" : ""}"
                      type="button"
                      data-modal-image="${escapeHtml(image)}"
                      data-zoom-image="${escapeHtml(image)}"
                      data-zoom-alt="${productName}"
                      aria-label="عرض صورة ${formatter.format(index + 1)} من ${productName}"
                      aria-pressed="${isActive ? "true" : "false"}"
                    >
                      <img src="${escapeHtml(image)}" alt="" loading="lazy" />
                    </button>
                  `;
                })
                .join("")}
            </div>
          `
          : ""
      }
    `
    : `<div class="modal-photo-frame empty"><span class="product-art product-art--${product.art || "icons"}" aria-hidden="true"></span></div>`;

  const optionGroups = hasProductChoices(product)
    ? product.options
        .map(
          (option) => `
            <div class="option-group">
              <h3>${escapeHtml(option.name)}</h3>
              <div class="option-values">
                ${option.values
                  .map((value) => {
                    const active = state.modal.selectedOptions[option.name] === value;
                    const enabled = isOptionValueEnabled(product, option.name, value);
                    return `
                      <button
                        class="option-button ${active ? "active" : ""}"
                        type="button"
                        data-option-name="${escapeHtml(option.name)}"
                        data-option-value="${escapeHtml(value)}"
                        aria-pressed="${active ? "true" : "false"}"
                        ${enabled ? "" : "disabled"}
                      >
                        ${escapeHtml(value)}
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `
        )
        .join("")
    : "";

  productModalBody.innerHTML = `
    <div class="product-modal-media">
      ${media}
    </div>
    <div class="product-modal-copy">
      <p class="eyebrow">${escapeHtml(product.label || "منتج")}</p>
      <h2 id="product-modal-title">${productName}</h2>
      <p class="modal-description">${escapeHtml(description)}</p>
      ${optionGroups ? `<div class="variant-options">${optionGroups}</div>` : ""}
      <div class="variant-summary">
        <span>السعر الحالي</span>
        <strong>${money(price)}</strong>
        <p>${optionText ? escapeHtml(optionText) : "الاختيار الأساسي"} · ${escapeHtml(variantStockText(variant))}</p>
      </div>
      <div class="modal-quantity" aria-label="اختيار عدد القطع">
        <div>
          <span>العدد اللي هيتحط في السلة</span>
          <strong>${formatter.format(modalQuantity)} قطعة</strong>
        </div>
        <div class="quantity-stepper">
          <button
            class="quantity-step"
            type="button"
            data-modal-qty-action="decrease"
            aria-label="تقليل العدد"
            ${modalQuantity <= 1 ? "disabled" : ""}
          >
            -
          </button>
          <output>${formatter.format(modalQuantity)}</output>
          <button
            class="quantity-step"
            type="button"
            data-modal-qty-action="increase"
            aria-label="زيادة العدد"
            ${canIncreaseQuantity ? "" : "disabled"}
          >
            +
          </button>
        </div>
      </div>
      <button
        class="button primary full modal-add"
        type="button"
        data-modal-add="${escapeHtml(product.id)}"
        data-modal-variant="${escapeHtml(variant?.id || "default")}"
        data-modal-quantity="${modalQuantity}"
        ${canAddQuantity ? "" : "disabled aria-disabled=\"true\""}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        أضف ${formatter.format(modalQuantity)} للسلة
      </button>
    </div>
  `;
}

function openProductModal(productId) {
  const product = getProduct(productId);
  if (!product) return;

  const variant = defaultVariant(product);
  state.modal.productId = product.id;
  state.modal.selectedOptions = { ...(variant?.options || {}) };
  state.modal.image = variant?.image || getProductImages(product)[0] || "";
  state.modal.quantity = 1;
  renderProductModal();
  productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("product-open");
  productModalClose.focus();
}

function openImageLightbox(src, alt = "") {
  if (!src) return;
  imageLightboxImage.src = src;
  imageLightboxImage.alt = alt;
  imageLightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("image-zoom-open");
  imageLightboxClose.focus();
}

function closeImageLightbox() {
  document.body.classList.remove("image-zoom-open");
  imageLightbox.setAttribute("aria-hidden", "true");
  imageLightboxImage.removeAttribute("src");
  imageLightboxImage.alt = "";
}

function closeProductModal() {
  closeImageLightbox();
  document.body.classList.remove("product-open");
  productModal.setAttribute("aria-hidden", "true");
  state.modal.productId = "";
  state.modal.selectedOptions = {};
  state.modal.image = "";
  state.modal.quantity = 1;
}

function cartEntries() {
  return [...state.cart.entries()]
    .map(([key, qty]) => {
      const { productId, variantId } = parseCartKey(key);
      const product = getProduct(productId);
      if (!product) return null;

      const variant = findVariant(product, variantId);
      return {
        key,
        product,
        variant,
        qty,
        price: variantPrice(variant, product),
        optionText: variantOptionText(variant)
      };
    })
    .filter(Boolean);
}

function selectedPayment() {
  return paymentMethods[state.paymentMethod] || paymentMethods.instapay;
}

function checkoutCartPayload() {
  return cartEntries().map((item) => ({
    productId: item.product.id,
    variantId: item.variant?.id || "default",
    qty: item.qty
  }));
}

function normalizedPhone(value = "") {
  return String(value).replace(/[^\d+]/g, "").trim();
}

function checkoutCustomer() {
  const name = checkoutNameInput?.value.trim() || "";
  const phone = normalizedPhone(checkoutPhoneInput?.value || "");
  const email = checkoutEmailInput?.value.trim() || "";
  return { name, phone, email };
}

function validatePaymobCustomer() {
  const customer = checkoutCustomer();
  if (!customer.name) {
    checkoutNameInput?.focus();
    showToast("اكتب اسم العميل قبل الدفع");
    return null;
  }
  if (!customer.phone || customer.phone.length < 10) {
    checkoutPhoneInput?.focus();
    showToast("اكتب رقم موبايل صحيح قبل الدفع");
    return null;
  }
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    checkoutEmailInput?.focus();
    showToast("اكتب بريد إلكتروني صحيح أو سيبه فاضي");
    return null;
  }
  return customer;
}

function renderPaymentDetails() {
  const payment = selectedPayment();
  const isPaymob = state.paymentMethod === "paymob";
  const note = isPaymob && paymobPaymentLink
    ? `ادفع عن طريق Paymob من هنا: ${paymobPaymentLink}`
    : payment.note;

  if (paymentSummary) paymentSummary.textContent = payment.label;
  if (paymobFields) {
    paymobFields.hidden = !isPaymob;
    paymobFields.setAttribute("aria-hidden", isPaymob ? "false" : "true");
  }
  if (paymentNote) {
    if (isPaymob) {
      paymentNote.innerHTML = `سيتم فتح صفحة Paymob الرسمية لإتمام الدفع ببطاقة بنكية. <a href="${escapeHtml(paymobPaymentLink)}" target="_blank" rel="noopener">لينك دفع احتياطي</a>`;
    } else {
      paymentNote.textContent = note;
    }
  }

  paymentInputs.forEach((input) => {
    const active = input.value === state.paymentMethod;
    input.checked = active;
    input.closest(".payment-option")?.classList.toggle("active", active);
  });
}

function paymentMessageLine() {
  if (state.paymentMethod === "paymob" && paymobPaymentLink) {
    return `طريقة الدفع: Paymob\nلينك الدفع: ${paymobPaymentLink}`;
  }

  return selectedPayment().message;
}

function copyPaymentDetails() {
  const text = state.paymentMethod === "paymob" && paymobPaymentLink
    ? `Paymob\nلينك الدفع: ${paymobPaymentLink}`
    : selectedPayment().copyText;

  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("تم نسخ بيانات الدفع"))
      .catch(() => showToast(fallbackCopy() ? "تم نسخ بيانات الدفع" : "انسخ بيانات الدفع من السلة"));
    return;
  }

  showToast(fallbackCopy() ? "تم نسخ بيانات الدفع" : "انسخ بيانات الدفع من السلة");
}

async function startPaymobCheckout() {
  const items = checkoutCartPayload();
  if (!items.length) {
    showToast("السلة فارغة حاليا");
    return;
  }

  const customer = validatePaymobCustomer();
  if (!customer) return;
  if (state.checkoutBusy) return;

  state.checkoutBusy = true;
  renderCart();

  try {
    const response = await fetch(paymobCheckoutEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, customer })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.checkoutUrl) {
      throw new Error(data.message || "تعذر فتح Paymob checkout");
    }

    window.location.href = data.checkoutUrl;
  } catch (error) {
    console.warn("Paymob checkout failed, opening fallback payment link.", error);
    showToast("تعذر فتح checkout، هفتح لينك Paymob الاحتياطي");
    window.location.href = paymobPaymentLink;
  } finally {
    state.checkoutBusy = false;
    renderCart();
  }
}

function renderCart() {
  renderPaymentDetails();
  const entries = cartEntries();
  const count = entries.reduce((sum, item) => sum + item.qty, 0);
  const total = entries.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0);
  const hasUnpriced = entries.some((item) => item.price === null);

  cartCount.textContent = count;
  cartTotal.textContent = hasUnpriced ? `${money(total)} + منتجات بسعر عند التواصل` : money(total);

  if (!entries.length) {
    cartItems.innerHTML = '<div class="empty-state">السلة فارغة حاليا.</div>';
    whatsappLink.setAttribute("href", "#");
    if (checkoutLabel) checkoutLabel.textContent = "إرسال الطلب";
    return;
  }

  cartItems.innerHTML = entries
    .map(
      (item) => `
        <article class="cart-item">
          <div>
            <h3>${escapeHtml(item.product.name)}</h3>
            ${item.optionText ? `<p class="cart-variant">${escapeHtml(item.optionText)}</p>` : ""}
            <p>${money(item.price)} × ${formatter.format(item.qty)}</p>
          </div>
          <div class="qty-control" aria-label="تعديل كمية ${escapeHtml(item.product.name)}">
            <button type="button" data-qty="${escapeHtml(item.key)}" data-delta="-1" aria-label="تقليل الكمية">−</button>
            <span>${formatter.format(item.qty)}</span>
            <button type="button" data-qty="${escapeHtml(item.key)}" data-delta="1" aria-label="زيادة الكمية">+</button>
          </div>
        </article>
      `
    )
    .join("");

  const orderLines = entries
    .map((item) => {
      const priceText = item.price === null ? "السعر عند التواصل" : `${formatter.format(item.price)} ج.م`;
      const selected = item.optionText ? ` (${item.optionText})` : "";
      return `- ${item.product.name}${selected}: ${formatter.format(item.qty)} × ${priceText}`;
    })
    .join("\n");
  const message = `مرحباً، أريد طلب المنتجات التالية من مكتبة البابا كيرلس:\n${orderLines}\nالإجمالي التقريبي للمنتجات المسعرة: ${formatter.format(total)} ج.م\n${paymentMessageLine()}`;
  if (state.paymentMethod === "paymob") {
    whatsappLink.href = paymobPaymentLink;
    if (checkoutLabel) checkoutLabel.textContent = state.checkoutBusy ? "جاري فتح Paymob..." : "ادفع Paymob الآن";
  } else {
    whatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    if (checkoutLabel) checkoutLabel.textContent = "إرسال الطلب";
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function firebaseConfig() {
  return window.POPE_KYRILLOS_FIREBASE_CONFIG || {};
}

function hasFirebaseConfig() {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function renderAuthState() {
  const user = state.auth.user;
  const configured = state.auth.configured;
  const displayName = user?.displayName || user?.email || "عميل";

  if (accountLabel) accountLabel.textContent = user ? displayName.split(/\s+/)[0] : "دخول";
  if (accountToggle) {
    accountToggle.setAttribute("aria-label", user ? `حساب ${displayName}` : "تسجيل الدخول");
  }

  if (accountUser) {
    accountUser.hidden = !user;
    accountUser.textContent = user ? `مسجل الدخول: ${displayName}` : "";
  }

  if (authProviderList) authProviderList.hidden = Boolean(user);
  if (authSignoutButton) authSignoutButton.hidden = !user;

  authProviderButtons.forEach((button) => {
    button.disabled = !configured || state.auth.loading;
  });

  if (!accountStatus) return;
  if (!configured) {
    accountStatus.textContent = "السلة محفوظة تلقائيا على هذا الجهاز. تسجيل الدخول بجوجل أو فيسبوك يحتاج إضافة بيانات Firebase في الموقع.";
  } else if (state.auth.loading) {
    accountStatus.textContent = "جاري تجهيز تسجيل الدخول...";
  } else if (user) {
    accountStatus.textContent = "سلتك محفوظة على حسابك، ولو فتحت الموقع مرة تانية بنفس الحساب هتلاقيها موجودة.";
  } else {
    accountStatus.textContent = "ادخل بحسابك عشان السلة تفضل محفوظة وتقدر تكمل طلبك بسهولة في أي وقت.";
  }
}

function openAccountModal() {
  renderAuthState();
  accountModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("account-open");
  accountClose?.focus();
}

function closeAccountModal() {
  accountModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("account-open");
}

function saveCartNow({ remote = true } = {}) {
  state.cart = clampCartMap(state.cart);
  saveCartToLocal(currentCartStorageKey(), state.cart);
  if (remote) queueRemoteCartSave();
}

function queueRemoteCartSave() {
  if (!state.auth.user || !state.auth.services?.db) return;
  window.clearTimeout(state.auth.saveTimer);
  state.auth.saveTimer = window.setTimeout(saveRemoteCart, 350);
}

async function saveRemoteCart() {
  const services = state.auth.services;
  const user = state.auth.user;
  if (!services?.db || !user) return;

  try {
    await services.setDoc(
      services.doc(services.db, "customerCarts", user.uid),
      {
        items: cartPayloadFromMap(),
        updatedAt: services.serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.warn("Could not save remote cart.", error);
  }
}

async function loadRemoteCart(user) {
  const services = state.auth.services;
  if (!services?.db || !user) return new Map();

  try {
    const snapshot = await services.getDoc(services.doc(services.db, "customerCarts", user.uid));
    if (!snapshot.exists()) return new Map();
    return cartMapFromPayload(snapshot.data().items || []);
  } catch (error) {
    console.warn("Could not load remote cart.", error);
    return new Map();
  }
}

async function applySignedInCart(user) {
  const guestCart = loadCartFromLocal(guestCartStorageKey);
  const userLocalCart = loadCartFromLocal(`${userCartStoragePrefix}${user.uid}`);
  const remoteCart = await loadRemoteCart(user);
  const merged = mergeCartMaps(mergeCartMaps(remoteCart, userLocalCart), guestCart);

  state.cart = merged;
  saveCartToLocal(`${userCartStoragePrefix}${user.uid}`, state.cart);
  try {
    localStorage.removeItem(guestCartStorageKey);
  } catch {
    // Local storage cleanup is best-effort.
  }
  renderCart();
  queueRemoteCartSave();
}

async function initCustomerAuth() {
  state.auth.configured = hasFirebaseConfig();
  renderAuthState();
  if (!state.auth.configured) return;

  state.auth.loading = true;
  renderAuthState();

  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${firebaseSdkVersion}/firebase-firestore.js`)
    ]);

    const app = appModule.initializeApp(firebaseConfig());
    const auth = authModule.getAuth(app);
    await authModule.setPersistence(auth, authModule.browserLocalPersistence);

    state.auth.services = {
      auth,
      db: firestoreModule.getFirestore(app),
      GoogleAuthProvider: authModule.GoogleAuthProvider,
      FacebookAuthProvider: authModule.FacebookAuthProvider,
      signInWithPopup: authModule.signInWithPopup,
      signInWithRedirect: authModule.signInWithRedirect,
      signOut: authModule.signOut,
      onAuthStateChanged: authModule.onAuthStateChanged,
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      setDoc: firestoreModule.setDoc,
      serverTimestamp: firestoreModule.serverTimestamp
    };

    state.auth.services.onAuthStateChanged(auth, async (user) => {
      state.auth.user = user;
      state.auth.loading = false;
      renderAuthState();
      if (user) {
        await applySignedInCart(user);
      } else {
        loadGuestCart();
        renderCart();
      }
    });
  } catch (error) {
    state.auth.loading = false;
    state.auth.configured = false;
    console.warn("Could not initialize Firebase auth.", error);
    renderAuthState();
  }
}

function authProvider(providerName) {
  const services = state.auth.services;
  if (!services) return null;
  if (providerName === "google") return new services.GoogleAuthProvider();
  if (providerName === "facebook") return new services.FacebookAuthProvider();
  return null;
}

async function signInWithProvider(providerName) {
  const services = state.auth.services;
  const provider = authProvider(providerName);
  if (!services || !provider) {
    showToast("تسجيل الدخول يحتاج إعداد Firebase أولا");
    return;
  }

  try {
    state.auth.loading = true;
    renderAuthState();
    await services.signInWithPopup(services.auth, provider);
    closeAccountModal();
  } catch (error) {
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request") {
      await services.signInWithRedirect(services.auth, provider);
      return;
    }
    state.auth.loading = false;
    renderAuthState();
    console.warn("Sign in failed.", error);
    showToast("تعذر تسجيل الدخول، راجع إعدادات Firebase");
  }
}

async function signOutCustomer() {
  const services = state.auth.services;
  if (!services?.auth) return;
  saveCartNow();
  await saveRemoteCart();
  await services.signOut(services.auth);
  closeAccountModal();
  showToast("تم تسجيل الخروج");
}

function addToCart(productId, variantId = "", amount = 1) {
  const product = getProduct(productId);
  if (!product) return;

  const variant = variantId ? findVariant(product, variantId) : defaultVariant(product);
  if (!isVariantAvailable(variant)) {
    showToast("الاختيار ده غير متاح حاليا");
    return;
  }

  const key = cartKey(product.id, variant?.id || "default");
  const currentQty = state.cart.get(key) || 0;
  const quantity = variantQuantity(variant);
  const requestedAmount = Math.max(1, Number(amount) || 1);
  const nextQty = currentQty + requestedAmount;
  if (quantity !== null && nextQty > quantity) {
    showToast("وصلت للكمية المتاحة من الاختيار ده");
    return;
  }

  state.cart.set(key, nextQty);
  renderCart();
  saveCartNow();
  const selected = variantOptionText(variant);
  showToast(`تمت إضافة ${formatter.format(requestedAmount)} من ${product.name}${selected ? ` - ${selected}` : ""} إلى السلة`);
}

function changeQty(key, delta) {
  if (delta > 0) {
    const { productId, variantId } = parseCartKey(key);
    const product = getProduct(productId);
    const variant = product ? findVariant(product, variantId) : null;
    const quantity = variantQuantity(variant);
    if (quantity !== null && (state.cart.get(key) || 0) >= quantity) {
      showToast("وصلت للكمية المتاحة من الاختيار ده");
      return;
    }
  }

  const nextQty = (state.cart.get(key) || 0) + delta;
  if (nextQty <= 0) {
    state.cart.delete(key);
  } else {
    state.cart.set(key, nextQty);
  }
  renderCart();
  saveCartNow();
}

function openCart() {
  document.body.classList.add("cart-open");
  cartPanel.setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  cartPanel.setAttribute("aria-hidden", "true");
}

async function loadProducts() {
  try {
    const response = await fetch("products.json?v=incense-chat-20260607", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    products = await response.json();
  } catch (error) {
    console.warn("Could not load products.json, using fallback products.", error);
    products = fallbackProducts;
  }
  state.cart = clampCartMap(state.cart);
  saveCartToLocal(currentCartStorageKey(), state.cart);
  renderProducts();
  renderCart();
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderProducts();
  });
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const thumb = event.target.closest("[data-gallery-image]");
  if (thumb) {
    const card = thumb.closest(".product-card");
    const mainImage = card?.querySelector("[data-main-image]");
    if (!mainImage) return;
    mainImage.src = thumb.dataset.galleryImage;
    card.querySelectorAll("[data-gallery-image]").forEach((button) => {
      const active = button === thumb;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    return;
  }

  const viewButton = event.target.closest("[data-view-product]");
  if (viewButton) {
    openProductModal(viewButton.dataset.viewProduct);
    return;
  }

  const button = event.target.closest("[data-add]");
  if (button) {
    addToCart(button.dataset.add);
    return;
  }

  if (event.target.closest(".product-details")) return;

  const card = event.target.closest("[data-card-product]");
  if (card) openProductModal(card.dataset.cardProduct);
});

productModal.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-product-modal-close]");
  if (closeButton) {
    closeProductModal();
    return;
  }

  const zoomButton = event.target.closest("[data-zoom-image]");
  if (zoomButton) {
    const image = zoomButton.dataset.zoomImage;
    if (zoomButton.dataset.modalImage) {
      state.modal.image = image;
      renderProductModal();
    }
    openImageLightbox(image, zoomButton.dataset.zoomAlt || "");
    return;
  }

  const imageButton = event.target.closest("[data-modal-image]");
  if (imageButton) {
    state.modal.image = imageButton.dataset.modalImage;
    renderProductModal();
    return;
  }

  const optionButton = event.target.closest("[data-option-name]");
  if (optionButton) {
    const product = getProduct(state.modal.productId);
    if (!product) return;
    state.modal.selectedOptions = {
      ...state.modal.selectedOptions,
      [optionButton.dataset.optionName]: optionButton.dataset.optionValue
    };
    const variant = normalizeModalSelection(product, optionButton.dataset.optionName);
    state.modal.image = variant?.image || state.modal.image;
    state.modal.quantity = 1;
    renderProductModal();
    return;
  }

  const quantityButton = event.target.closest("[data-modal-qty-action]");
  if (quantityButton) {
    const product = getProduct(state.modal.productId);
    if (!product) return;
    const variant = selectedModalVariant(product);
    const delta = quantityButton.dataset.modalQtyAction === "increase" ? 1 : -1;
    state.modal.quantity = clampModalQuantity(variant);
    state.modal.quantity = Math.max(1, state.modal.quantity + delta);
    state.modal.quantity = clampModalQuantity(variant);
    renderProductModal();
    return;
  }

  const addButton = event.target.closest("[data-modal-add]");
  if (addButton) {
    addToCart(addButton.dataset.modalAdd, addButton.dataset.modalVariant, addButton.dataset.modalQuantity);
    state.modal.quantity = 1;
    renderProductModal();
  }
});

imageLightbox.addEventListener("click", (event) => {
  if (event.target === imageLightbox || event.target.closest("[data-image-lightbox-close]")) {
    closeImageLightbox();
  }
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-qty]");
  if (!button) return;
  changeQty(button.dataset.qty, Number(button.dataset.delta));
});

paymentInputs.forEach((input) => {
  input.addEventListener("change", () => {
    state.paymentMethod = input.value;
    renderPaymentDetails();
    renderCart();
  });
});

copyPaymentButton?.addEventListener("click", copyPaymentDetails);

accountToggle?.addEventListener("click", openAccountModal);
accountClose?.addEventListener("click", closeAccountModal);
authProviderButtons.forEach((button) => {
  button.addEventListener("click", () => signInWithProvider(button.dataset.authProvider));
});
authSignoutButton?.addEventListener("click", signOutCustomer);

whatsappLink.addEventListener("click", (event) => {
  if (state.paymentMethod !== "paymob") return;
  event.preventDefault();
  startPaymobCheckout();
});

document.querySelector(".cart-toggle").addEventListener("click", openCart);
document.querySelector(".cart-close").addEventListener("click", closeCart);
scrim.addEventListener("click", () => {
  closeCart();
  closeProductModal();
  closeAccountModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (document.body.classList.contains("image-zoom-open")) {
      closeImageLightbox();
      return;
    }
    closeCart();
    closeProductModal();
    closeAccountModal();
  }
});

document.querySelector("[data-contact-form]").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = form.get("name");
  const phone = form.get("phone");
  const requestType = form.get("requestType");
  const message = form.get("message") || "لا توجد تفاصيل إضافية";
  const body = `مرحباً، أنا ${name}%0Aرقمي: ${phone}%0Aنوع الطلب: ${requestType}%0Aالتفاصيل: ${message}`;
  window.open(`https://wa.me/${whatsappNumber}?text=${body}`, "_blank", "noopener");
});

window.addEventListener("scroll", () => {
  header.dataset.elevated = window.scrollY > 24 ? "true" : "false";
});

loadGuestCart();
renderAuthState();
initCustomerAuth();
loadProducts();
