const rawProduct = JSON.parse(document.querySelector("#product-data")?.textContent || "{}");
const product = window.enrichYotaColorProduct ? window.enrichYotaColorProduct(rawProduct) : rawProduct;
const root = document.querySelector("#product-detail");
const relatedRoot = document.querySelector("[data-related-products]");
const cartCount = document.querySelector("[data-cart-count]");
const cartKey = "pope-kyrillos-cart:guest";
const legacyColoringStorageKey = `pope-kyrillos-coloring:${product.id || "product"}`;
let coloringStorageKey = `yota-coloring-design-${product.coloringModelId || "unconfigured"}:${product.coloringModelVersion || "unversioned"}:${product.id || "product"}`;
const yotaColors = Array.isArray(window.YOTA_COLORS) ? window.YOTA_COLORS : [];
const yotaColorById = new Map(yotaColors.map((color) => [color.id, color]));
const yotaColorByHex = new Map(yotaColors.map((color) => [color.hex.toUpperCase(), color]));
let currentColoringDesign = null;
let currentMedalPreviewImage = "";
let refreshColoringWoodPreview = null;
let medalPreviewRequest = 0;

function createCustomizationId() {
  return globalThis.crypto?.randomUUID?.() || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

const text = (value) => typeof value === "object" && value ? value.ar || value.en || Object.values(value)[0] || "" : String(value || "");
const money = (value) => Number.isFinite(Number(value)) ? `${new Intl.NumberFormat("ar-EG").format(Number(value))} ج.م` : "";
const escapeHtml = (value) => String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const assetUrl = (value) => {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    const absolute = new URL(source.startsWith("//") ? `${location.protocol}${source}` : source, location.origin);
    absolute.pathname = absolute.pathname.split("/").map((segment) => {
      try { return encodeURIComponent(decodeURIComponent(segment)); }
      catch { return encodeURIComponent(segment); }
    }).join("/");
    return absolute.href;
  } catch (error) {
    console.error("[coloring-game] Invalid coloring file URL", { productId: product.id || "", productSlug: product.slug || "", source, error });
    return "";
  }
};
const images = [...new Set([...(product.images || []), product.image].filter(Boolean))];
const isMedalProduct = /(?:مادلي|ميدالي|medal)/i.test(text(product.name));
const medalWoodOptionName = "نوع الخشب";
const medalWoodVariants = [
  { id: "medal-wood-plywood", title: "خشب كونتر", price: 18, compareAtPrice: 20, discountRate: 0.1, available: true, options: { [medalWoodOptionName]: "كونتر" } },
  { id: "medal-wood-beech", title: "خشب زان", price: 27, compareAtPrice: 30, discountRate: 0.1, available: true, options: { [medalWoodOptionName]: "زان" } }
];
const variants = isMedalProduct
  ? medalWoodVariants
  : Array.isArray(product.variants) && product.variants.length
    ? product.variants
    : [{ id:"default", price:product.price, available:product.stock !== "غير متاح حاليا", options:{} }];
const options = isMedalProduct
  ? [{ name: medalWoodOptionName, values: ["كونتر", "زان"], required: true }]
  : Array.isArray(product.options) ? product.options : [];
let coloringRegions = Array.isArray(product.coloringRegions) ? product.coloringRegions : [];
let regionByMaskKey = new Map(coloringRegions.map((region) => [region.maskColor.join(","), region.id]));
let coloringShapeGroups = Array.isArray(product.shapeGroups) ? product.shapeGroups : [];
const hasColoringGame = Boolean(
  product.coloringBaseImageUrl &&
  product.coloringMaskUrl &&
  product.coloringOutlineUrl &&
  (product.coloringRegionsUrl || coloringRegions.length)
);
let selected = isMedalProduct ? null : variants.find((variant) => variant.available !== false) || variants[0];
let activeImage = images[0] || "";
let routeLightbox = null;
let routeZoom = { scale: 1, x: 0, y: 0, pointers: new Map(), gesture: null };

function selectedWoodVariantId() {
  return selected?.id || "";
}

function isBeechSelected() {
  return selectedWoodVariantId() === "medal-wood-beech";
}

function compactCanvasPreview(sourceCanvas, maxSize = 480) {
  const scale = Math.min(1, maxSize / Math.max(sourceCanvas.width, sourceCanvas.height));
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  preview.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  preview.getContext("2d").drawImage(sourceCanvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL("image/jpeg", 0.78);
}

function showMedalPreview(source, alt = text(product.name)) {
  const main = root.querySelector("[data-main]");
  if (!main || !source) return;
  main.innerHTML = `<img class="" src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" width="800" height="800" decoding="async">`;
}

function applyBeechToPhotoPixels(imageData) {
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const saturation = maximum ? (maximum - minimum) / maximum : 0;
    const looksLikeWood = red >= green && green > blue && red - blue > 22 &&
      red > 92 && green > 72 && blue > 42 && saturation > 0.11 && saturation < 0.58;
    if (!looksLikeWood) continue;
    const luminance = red * 0.30 + green * 0.59 + blue * 0.11;
    const grain = Math.sin((index / 4 % imageData.width) * 0.075) * 2.4 +
      Math.sin(Math.floor(index / 4 / imageData.width) * 0.032) * 1.8;
    const light = Math.max(0, Math.min(1, (luminance - 70) / 180));
    pixels[index] = Math.round(190 + light * 43 + grain);
    pixels[index + 1] = Math.round(143 + light * 55 + grain * 0.7);
    pixels[index + 2] = Math.round(82 + light * 53 + grain * 0.35);
  }
  return imageData;
}

async function updateMedalPhotoPreview() {
  if (!isMedalProduct || hasColoringGame && refreshColoringWoodPreview) {
    refreshColoringWoodPreview?.();
    return;
  }
  const requestId = ++medalPreviewRequest;
  if (!isBeechSelected()) {
    currentMedalPreviewImage = assetUrl(activeImage);
    showMedalPreview(currentMedalPreviewImage);
    return;
  }
  try {
    const source = await loadImage(activeImage);
    if (requestId !== medalPreviewRequest || !isBeechSelected()) return;
    const preview = document.createElement("canvas");
    preview.width = source.naturalWidth;
    preview.height = source.naturalHeight;
    const previewContext = preview.getContext("2d", { willReadFrequently: true });
    previewContext.drawImage(source, 0, 0);
    const pixels = previewContext.getImageData(0, 0, preview.width, preview.height);
    previewContext.putImageData(applyBeechToPhotoPixels(pixels), 0, 0);
    currentMedalPreviewImage = compactCanvasPreview(preview);
    showMedalPreview(preview.toDataURL("image/jpeg", 0.92));
  } catch (error) {
    console.warn("Could not render the beech medal preview.", error);
    currentMedalPreviewImage = assetUrl(activeImage);
    showMedalPreview(currentMedalPreviewImage);
  }
}

function productThumbnailUrl(width = 640) {
  const thumbnail = String(product.thumbnail || "");
  if (!thumbnail.includes("/assets/thumbnails/320/")) return "";
  return assetUrl(thumbnail.replace("/assets/thumbnails/320/", `/assets/thumbnails/${width}/`));
}

function imageMarkup(source, index, className = "", purpose = "thumbnail") {
  const isPrimaryProductImage = String(source || "") === String(images[0] || "");
  const responsive = isPrimaryProductImage && productThumbnailUrl(640)
    ? [320, 480, 640].map((width) => `${escapeHtml(productThumbnailUrl(width))} ${width}w`).join(", ")
    : "";
  const displaySource = responsive ? productThumbnailUrl(purpose === "main" ? 640 : 320) : assetUrl(source);
  const loading = purpose === "main" ? 'fetchpriority="high"' : 'loading="lazy"';
  const sizes = responsive ? ` srcset="${responsive}" sizes="${purpose === "main" ? "(max-width: 760px) calc(100vw - 32px), 540px" : "72px"}"` : "";
  return `<img class="${className}" src="${escapeHtml(displaySource)}"${sizes} alt="${index === 0 ? escapeHtml(text(product.name)) : ""}" width="800" height="800" ${loading} decoding="async">`;
}

function applyRouteZoom() {
  if (!routeLightbox) return;
  const stage = routeLightbox.querySelector(".image-lightbox-stage");
  const image = routeLightbox.querySelector("[data-image-lightbox-image]");
  if (routeZoom.scale <= 1) {
    routeZoom.x = 0;
    routeZoom.y = 0;
  } else {
    const maxX = Math.max(0, (image.offsetWidth * routeZoom.scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * routeZoom.scale - stage.clientHeight) / 2);
    routeZoom.x = Math.max(-maxX, Math.min(maxX, routeZoom.x));
    routeZoom.y = Math.max(-maxY, Math.min(maxY, routeZoom.y));
  }
  image.style.transform = `translate3d(${routeZoom.x}px, ${routeZoom.y}px, 0) scale(${routeZoom.scale})`;
  stage.classList.toggle("is-zoomed", routeZoom.scale > 1);
}

function setRouteZoom(nextScale, clientX, clientY) {
  const previousScale = routeZoom.scale;
  const scale = Math.max(1, Math.min(5, Number(nextScale) || 1));
  const stage = routeLightbox?.querySelector(".image-lightbox-stage");
  if (stage && Number.isFinite(clientX) && Number.isFinite(clientY) && scale !== previousScale) {
    const bounds = stage.getBoundingClientRect();
    const pointX = clientX - (bounds.left + bounds.width / 2);
    const pointY = clientY - (bounds.top + bounds.height / 2);
    const ratio = scale / previousScale;
    routeZoom.x = pointX - (pointX - routeZoom.x) * ratio;
    routeZoom.y = pointY - (pointY - routeZoom.y) * ratio;
  }
  routeZoom.scale = scale;
  applyRouteZoom();
}

function resetRouteZoom() {
  routeZoom = { scale: 1, x: 0, y: 0, pointers: new Map(), gesture: null };
  routeLightbox?.querySelector(".image-lightbox-stage")?.classList.remove("is-dragging");
  applyRouteZoom();
}

function closeRouteLightbox() {
  if (!routeLightbox) return;
  routeLightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("image-zoom-open");
  resetRouteZoom();
}

function ensureRouteLightbox() {
  if (routeLightbox) return routeLightbox;
  routeLightbox = document.createElement("section");
  routeLightbox.className = "image-lightbox";
  routeLightbox.setAttribute("aria-hidden", "true");
  routeLightbox.innerHTML = `
    <button class="icon-button image-lightbox-close" type="button" data-image-lightbox-close aria-label="إغلاق الصورة المكبرة">×</button>
    <div class="image-lightbox-stage"><img data-image-lightbox-image alt="" decoding="async" draggable="false"></div>`;
  document.body.appendChild(routeLightbox);
  const stage = routeLightbox.querySelector(".image-lightbox-stage");
  const image = routeLightbox.querySelector("[data-image-lightbox-image]");
  routeLightbox.addEventListener("click", (event) => {
    if (event.target === routeLightbox || event.target.closest("[data-image-lightbox-close]")) closeRouteLightbox();
  });
  image.addEventListener("dblclick", (event) => {
    setRouteZoom(routeZoom.scale > 1 ? 1 : 2.5, event.clientX, event.clientY);
    event.preventDefault();
  });
  stage.addEventListener("wheel", (event) => {
    setRouteZoom(routeZoom.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
    event.preventDefault();
  }, { passive: false });
  stage.addEventListener("pointerdown", (event) => {
    stage.setPointerCapture?.(event.pointerId);
    routeZoom.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (routeZoom.pointers.size === 1) {
      routeZoom.gesture = { type: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: routeZoom.x, originY: routeZoom.y };
    } else if (routeZoom.pointers.size === 2) {
      const [first, second] = [...routeZoom.pointers.values()];
      routeZoom.gesture = { type: "pinch", distance: Math.hypot(second.x - first.x, second.y - first.y) || 1, scale: routeZoom.scale };
    }
    if (routeZoom.scale > 1) stage.classList.add("is-dragging");
  });
  stage.addEventListener("pointermove", (event) => {
    if (!routeZoom.pointers.has(event.pointerId)) return;
    routeZoom.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (routeZoom.pointers.size >= 2 && routeZoom.gesture?.type === "pinch") {
      const [first, second] = [...routeZoom.pointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
      setRouteZoom(routeZoom.gesture.scale * distance / routeZoom.gesture.distance, (first.x + second.x) / 2, (first.y + second.y) / 2);
      event.preventDefault();
    } else if (routeZoom.gesture?.type === "pan" && routeZoom.scale > 1) {
      routeZoom.x = routeZoom.gesture.originX + event.clientX - routeZoom.gesture.startX;
      routeZoom.y = routeZoom.gesture.originY + event.clientY - routeZoom.gesture.startY;
      applyRouteZoom();
      event.preventDefault();
    }
  });
  const finishPointer = (event) => {
    routeZoom.pointers.delete(event.pointerId);
    if (routeZoom.pointers.size === 1) {
      const [pointerId, point] = [...routeZoom.pointers.entries()][0];
      routeZoom.gesture = {
        type: "pan",
        pointerId,
        startX: point.x,
        startY: point.y,
        originX: routeZoom.x,
        originY: routeZoom.y
      };
      if (routeZoom.scale > 1) stage.classList.add("is-dragging");
    } else {
      routeZoom.gesture = null;
      stage.classList.remove("is-dragging");
    }
  };
  stage.addEventListener("pointerup", finishPointer);
  stage.addEventListener("pointercancel", finishPointer);
  return routeLightbox;
}

function openRouteLightbox(source = activeImage) {
  if (!source) return;
  const lightbox = ensureRouteLightbox();
  const image = lightbox.querySelector("[data-image-lightbox-image]");
  image.src = assetUrl(source);
  image.alt = text(product.name);
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("image-zoom-open");
  resetRouteZoom();
  lightbox.querySelector("[data-image-lightbox-close]").focus();
}

function available(variant) {
  const qty = Number(variant?.quantity);
  return Number.isInteger(qty) && qty >= 0 ? qty > 0 : variant?.available !== false;
}

function coloringMarkup() {
  if (!hasColoringGame) return "";
  const colors = yotaColors.filter((color) => color.available !== false);
  return `
    <button class="button product-coloring-launch" type="button" data-coloring-open>✏️ العب ولوّن المادلية دي</button>
    <section class="product-coloring-game" data-coloring-game hidden>
      <div class="product-coloring-heading">
        <div><strong>لوّن مادلية اليوتا</strong><small>اختار لون واضغط داخل أي جزء لتلوينه بالكامل</small></div>
        <button type="button" data-coloring-close aria-label="إغلاق لعبة التلوين">×</button>
      </div>
      <div class="product-coloring-stage">
        <div class="product-coloring-zoom-controls" aria-label="تكبير وتصغير الميدالية">
          <button type="button" data-coloring-zoom-in aria-label="تكبير الميدالية" title="تكبير">＋</button>
          <button type="button" data-coloring-zoom-out aria-label="تصغير الميدالية" title="تصغير">−</button>
          <button type="button" data-coloring-zoom-reset aria-label="إرجاع الحجم الطبيعي" title="الحجم الطبيعي"><span data-coloring-zoom-label>100%</span></button>
          <button class="coloring-editor-only" type="button" data-coloring-zoom-fit aria-label="ملاءمة داخل الشاشة" title="ملاءمة داخل الشاشة">ملاءمة</button>
          <button class="coloring-editor-only" type="button" data-coloring-pan aria-label="تحريك الصورة" title="تحريك الصورة" aria-pressed="false">تحريك</button>
        </div>
        <canvas data-coloring-canvas role="img" aria-label="لعبة تلوين مادلية اليوتا"></canvas>
        <span data-coloring-loading>بنجهّز مناطق التلوين…</span>
      </div>
      <div class="product-coloring-palette" aria-label="لوحة الألوان">
        ${colors.map((color,index)=>`<button type="button" data-coloring-color-id="${escapeHtml(color.id)}" data-color-name="${escapeHtml(color.name)}" style="--swatch:${escapeHtml(color.hex)};${color.metallic ? `--swatch-background:linear-gradient(135deg,${escapeHtml(color.highlight)} 0%,${escapeHtml(color.hex)} 52%,${escapeHtml(color.shadow)} 100%);` : ""}" aria-label="${escapeHtml(color.name)}" title="${escapeHtml(color.name)}" aria-pressed="${index===0}"></button>`).join("")}
      </div>
      <label class="product-coloring-grouping-option"><input type="checkbox" data-coloring-symmetry> <span>لوّن الأشكال المتشابهة معًا</span></label>
      ${product.coloringModelId === "yota-03" ? '<label class="product-coloring-grouping-option"><input type="checkbox" data-coloring-whole-background> <span>لوّن خلفية الميدالية كلها معًا</span></label>' : ""}
      <div class="product-coloring-tools">
        <button type="button" data-coloring-eraser aria-pressed="false">الممحاة</button>
        <button type="button" data-coloring-reset>ابدأ من جديد</button>
        <button class="primary" type="button" data-coloring-download>احفظ الرسمة</button>
      </div>
    </section>`;
}

function coloringRequestLog(kind, url, status, error = null) {
  const details = { productId: product.id || "", productSlug: product.slug || "", coloringFileUrl: url, httpStatus: status };
  if (error) console.error(`[coloring-game] Failed to load ${kind}`, { ...details, error });
  else console.info(`[coloring-game] Loaded ${kind}`, details);
}

async function fetchColoringFile(source, kind, expectedType) {
  const url = assetUrl(source);
  if (!url) throw new Error(`Missing URL for ${kind}`);
  let response;
  try {
    response = await fetch(url, { mode: "cors", credentials: "omit" });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    if (expectedType && !contentType.toLowerCase().includes(expectedType)) {
      throw new Error(`Unexpected MIME type: ${contentType || "missing Content-Type"}`);
    }
    coloringRequestLog(kind, url, response.status);
    return response;
  } catch (error) {
    coloringRequestLog(kind, url, response?.status || 0, error);
    throw error;
  }
}

async function loadImage(source, kind = "coloring image") {
  const response = await fetchColoringFile(source, kind, "image/");
  const objectUrl = URL.createObjectURL(await response.blob());
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = (event) => { URL.revokeObjectURL(objectUrl); reject(new Error(`Browser could not decode ${kind}`)); };
    image.src = objectUrl;
  });
}

function readSavedColoring() {
  try {
    // A region ID only has meaning inside one exact mask version. Never apply
    // saved colors from an older mask to a rebuilt model.
    const saved = localStorage.getItem(coloringStorageKey) || "{}";
    const parsed = parseObject(saved);
    const selectedColors = Array.isArray(parsed.selectedColors)
      ? Object.fromEntries((parsed.coloredParts || parsed.selectedColors).flatMap((part) => part?.regionId && part?.colorHex ? [[part.regionId, part.colorHex]] : []))
      : parseObject(parsed.selectedColors, parsed);
    return Object.fromEntries(Object.entries(selectedColors).flatMap(([regionId, value]) => {
      if (!coloringRegions.some((region) => (region.id || region.regionId) === regionId)) return [];
      const source = typeof value === "string"
        ? yotaColorByHex.get(value.toUpperCase())
        : yotaColorById.get(value?.colorId) || yotaColorByHex.get(String(value?.colorHex || value || "").toUpperCase());
      if (!source) return [];
      return [[regionId, {
        regionId,
        colorId: source.id,
        colorName: source.name,
        colorHex: source.hex
      }]];
    }));
  } catch {
    return {};
  }
}

function initializeColoringGame(panel) {
  if (!panel || panel.dataset.ready === "true") return;
  const canvas = panel.querySelector("[data-coloring-canvas]");
  const loading = panel.querySelector("[data-coloring-loading]");
  const coloringStage = panel.querySelector(".product-coloring-stage");
  const zoomLabel = panel.querySelector("[data-coloring-zoom-label]");
  const coloringEditorZoomMode = new URLSearchParams(location.search).get("coloringGroupEditor") === "1" &&
    ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  const minimumColoringZoom = coloringEditorZoomMode ? 0.5 : 1;
  let coloringZoom = 1;
  const setColoringZoom = (nextZoom, clientX, clientY) => {
    const previousZoom = coloringZoom;
    const stageRect = coloringStage.getBoundingClientRect();
    const focusX = Number.isFinite(clientX) ? clientX - stageRect.left : coloringStage.clientWidth / 2;
    const focusY = Number.isFinite(clientY) ? clientY - stageRect.top : coloringStage.clientHeight / 2;
    const contentX = coloringStage.scrollLeft + focusX;
    const contentY = coloringStage.scrollTop + focusY;
    coloringZoom = Math.max(minimumColoringZoom, Math.min(3, Math.round(nextZoom * 4) / 4));
    canvas.style.setProperty("--coloring-zoom", String(coloringZoom));
    if (zoomLabel) zoomLabel.textContent = `${Math.round(coloringZoom * 100)}%`;
    panel.querySelector("[data-coloring-zoom-out]").disabled = coloringZoom <= minimumColoringZoom;
    panel.querySelector("[data-coloring-zoom-in]").disabled = coloringZoom >= 3;
    requestAnimationFrame(() => {
      if (coloringZoom <= 1) coloringStage.scrollTo({ left: 0, top: 0 });
      else coloringStage.scrollTo({
        left: Math.max(0, contentX * coloringZoom / previousZoom - focusX),
        top: Math.max(0, contentY * coloringZoom / previousZoom - focusY)
      });
    });
  };
  panel.querySelector("[data-coloring-zoom-in]")?.addEventListener("click", () => setColoringZoom(coloringZoom + 0.5));
  panel.querySelector("[data-coloring-zoom-out]")?.addEventListener("click", () => setColoringZoom(coloringZoom - 0.5));
  panel.querySelector("[data-coloring-zoom-reset]")?.addEventListener("click", () => setColoringZoom(1));
  panel.querySelector("[data-coloring-zoom-fit]")?.addEventListener("click", () => {
    const fitZoom = Math.min(1, coloringStage.clientWidth / 650, coloringStage.clientHeight / 650);
    setColoringZoom(Math.max(minimumColoringZoom, fitZoom));
  });
  setColoringZoom(1);
  panel.querySelector("[data-coloring-eraser]")?.insertAdjacentHTML(
    "beforebegin",
    '<button type="button" data-coloring-undo disabled>تراجع</button><button type="button" data-coloring-redo disabled>إعادة</button>'
  );
  const actualProductImage = Array.isArray(product.images) && product.images.length
    ? product.images[0]
    : (product.image || "");
  console.log("[MODEL 2 PRODUCT IMAGE]", {
    id: product.id || "",
    slug: product.slug || "",
    title: text(product.name),
    image: actualProductImage
  });
  console.log("[YOTA COLORING IMAGE]", {
    productId: product.id || "",
    productSlug: product.slug || "",
    model: product.coloringModelId || "",
    configKey: product.id || "",
    baseImage: product.coloringBaseImageUrl || "",
    maskImage: product.coloringMaskUrl || ""
  });
  console.log("[YOTA DEBUG]", {
    productTitle: text(product.name),
    productId: product.id || "",
    productSlug: product.slug || "",
    detectedModel: product.coloringModelId || "",
    configKey: product.id || "",
    configModel: product.coloringModelId || "",
    baseImage: product.coloringBaseImageUrl || "",
    maskImage: product.coloringMaskUrl || ""
  });
  Promise.all([
    loadImage(product.coloringBaseImageUrl, "coloring base image"),
    loadImage(product.coloringMaskUrl, "coloring region mask"),
    loadImage(product.coloringOutlineUrl, "coloring outline"),
    product.coloringRegionsUrl
      ? fetchColoringFile(product.coloringRegionsUrl, "coloring regions JSON", "application/json").then((response) => response.json())
      : Promise.resolve({ regions: coloringRegions, shapeGroups: coloringShapeGroups }),
    product.coloringRegionOverridesUrl
      ? fetchColoringFile(product.coloringRegionOverridesUrl, "coloring overrides JSON", "application/json").then((response) => response.json())
      : Promise.resolve({ groups: {}, regions: {} })
  ]).then(([baseImage, maskImage, outlineImage, regionData, regionOverrideData]) => {
    const configuredModelId = String(product.coloringModelId || "").trim();
    const regionModelId = String(regionData.modelId || "").trim();
    if (configuredModelId && regionModelId && configuredModelId !== regionModelId) {
      throw new Error(`Coloring model mismatch: product=${configuredModelId}, regions=${regionModelId}`);
    }
    const activeModelId = regionModelId || configuredModelId;
    const activeModelVersion = String(regionData.modelVersion || product.coloringModelVersion || "unversioned");
    coloringStorageKey = `yota-coloring-design-${activeModelId}:${activeModelVersion}:${product.id || "product"}`;
    localStorage.setItem(`yota-coloring-product-model:${product.id}`, activeModelId);
    const overrideRegions = regionOverrideData?.regions && typeof regionOverrideData.regions === "object"
      ? regionOverrideData.regions
      : {};
    const overrideGroupByRegion = new Map();
    Object.entries(regionOverrideData?.groups || {}).forEach(([groupName, regionIds]) => {
      (Array.isArray(regionIds) ? regionIds : []).forEach((regionId) => overrideGroupByRegion.set(regionId, groupName));
    });
    const logicalShapeByRegion = new Map();
    Object.entries(regionOverrideData?.logicalShapes || {}).forEach(([logicalShapeId, regionIds]) => {
      (Array.isArray(regionIds) ? regionIds : []).forEach((regionId) => logicalShapeByRegion.set(regionId, logicalShapeId));
    });
    const similarGroupByLogicalShape = new Map();
    Object.entries(regionOverrideData?.similarShapeGroups || {}).forEach(([groupName, logicalShapeIds]) => {
      (Array.isArray(logicalShapeIds) ? logicalShapeIds : []).forEach((logicalShapeId) => {
        similarGroupByLogicalShape.set(logicalShapeId, groupName);
      });
    });
    const backgroundGroupByLogicalShape = new Map();
    Object.entries(regionOverrideData?.backgroundGroups || {}).forEach(([groupName, logicalShapeIds]) => {
      (Array.isArray(logicalShapeIds) ? logicalShapeIds : []).forEach((logicalShapeId) => {
        backgroundGroupByLogicalShape.set(logicalShapeId, groupName);
      });
    });
    coloringRegions = (Array.isArray(regionData.regions) ? regionData.regions : []).map((region) => {
      const regionId = region.id || region.regionId;
      const logicalShapeId = logicalShapeByRegion.get(regionId)
        || overrideRegions[regionId]?.logicalShapeId
        || overrideRegions[regionId]?.logicalRegionId
        || region.logicalShapeId
        || region.logicalRegionId
        || regionId;
      const similarShapeGroup = similarGroupByLogicalShape.get(logicalShapeId)
        || overrideRegions[regionId]?.similarShapeGroup
        || overrideRegions[regionId]?.shapeGroup
        || overrideGroupByRegion.get(regionId)
        || region.similarShapeGroup
        || region.shapeGroup
        || null;
      const backgroundGroup = backgroundGroupByLogicalShape.get(logicalShapeId)
        || overrideRegions[regionId]?.backgroundGroup
        || region.backgroundGroup
        || null;
      return {
        ...region,
        ...(overrideRegions[regionId] || {}),
        logicalShapeId,
        logicalRegionId: logicalShapeId,
        similarShapeGroup,
        backgroundGroup,
        shapeGroup: similarShapeGroup
      };
    });
    const logicalShapeCount = Object.keys(regionOverrideData?.logicalShapes || {}).length;
    const similarShapeGroupCount = Object.keys(regionOverrideData?.similarShapeGroups || {}).length;
    const shouldShowSimilarShapesCheckbox = Boolean(hasColoringGame);
    const groupingDiagnostics = {
      model: activeModelId,
      modelVersion: activeModelVersion,
      configKey: coloringStorageKey,
      logicalShapesLoaded: logicalShapeCount,
      similarShapeGroupsLoaded: similarShapeGroupCount > 0,
      similarShapeGroupsCount: similarShapeGroupCount,
      shouldShowSimilarShapesCheckbox
    };
    panel.dataset.coloringModel = activeModelId;
    panel.dataset.coloringModelVersion = activeModelVersion;
    panel.dataset.logicalShapesLoaded = String(logicalShapeCount);
    panel.dataset.similarShapeGroupsLoaded = String(similarShapeGroupCount);
    panel.dataset.shouldShowSimilarShapesCheckbox = String(shouldShowSimilarShapesCheckbox);
    console.info(`[coloring-game] grouping configuration ${JSON.stringify(groupingDiagnostics)}`);
    if (activeModelId === "yota-02" && (!logicalShapeCount || !similarShapeGroupCount)) {
      console.error("YOTA MODEL 2 EXPECTED SIMILAR GROUPS BUT NONE WERE LOADED", {
        modelVersion: activeModelVersion,
        logicalShapeCount,
        similarShapeGroupCount,
        regionOverridesUrl: product.coloringRegionOverridesUrl || "missing"
      });
    }
    coloringShapeGroups = regionData.shapeGroups && typeof regionData.shapeGroups === "object" ? regionData.shapeGroups : {};
    const allRegionByMaskKey = new Map(coloringRegions.map((region) => [region.maskColor.join(","), region.id || region.regionId]));
    regionByMaskKey = new Map(coloringRegions
      .filter((region) => region.enabled !== false)
      .map((region) => [region.maskColor.join(","), region.id || region.regionId]));
    if (baseImage.naturalWidth !== maskImage.naturalWidth || baseImage.naturalHeight !== maskImage.naturalHeight || baseImage.naturalWidth !== outlineImage.naturalWidth || baseImage.naturalHeight !== outlineImage.naturalHeight) {
      throw new Error("Coloring assets must have identical dimensions.");
    }

    canvas.width = baseImage.naturalWidth;
    canvas.height = baseImage.naturalHeight;
    const context = canvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    maskContext.drawImage(maskImage, 0, 0);
    const maskPixels = maskContext.getImageData(0, 0, canvas.width, canvas.height).data;
    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = canvas.width;
    baseCanvas.height = canvas.height;
    const baseContext = baseCanvas.getContext("2d", { willReadFrequently: true });
    baseContext.drawImage(baseImage, 0, 0);
    const basePixels = baseContext.getImageData(0, 0, canvas.width, canvas.height).data;
    const beechBaseCanvas = document.createElement("canvas");
    beechBaseCanvas.width = canvas.width;
    beechBaseCanvas.height = canvas.height;
    const beechBaseContext = beechBaseCanvas.getContext("2d", { willReadFrequently: true });
    beechBaseContext.drawImage(baseImage, 0, 0);
    const beechBasePixels = beechBaseContext.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < beechBasePixels.data.length; index += 4) {
      if (beechBasePixels.data[index + 3] === 0) continue;
      const red = beechBasePixels.data[index];
      const green = beechBasePixels.data[index + 1];
      const blue = beechBasePixels.data[index + 2];
      const luminance = red * 0.30 + green * 0.59 + blue * 0.11;
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      const grain = Math.sin(x * 0.065 + Math.sin(y * 0.012) * 1.7) * 2.7 +
        Math.sin(y * 0.026) * 1.5;
      const light = Math.max(0, Math.min(1, (luminance - 38) / 205));
      beechBasePixels.data[index] = Math.round(187 + light * 48 + grain);
      beechBasePixels.data[index + 1] = Math.round(139 + light * 59 + grain * 0.7);
      beechBasePixels.data[index + 2] = Math.round(78 + light * 57 + grain * 0.35);
    }
    beechBaseContext.putImageData(beechBasePixels, 0, 0);
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
    const overlayContext = overlayCanvas.getContext("2d");
    const regionPixelIndexes = new Map(coloringRegions.map((region) => [region.id || region.regionId, []]));
    const regionMetadata = new Map(coloringRegions.map((region) => [region.id || region.regionId, region]));
    const regionColors = readSavedColoring();
    let customizationId = (() => {
      const saved = parseObject(localStorage.getItem(coloringStorageKey) || "{}");
      return String(saved.customizationId || "");
    })();
    const debugColoring = new URLSearchParams(location.search).get("coloringDebug") === "1";
    const groupEditorRequested = new URLSearchParams(location.search).get("coloringGroupEditor") === "1";
    const groupEditorMode = groupEditorRequested && ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    const selectedEditorRegions = new Set();
    const editorUndoStack = [];
    let activeEditorGroup = "";
    let testedEditorGroup = "";
    let clickedEditorRegion = "";
    const normalizeOverrideDocument = (value) => {
      const groups = {};
      Object.entries(value?.groups || {}).forEach(([name, ids]) => {
        groups[name] = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
      });
      const normalized = {
        modelId: activeModelId,
        modelVersion: regionData.modelVersion || product.coloringModelVersion || "",
        logicalShapes: Object.fromEntries(Object.entries(value?.logicalShapes || {}).map(([name, ids]) => [name, [...new Set(Array.isArray(ids) ? ids : [])]])),
        similarShapeGroups: Object.fromEntries(Object.entries(value?.similarShapeGroups || {}).map(([name, logicalShapeIds]) => [name, [...new Set(Array.isArray(logicalShapeIds) ? logicalShapeIds : [])]])),
        groups,
        regions: Object.fromEntries(Object.entries(value?.regions || {}).map(([id, metadata]) => [id, { ...metadata }]))
      };
      Object.entries(groups).forEach(([groupName, ids]) => ids.forEach((id) => {
        normalized.regions[id] = { ...(normalized.regions[id] || {}), shapeGroup: groupName };
      }));
      return normalized;
    };
    const initialEditorOverrides = normalizeOverrideDocument(regionOverrideData);
    let editorOverrides = normalizeOverrideDocument(regionOverrideData);
    if (groupEditorMode) {
      try {
        const draft = JSON.parse(localStorage.getItem(`yota-coloring-group-editor-${activeModelId}`) || "null");
        if (draft?.modelId === activeModelId) editorOverrides = normalizeOverrideDocument(draft);
      } catch {}
    }
    const paintEffectStrength = 0.22;
    const paintOpacity = 0.90;
    const flatPaintMode = new URLSearchParams(location.search).get("paintMode") === "flat";
    const paintLayerCache = new Map();
    let activePaint = yotaColors.find((color) => color.available !== false) || {
      id: "red",
      name: "أحمر",
      hex: "#D00101"
    };
    let erasing = false;
    let highlightedRegionId = "";
    const undoStack = [];
    const redoStack = [];

    for (let pixel = 0; pixel < maskPixels.length; pixel += 4) {
      const regionId = allRegionByMaskKey.get(`${maskPixels[pixel]},${maskPixels[pixel+1]},${maskPixels[pixel+2]}`);
      if (regionId) regionPixelIndexes.get(regionId).push(pixel);
    }

    const parseHex = (hex) => (String(hex || "").match(/[0-9a-f]{2}/gi) || []).map((part) => parseInt(part, 16));
    const normalizePaint = (value) => {
      if (typeof value === "string") {
        const shared = yotaColorByHex.get(value.toUpperCase());
        return shared || { id: value, name: value, hex: value };
      }
      return yotaColorById.get(value?.colorId) ||
        yotaColorByHex.get(String(value?.colorHex || "").toUpperCase()) ||
        { id: value?.colorId, name: value?.colorName, hex: value?.colorHex };
    };
    const buildPaintLayer = (regionId, color, effectScale = 1, flatMode = flatPaintMode) => {
      const paint = normalizePaint(color);
      if (!paint?.hex) return null;
      const cacheKey = `${regionId}:${paint.id || paint.hex}:${flatMode ? "flat" : paintEffectStrength}:${effectScale.toFixed(3)}`;
      if (paintLayerCache.has(cacheKey)) return paintLayerCache.get(cacheKey);
      const region = regionMetadata.get(regionId);
      const bounds = region?.bounds;
      const pixels = regionPixelIndexes.get(regionId);
      if (!bounds || !pixels?.length) return null;
      const layer = document.createElement("canvas");
      layer.width = bounds.width;
      layer.height = bounds.height;
      const layerContext = layer.getContext("2d");
      const imageData = layerContext.createImageData(bounds.width, bounds.height);
      const [red, green, blue] = parseHex(paint.hex);
      const [goldHighlightRed, goldHighlightGreen, goldHighlightBlue] = parseHex(paint.highlight || paint.hex);
      const [goldShadowRed, goldShadowGreen, goldShadowBlue] = parseHex(paint.shadow || paint.hex);
      const maskColor = region.maskColor;
      const belongsToRegion = (x, y) => {
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
        const index = (y * canvas.width + x) * 4;
        return maskPixels[index + 3] !== 0 &&
          maskPixels[index] === maskColor[0] &&
          maskPixels[index + 1] === maskColor[1] &&
          maskPixels[index + 2] === maskColor[2];
      };
      pixels.forEach((sourceIndex) => {
        const pixel = sourceIndex / 4;
        const x = pixel % canvas.width;
        const y = Math.floor(pixel / canvas.width);
        const localIndex = ((y - bounds.y) * bounds.width + (x - bounds.x)) * 4;
        let outputRed = basePixels[sourceIndex] * (1 - paintOpacity) + red * paintOpacity;
        let outputGreen = basePixels[sourceIndex + 1] * (1 - paintOpacity) + green * paintOpacity;
        let outputBlue = basePixels[sourceIndex + 2] * (1 - paintOpacity) + blue * paintOpacity;
        if (!flatMode) {
          const strengthScale = paintEffectStrength / 0.22;
          const bevelWidth = 3 * effectScale;
          const highlightOffsetX = -1 * effectScale;
          const highlightOffsetY = -1 * effectScale;
          const shadowOffsetX = 1 * effectScale;
          const shadowOffsetY = 1 * effectScale;
          const highlightBlur = 1 * effectScale;
          const shadowBlur = 1.5 * effectScale;
          const bevelSamples = Math.max(1, Math.round(bevelWidth / effectScale));
          const highlightSampleX = Math.max(1, Math.round(Math.abs(highlightOffsetX) / effectScale));
          const highlightSampleY = Math.max(1, Math.round(Math.abs(highlightOffsetY) / effectScale));
          const shadowSampleX = Math.max(1, Math.round(shadowOffsetX / effectScale));
          const shadowSampleY = Math.max(1, Math.round(shadowOffsetY / effectScale));
          const woodLuminance = (basePixels[sourceIndex] + basePixels[sourceIndex + 1] + basePixels[sourceIndex + 2]) / 3;
          const softLightTexture = ((woodLuminance - 128) / 128) * 0.045;
          outputRed += (softLightTexture >= 0 ? 255 - outputRed : outputRed) * softLightTexture;
          outputGreen += (softLightTexture >= 0 ? 255 - outputGreen : outputGreen) * softLightTexture;
          outputBlue += (softLightTexture >= 0 ? 255 - outputBlue : outputBlue) * softLightTexture;
          const irregularShine = ((((x * 17 + y * 31) % 29) / 28) - 0.5) * 0.018 * strengthScale;
          outputRed += (255 - outputRed) * Math.max(0, irregularShine);
          outputGreen += (255 - outputGreen) * Math.max(0, irregularShine);
          outputBlue += (255 - outputBlue) * Math.max(0, irregularShine);
          let highlight = 0;
          let shadow = 0;
          for (let distance = 1; distance <= bevelSamples; distance += 1) {
            const highlightDistance = Math.max(
              highlightSampleX,
              highlightSampleY,
              Math.round(distance * highlightBlur / Math.max(1, bevelWidth))
            );
            const shadowDistance = Math.max(
              shadowSampleX,
              shadowSampleY,
              Math.round(distance * shadowBlur / Math.max(1, bevelWidth))
            );
            if (!belongsToRegion(x - highlightDistance, y) || !belongsToRegion(x, y - highlightDistance)) {
              highlight = Math.max(highlight, 0.12 * strengthScale * (1 - (distance - 1) / (bevelSamples + 0.5)));
            }
            if (!belongsToRegion(x + shadowDistance, y) || !belongsToRegion(x, y + shadowDistance)) {
              shadow = Math.max(shadow, 0.14 * strengthScale * (1 - (distance - 1) / (bevelSamples + 0.5)));
            }
          }
          let gloss = 0;
          if (region.pixelCount > 500 && bounds.width > 18 && bounds.height > 18) {
            const seed = [...regionId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
            const glossCenterX = 0.28 + (seed % 7) * 0.012;
            const glossCenterY = 0.25 + (seed % 5) * 0.014;
            const normalizedX = (x - bounds.x) / Math.max(1, bounds.width - 1);
            const normalizedY = (y - bounds.y) / Math.max(1, bounds.height - 1);
            const ellipseDistance = ((normalizedX - glossCenterX) / 0.19) ** 2 + ((normalizedY - glossCenterY) / 0.105) ** 2;
            if (ellipseDistance < 1) gloss = (1 - ellipseDistance) * (0.06 + (seed % 4) * 0.01);
          }
          outputRed += (255 - outputRed) * gloss;
          outputGreen += (255 - outputGreen) * gloss;
          outputBlue += (255 - outputBlue) * gloss;
          outputRed = (outputRed + (255 - outputRed) * highlight) * (1 - shadow);
          outputGreen = (outputGreen + (255 - outputGreen) * highlight) * (1 - shadow);
          outputBlue = (outputBlue + (255 - outputBlue) * highlight) * (1 - shadow);
          if (paint.metallic) {
            const normalizedX = (x - bounds.x) / Math.max(1, bounds.width - 1);
            const normalizedY = (y - bounds.y) / Math.max(1, bounds.height - 1);
            const diagonal = normalizedX + normalizedY;
            const goldHighlight = Math.max(0, Math.min(0.14, (0.82 - diagonal) * 0.15));
            const goldShadow = Math.max(0, Math.min(0.12, (diagonal - 1.10) * 0.13));
            outputRed += (goldHighlightRed - outputRed) * goldHighlight;
            outputGreen += (goldHighlightGreen - outputGreen) * goldHighlight;
            outputBlue += (goldHighlightBlue - outputBlue) * goldHighlight;
            outputRed += (goldShadowRed - outputRed) * goldShadow;
            outputGreen += (goldShadowGreen - outputGreen) * goldShadow;
            outputBlue += (goldShadowBlue - outputBlue) * goldShadow;
          }
        }
        imageData.data[localIndex] = Math.max(0, Math.min(255, Math.round(outputRed)));
        imageData.data[localIndex + 1] = Math.max(0, Math.min(255, Math.round(outputGreen)));
        imageData.data[localIndex + 2] = Math.max(0, Math.min(255, Math.round(outputBlue)));
        imageData.data[localIndex + 3] = 255;
      });
      layerContext.putImageData(imageData, 0, 0);
      const result = { canvas: layer, x: bounds.x, y: bounds.y };
      paintLayerCache.set(cacheKey, result);
      return result;
    };

    const renderColoringArtwork = (targetContext, outputWidth, outputHeight, {
      includeHighlight = false,
      flatMode = flatPaintMode,
      includeDebug = false
    } = {}) => {
      const effectScale = outputWidth / canvas.width;
      const overlay = overlayContext.createImageData(canvas.width, canvas.height);
      if (includeHighlight && highlightedRegionId && regionPixelIndexes.has(highlightedRegionId)) {
        regionPixelIndexes.get(highlightedRegionId).forEach((pixel) => {
          overlay.data[pixel] = 255;
          overlay.data[pixel+1] = 215;
          overlay.data[pixel+2] = 0;
          overlay.data[pixel+3] = Math.max(overlay.data[pixel+3], 75);
        });
      }
      if (includeDebug) {
        coloringRegions.forEach((region, index) => {
          const id = region.id || region.regionId;
          const hue = (index * 137.508) % 360;
          const color = region.enabled === false
            ? "rgb(70 70 70)"
            : !region.shapeGroup && region.pixelCount < 250
              ? "rgb(255 0 150)"
              : `hsl(${hue} 85% 50%)`;
          const swatch = document.createElement("canvas").getContext("2d");
          swatch.fillStyle = color;
          swatch.fillRect(0, 0, 1, 1);
          const rgba = swatch.getImageData(0, 0, 1, 1).data;
          regionPixelIndexes.get(id)?.forEach((pixel) => {
            overlay.data[pixel] = rgba[0];
            overlay.data[pixel+1] = rgba[1];
            overlay.data[pixel+2] = rgba[2];
            overlay.data[pixel+3] = 70;
          });
        });
      }
      if (groupEditorMode) {
        const groupNames = Object.keys(editorOverrides.groups);
        coloringRegions.forEach((region) => {
          const id = region.id || region.regionId;
          const groupName = Object.entries(editorOverrides.groups).find(([, ids]) => ids.includes(id))?.[0] || "";
          const groupIndex = Math.max(0, groupNames.indexOf(groupName));
          const selected = selectedEditorRegions.has(id);
          const hovered = highlightedRegionId === id;
          const active = !activeEditorGroup || activeEditorGroup === groupName;
          const tested = testedEditorGroup && testedEditorGroup === groupName;
          const swatch = document.createElement("canvas").getContext("2d");
          swatch.fillStyle = tested ? "#00d9ff" : selected ? "#7a19ff" : hovered ? "#ffe600" : `hsl(${(groupIndex * 67 + 18) % 360} 82% 48%)`;
          swatch.fillRect(0, 0, 1, 1);
          const rgba = swatch.getImageData(0, 0, 1, 1).data;
          regionPixelIndexes.get(id)?.forEach((pixel) => {
            overlay.data[pixel] = rgba[0];
            overlay.data[pixel+1] = rgba[1];
            overlay.data[pixel+2] = rgba[2];
            overlay.data[pixel+3] = region.enabled === false ? 35 : tested ? 175 : selected ? 195 : hovered ? 145 : active ? 89 : 10;
          });
        });
      }
      overlayContext.putImageData(overlay, 0, 0);
      targetContext.clearRect(0, 0, outputWidth, outputHeight);
      targetContext.drawImage(isBeechSelected() ? beechBaseCanvas : baseImage, 0, 0, outputWidth, outputHeight);
      Object.entries(regionColors).forEach(([regionId, color]) => {
        const layer = buildPaintLayer(regionId, color, effectScale, flatMode);
        if (layer) {
          targetContext.drawImage(
            layer.canvas,
            layer.x * effectScale,
            layer.y * effectScale,
            layer.canvas.width * effectScale,
            layer.canvas.height * effectScale
          );
        }
      });
      if (includeHighlight || includeDebug || groupEditorMode) targetContext.drawImage(overlayCanvas, 0, 0, outputWidth, outputHeight);
      targetContext.drawImage(outlineImage, 0, 0, outputWidth, outputHeight);
      if (includeDebug || groupEditorMode) {
        targetContext.save();
        targetContext.font = `bold ${12 * effectScale}px sans-serif`;
        targetContext.textAlign = "center";
        targetContext.textBaseline = "middle";
        coloringRegions.forEach((region) => {
          const id = region.id || region.regionId;
          const label = id.replace("region-", "");
          const metadataLabel = `${region.logicalRegionId || id} · ${region.shapeGroup || "unclassified"}`;
          targetContext.font = `bold ${12 * effectScale}px sans-serif`;
          targetContext.lineWidth = 3 * effectScale;
          targetContext.strokeStyle = "#fff";
          targetContext.strokeText(label, region.centerX * effectScale, region.centerY * effectScale);
          targetContext.fillStyle = "#111";
          targetContext.fillText(label, region.centerX * effectScale, region.centerY * effectScale);
          targetContext.font = `bold ${8 * effectScale}px sans-serif`;
          targetContext.strokeText(metadataLabel, region.centerX * effectScale, (region.centerY + 13) * effectScale);
          targetContext.fillText(metadataLabel, region.centerX * effectScale, (region.centerY + 13) * effectScale);
          if (region.bounds && (includeDebug || selectedEditorRegions.has(id) || highlightedRegionId === id)) {
            targetContext.strokeStyle = "rgba(0,0,0,.8)";
            targetContext.lineWidth = effectScale;
            targetContext.strokeRect(
              region.bounds.x * effectScale,
              region.bounds.y * effectScale,
              region.bounds.width * effectScale,
              region.bounds.height * effectScale
            );
          }
        });
        targetContext.restore();
      }
    };
    const updateFinalMedalPreview = () => {
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height;
      renderColoringArtwork(finalCanvas.getContext("2d"), canvas.width, canvas.height, {
        includeHighlight: false,
        flatMode: flatPaintMode,
        includeDebug: false
      });
      currentMedalPreviewImage = compactCanvasPreview(finalCanvas);
      showMedalPreview(finalCanvas.toDataURL("image/png"));
    };
    const renderCanvas = ({ includeHighlight = true } = {}) => {
      renderColoringArtwork(
        context,
        canvas.width,
        canvas.height,
        { includeHighlight, flatMode: flatPaintMode, includeDebug: debugColoring }
      );
    };
    refreshColoringWoodPreview = () => {
      renderCanvas({ includeHighlight: false });
      updateFinalMedalPreview();
    };
    const snapshot = () => JSON.stringify(regionColors);
    const syncCurrentColoringDesign = () => {
      const coloredParts = Object.entries(regionColors).map(([regionId, value]) => {
        const paint = normalizePaint(value);
        return {
          regionId,
          colorId: paint.id,
          colorName: paint.name,
          colorHex: paint.hex
        };
      });
      if (coloredParts.length && !customizationId) customizationId = createCustomizationId();
      const selectedColors = Object.fromEntries(coloredParts.map((part) => [part.regionId, part.colorHex]));
      currentColoringDesign = coloredParts.length ? {
        customizationId,
        modelId: regionData.modelId || product.coloringModelId,
        modelName: regionData.modelName || text(product.name),
        selectedColors,
        selectedColorDetails: [...new Map(coloredParts.map((part) => [part.colorId, {
          colorId: part.colorId,
          colorName: part.colorName,
          colorHex: part.colorHex
        }])).values()],
        coloredParts
      } : null;
    };
    const persistColoringDesign = () => {
      syncCurrentColoringDesign();
      localStorage.setItem(coloringStorageKey, JSON.stringify(currentColoringDesign || { customizationId, selectedColors: {} }));
      requestAnimationFrame(updateFinalMedalPreview);
    };
    const updateHistoryButtons = () => {
      panel.querySelector("[data-coloring-undo]").disabled = !undoStack.length;
      panel.querySelector("[data-coloring-redo]").disabled = !redoStack.length;
    };
    const applySnapshot = (value) => {
      Object.keys(regionColors).forEach((id) => delete regionColors[id]);
      Object.assign(regionColors, JSON.parse(value));
      persistColoringDesign();
      renderCanvas();
      updateHistoryButtons();
    };

    const relatedRegions = (regionId) => {
      const metadata = regionMetadata.get(regionId);
      const logicalShapeId = metadata?.logicalShapeId || metadata?.logicalRegionId || regionId;
      const logicalMembers = coloringRegions
        .filter((region) => (region.logicalShapeId || region.logicalRegionId || region.id || region.regionId) === logicalShapeId)
        .map((region) => region.id || region.regionId);
      const backgroundGroup = metadata?.backgroundGroup;
      if (backgroundGroup && panel.querySelector("[data-coloring-whole-background]")?.checked) {
        return [...new Set(coloringRegions
          .filter((region) => region.backgroundGroup === backgroundGroup)
          .map((region) => region.id || region.regionId))];
      }
      if (!panel.querySelector("[data-coloring-symmetry]")?.checked) return [...new Set(logicalMembers)];
      const similarShapeGroup = metadata?.similarShapeGroup || metadata?.shapeGroup;
      if (!similarShapeGroup) return [...new Set(logicalMembers)];
      return [...new Set(coloringRegions
        .filter((region) => (region.similarShapeGroup || region.shapeGroup) === similarShapeGroup)
        .map((region) => region.id || region.regionId))];
    };

    const findNearestRegion = (x, y, radius = 4) => {
      let nearest = "";
      let nearestDistance = Infinity;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const candidateX = x + offsetX;
          const candidateY = y + offsetY;
          if (candidateX < 0 || candidateY < 0 || candidateX >= canvas.width || candidateY >= canvas.height) continue;
          const distance = offsetX * offsetX + offsetY * offsetY;
          if (distance > radius * radius || distance >= nearestDistance) continue;
          const pixel = (candidateY * canvas.width + candidateX) * 4;
          if (maskPixels[pixel + 3] === 0) continue;
          const id = regionByMaskKey.get(`${maskPixels[pixel]},${maskPixels[pixel+1]},${maskPixels[pixel+2]}`) || "";
          if (id) {
            nearest = id;
            nearestDistance = distance;
          }
        }
      }
      return nearest;
    };

    const regionAtPointer = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.floor((event.clientX - rect.left) * scaleX);
      const y = Math.floor((event.clientY - rect.top) * scaleY);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return "";
      const pixel = (y * canvas.width + x) * 4;
      const direct = maskPixels[pixel + 3] === 0 ? "" : regionByMaskKey.get(`${maskPixels[pixel]},${maskPixels[pixel+1]},${maskPixels[pixel+2]}`) || "";
      return direct || findNearestRegion(x, y, 4);
    };

    let refreshGroupEditor = () => {};
    let editorPanMode = false;
    let editorDidPan = false;
    if (groupEditorMode) {
      panel.classList.add("product-coloring-group-editor-mode");
      panel.querySelector(".product-coloring-tools")?.setAttribute("hidden", "");
      panel.querySelector(".product-coloring-palette")?.setAttribute("hidden", "");
      panel.querySelector(".product-coloring-grouping-option")?.setAttribute("hidden", "");
      document.body.classList.add("coloring-group-editor-open");
      document.documentElement.classList.add("coloring-group-editor-open");
      panel.insertAdjacentHTML("afterbegin", `
        <button class="coloring-group-editor-drawer-toggle" type="button" data-editor-drawer-toggle>المجموعات والإعدادات</button>
        <aside class="coloring-group-editor" data-group-editor>
          <header>
            <strong>محرر مجموعات الأشكال</strong>
            <small>أداة تطوير محلية — لا تظهر للعملاء</small>
          </header>
          <div class="coloring-group-editor-summary">
            <span>المجموعة المختارة حاليًا: <b data-editor-active-group>لا توجد</b></span>
            <span>المناطق المحددة: <b data-editor-selected-count>0</b></span>
          </div>
          <label>اسم shapeGroup<input type="text" data-editor-group-name dir="ltr" placeholder="group-name"></label>
          <button type="button" data-editor-create>إنشاء مجموعة جديدة</button>
          <div data-editor-groups></div>
          <div class="coloring-group-editor-details" data-editor-details>اضغط على منطقة لعرض بياناتها.</div>
          <div class="coloring-group-editor-primary-actions">
            <button type="button" data-editor-add>أضف المحدد إلى المجموعة</button>
            <button type="button" data-editor-remove>أزل المحدد من المجموعة</button>
            <button type="button" data-editor-test>اختبر المجموعة</button>
            <button class="primary" type="button" data-editor-save>احفظ التعديلات</button>
          </div>
          <section class="coloring-group-editor-ungrouped">
            <button type="button" data-editor-show-ungrouped>اعرض المناطق غير المجمعة</button>
            <div data-editor-ungrouped></div>
          </section>
          <div class="coloring-group-editor-secondary-actions">
            <button type="button" data-editor-select-group>تحديد مناطق المجموعة</button>
            <button type="button" data-editor-undo>التراجع عن آخر تعديل</button>
            <button type="button" data-editor-copy>نسخ JSON</button>
            <button type="button" data-editor-download>تنزيل JSON</button>
          </div>
          <div class="coloring-group-editor-danger-actions">
            <strong>إجراءات حساسة</strong>
            <button type="button" data-editor-delete>حذف المجموعة</button>
            <button type="button" data-editor-reset>إعادة ضبط التعديلات</button>
          </div>
          <output data-editor-validation></output>
        </aside>`);
      const editor = panel.querySelector("[data-group-editor]");
      const groupNameInput = editor.querySelector("[data-editor-group-name]");
      let showUngrouped = false;
      const panButton = panel.querySelector("[data-coloring-pan]");
      panButton?.addEventListener("click", () => {
        editorPanMode = !editorPanMode;
        panButton.setAttribute("aria-pressed", String(editorPanMode));
        coloringStage.classList.toggle("is-editor-panning", editorPanMode);
      });
      coloringStage.addEventListener("wheel", (event) => {
        event.preventDefault();
        setColoringZoom(coloringZoom + (event.deltaY < 0 ? 0.25 : -0.25), event.clientX, event.clientY);
      }, { passive: false });
      let panGesture = null;
      coloringStage.addEventListener("pointerdown", (event) => {
        if (!editorPanMode || coloringZoom <= 1) return;
        editorDidPan = false;
        panGesture = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: coloringStage.scrollLeft,
          top: coloringStage.scrollTop
        };
        coloringStage.setPointerCapture(event.pointerId);
      });
      coloringStage.addEventListener("pointermove", (event) => {
        if (!panGesture || panGesture.pointerId !== event.pointerId) return;
        const dx = event.clientX - panGesture.x;
        const dy = event.clientY - panGesture.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) editorDidPan = true;
        coloringStage.scrollLeft = panGesture.left - dx;
        coloringStage.scrollTop = panGesture.top - dy;
        event.preventDefault();
      });
      const endPan = (event) => {
        if (panGesture?.pointerId === event.pointerId) panGesture = null;
      };
      coloringStage.addEventListener("pointerup", endPan);
      coloringStage.addEventListener("pointercancel", endPan);
      const cloneOverrides = () => JSON.parse(JSON.stringify(editorOverrides));
      const groupForRegion = (regionId) => Object.entries(editorOverrides.groups).find(([, ids]) => ids.includes(regionId))?.[0] || "";
      const syncRegionOverrides = () => {
        Object.keys(editorOverrides.regions).forEach((id) => delete editorOverrides.regions[id].shapeGroup);
        Object.entries(editorOverrides.groups).forEach(([groupName, ids]) => ids.forEach((id) => {
          editorOverrides.regions[id] = { ...(editorOverrides.regions[id] || {}), shapeGroup: groupName };
          const metadata = regionMetadata.get(id);
          if (metadata) metadata.shapeGroup = groupName;
        }));
        coloringRegions.forEach((region) => {
          const id = region.id || region.regionId;
          if (!groupForRegion(id)) delete region.shapeGroup;
        });
        localStorage.setItem(`yota-coloring-group-editor-${activeModelId}`, JSON.stringify(editorOverrides));
      };
      const pushEditorUndo = () => editorUndoStack.push(JSON.stringify(editorOverrides));
      const chooseGroup = (name) => {
        activeEditorGroup = name;
        groupNameInput.value = name;
        testedEditorGroup = "";
        refreshGroupEditor();
      };
      panel.querySelector("[data-editor-drawer-toggle]")?.addEventListener("click", () => {
        panel.classList.toggle("editor-drawer-open");
      });
      const validateEditorOverrides = () => {
        const validIds = new Set(coloringRegions.map((region) => region.id || region.regionId));
        const errors = [];
        const seen = new Map();
        Object.entries(editorOverrides.groups).forEach(([groupName, ids]) => {
          if (ids.length !== new Set(ids).size) errors.push(`يوجد regionId مكرر داخل ${groupName}.`);
          ids.forEach((id) => {
            if (!validIds.has(id) || !regionPixelIndexes.get(id)?.length) errors.push(`${id} غير موجود في regions.json أو regions.png.`);
            if (seen.has(id) && seen.get(id) !== groupName) errors.push(`${id} ينتمي إلى أكثر من مجموعة.`);
            seen.set(id, groupName);
          });
        });
        return errors;
      };
      refreshGroupEditor = () => {
        editor.querySelector("[data-editor-active-group]").textContent = activeEditorGroup || "لا توجد";
        editor.querySelector("[data-editor-selected-count]").textContent = String(selectedEditorRegions.size);
        const activeGroupIndex = Object.keys(editorOverrides.groups).indexOf(activeEditorGroup);
        editor.style.setProperty("--active-group-color", activeGroupIndex >= 0 ? `hsl(${(activeGroupIndex * 67 + 18) % 360} 82% 48%)` : "#859295");
        const groupList = editor.querySelector("[data-editor-groups]");
        groupList.innerHTML = Object.entries(editorOverrides.groups).map(([name, ids], index) => `
          <button type="button" class="${name === activeEditorGroup ? "active" : ""}" data-editor-group="${escapeHtml(name)}">
            <i style="--group-color:hsl(${(index * 67 + 18) % 360} 82% 48%)"></i>
            <span dir="ltr">${escapeHtml(name)}</span><b>${ids.length}</b>
          </button>`).join("");
        groupList.querySelectorAll("[data-editor-group]").forEach((button) => button.addEventListener("click", () => chooseGroup(button.dataset.editorGroup)));
        const ungrouped = coloringRegions
          .filter((region) => region.enabled !== false && !groupForRegion(region.id || region.regionId))
          .map((region) => region.id || region.regionId);
        editor.querySelector("[data-editor-ungrouped]").hidden = !showUngrouped;
        editor.querySelector("[data-editor-ungrouped]").innerHTML = ungrouped.length
          ? ungrouped.map((id) => `
              <div class="coloring-editor-ungrouped-row">
                <button type="button" data-editor-region="${escapeHtml(id)}">${escapeHtml(id)}</button>
                <button type="button" data-editor-add-one="${escapeHtml(id)}">أضف للمجموعة المختارة</button>
                <button type="button" data-editor-disable="${escapeHtml(id)}">اجعلها غير قابلة للتلوين</button>
              </div>`).join("")
          : "<small>لا توجد مناطق غير مجمعة.</small>";
        editor.querySelectorAll("[data-editor-region]").forEach((button) => button.addEventListener("click", () => {
          const id = button.dataset.editorRegion;
          selectedEditorRegions.has(id) ? selectedEditorRegions.delete(id) : selectedEditorRegions.add(id);
          clickedEditorRegion = id;
          refreshGroupEditor();
        }));
        editor.querySelectorAll("[data-editor-add-one]").forEach((button) => button.addEventListener("click", () => {
          if (!activeEditorGroup) return;
          pushEditorUndo();
          const id = button.dataset.editorAddOne;
          Object.values(editorOverrides.groups).forEach((ids) => {
            const index = ids.indexOf(id);
            if (index >= 0) ids.splice(index, 1);
          });
          editorOverrides.groups[activeEditorGroup].push(id);
          syncRegionOverrides();
          refreshGroupEditor();
        }));
        editor.querySelectorAll("[data-editor-disable]").forEach((button) => button.addEventListener("click", () => {
          pushEditorUndo();
          const id = button.dataset.editorDisable;
          editorOverrides.regions[id] = { ...(editorOverrides.regions[id] || {}), enabled: false };
          const metadata = regionMetadata.get(id);
          if (metadata) metadata.enabled = false;
          selectedEditorRegions.delete(id);
          syncRegionOverrides();
          refreshGroupEditor();
        }));
        const metadata = regionMetadata.get(clickedEditorRegion);
        editor.querySelector("[data-editor-details]").innerHTML = metadata ? `
          <b>${escapeHtml(clickedEditorRegion)}</b>
          <span>logicalRegionId: <code>${escapeHtml(metadata.logicalRegionId || clickedEditorRegion)}</code></span>
          <span>shapeGroup: <code>${escapeHtml(groupForRegion(clickedEditorRegion) || "غير مجمعة")}</code></span>
          <span>pixelCount: <code>${regionPixelIndexes.get(clickedEditorRegion)?.length || metadata.pixelCount || 0}</code></span>
          <span>المحدد حاليًا: ${selectedEditorRegions.size}</span>` : "اضغط على منطقة لعرض بياناتها.";
        const errors = validateEditorOverrides();
        editor.querySelector("[data-editor-validation]").textContent = errors.length
          ? `خطأ: ${errors.join(" ")}`
          : `صالح — ${Object.keys(editorOverrides.groups).length} مجموعات، ${ungrouped.length} مناطق غير مجمعة.`;
        renderCanvas();
      };
      const targetGroupName = () => groupNameInput.value.trim();
      editor.querySelector("[data-editor-create]").addEventListener("click", () => {
        const name = targetGroupName();
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || editorOverrides.groups[name]) return;
        pushEditorUndo();
        editorOverrides.groups[name] = [];
        activeEditorGroup = name;
        syncRegionOverrides();
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-add]").addEventListener("click", () => {
        const name = targetGroupName() || activeEditorGroup;
        if (!name || !editorOverrides.groups[name] || !selectedEditorRegions.size) return;
        pushEditorUndo();
        Object.values(editorOverrides.groups).forEach((ids) => selectedEditorRegions.forEach((id) => {
          const index = ids.indexOf(id);
          if (index >= 0) ids.splice(index, 1);
        }));
        editorOverrides.groups[name] = [...new Set([...editorOverrides.groups[name], ...selectedEditorRegions])];
        activeEditorGroup = name;
        syncRegionOverrides();
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-remove]").addEventListener("click", () => {
        if (!selectedEditorRegions.size) return;
        pushEditorUndo();
        Object.values(editorOverrides.groups).forEach((ids) => selectedEditorRegions.forEach((id) => {
          const index = ids.indexOf(id);
          if (index >= 0) ids.splice(index, 1);
        }));
        syncRegionOverrides();
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-select-group]").addEventListener("click", () => {
        selectedEditorRegions.clear();
        (editorOverrides.groups[activeEditorGroup] || []).forEach((id) => selectedEditorRegions.add(id));
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-test]").addEventListener("click", () => {
        testedEditorGroup = testedEditorGroup === activeEditorGroup ? "" : activeEditorGroup;
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-delete]").addEventListener("click", () => {
        if (!activeEditorGroup || !editorOverrides.groups[activeEditorGroup]) return;
        pushEditorUndo();
        delete editorOverrides.groups[activeEditorGroup];
        activeEditorGroup = "";
        syncRegionOverrides();
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-undo]").addEventListener("click", () => {
        if (!editorUndoStack.length) return;
        editorOverrides = JSON.parse(editorUndoStack.pop());
        syncRegionOverrides();
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-reset]").addEventListener("click", () => {
        pushEditorUndo();
        editorOverrides = JSON.parse(JSON.stringify(initialEditorOverrides));
        selectedEditorRegions.clear();
        syncRegionOverrides();
        refreshGroupEditor();
      });
      editor.querySelector("[data-editor-show-ungrouped]").addEventListener("click", () => {
        showUngrouped = !showUngrouped;
        testedEditorGroup = "";
        selectedEditorRegions.clear();
        if (showUngrouped) {
          coloringRegions
            .filter((region) => region.enabled !== false && !groupForRegion(region.id || region.regionId))
            .forEach((region) => selectedEditorRegions.add(region.id || region.regionId));
        }
        refreshGroupEditor();
      });
      const exportOverrides = async (download) => {
        const errors = validateEditorOverrides();
        if (errors.length) {
          refreshGroupEditor();
          return false;
        }
        syncRegionOverrides();
        const json = `${JSON.stringify(editorOverrides, null, 2)}\n`;
        if (!download) {
          await navigator.clipboard.writeText(json);
          editor.querySelector("[data-editor-validation]").textContent = "تم نسخ JSON.";
          return true;
        }
        const link = document.createElement("a");
        link.download = "region-overrides.json";
        link.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        return true;
      };
      editor.querySelector("[data-editor-copy]").addEventListener("click", () => exportOverrides(false));
      editor.querySelector("[data-editor-download]").addEventListener("click", () => exportOverrides(true));
      editor.querySelector("[data-editor-save]").addEventListener("click", async () => {
        if (!await exportOverrides(true)) return;
        editor.querySelector("[data-editor-validation]").textContent = "تم حفظ التعديلات محليًا وتنزيل region-overrides.json بنجاح.";
        editor.querySelector("[data-editor-validation]").classList.add("success");
      });
      refreshGroupEditor();
    }

    canvas.addEventListener("pointermove", (event) => {
      const nextRegion = regionAtPointer(event);
      if (nextRegion === highlightedRegionId) return;
      highlightedRegionId = nextRegion;
      renderCanvas();
    });
    canvas.addEventListener("pointerleave", () => {
      if (!highlightedRegionId) return;
      highlightedRegionId = "";
      renderCanvas();
    });
    canvas.addEventListener("pointerdown", (event) => {
      highlightedRegionId = regionAtPointer(event);
      renderCanvas();
    });

    canvas.addEventListener("click", (event) => {
      const regionId = regionAtPointer(event);
      if (debugColoring && activeModelId === "yota-02") {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) * canvas.width / rect.width);
        const y = Math.floor((event.clientY - rect.top) * canvas.height / rect.height);
        const pixel = (y * canvas.width + x) * 4;
        const directRegionId = x >= 0 && y >= 0 && x < canvas.width && y < canvas.height && maskPixels[pixel + 3] !== 0
          ? allRegionByMaskKey.get(`${maskPixels[pixel]},${maskPixels[pixel + 1]},${maskPixels[pixel + 2]}`) || ""
          : "";
        const metadata = regionMetadata.get(regionId);
        console.log("[coloring-game:model-2-debug] Clicked pixel", {
          x,
          y,
          regionId: directRegionId || 0,
          resolvedRegionId: regionId || 0,
          isColorable: Boolean(regionId && metadata?.enabled !== false),
          symmetryGroup: metadata?.shapeGroup || null,
          unsupported: Boolean(directRegionId && !regionMetadata.has(directRegionId))
        });
      }
      if (!regionId) return;
      if (groupEditorMode) {
        if (editorPanMode || editorDidPan) {
          editorDidPan = false;
          return;
        }
        clickedEditorRegion = regionId;
        selectedEditorRegions.has(regionId)
          ? selectedEditorRegions.delete(regionId)
          : selectedEditorRegions.add(regionId);
        refreshGroupEditor();
        return;
      }
      const before = snapshot();
      relatedRegions(regionId).forEach((id) => {
        if (erasing) delete regionColors[id];
        else regionColors[id] = {
          regionId: id,
          colorId: activePaint.id,
          colorName: activePaint.name,
          colorHex: activePaint.hex
        };
      });
      if (snapshot() === before) return;
      undoStack.push(before);
      redoStack.length = 0;
      persistColoringDesign();
      renderCanvas();
      updateHistoryButtons();
      console.log(
        `[coloring-game] totalRegions=${coloringRegions.length} clickedRegionId=${regionId} logicalRegionId=${regionMetadata.get(regionId)?.logicalRegionId || regionId} shapeGroup=${regionMetadata.get(regionId)?.shapeGroup || ""} clickedX=${Math.floor((event.clientX - canvas.getBoundingClientRect().left) * canvas.width / canvas.getBoundingClientRect().width)} clickedY=${Math.floor((event.clientY - canvas.getBoundingClientRect().top) * canvas.height / canvas.getBoundingClientRect().height)} regionsModelVersion=${regionData.modelVersion || "unknown"} numberOfConnectedComponentsForClickedRegion=1 numberOfPixelsColored=${relatedRegions(regionId).reduce((sum, id) => sum + (regionPixelIndexes.get(id)?.length || 0), 0)}`
      );
    });

    panel.querySelectorAll("[data-coloring-color-id]").forEach((button) => button.addEventListener("click", () => {
      activePaint = yotaColorById.get(button.dataset.coloringColorId) || activePaint;
      erasing = false;
      panel.querySelectorAll("[data-coloring-color-id]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      panel.querySelector("[data-coloring-eraser]").setAttribute("aria-pressed", "false");
    }));
    panel.querySelectorAll("[data-coloring-color-id]").forEach((button) => {
      let longPressTimer;
      const clearLongPress = () => {
        clearTimeout(longPressTimer);
        setTimeout(() => button.classList.remove("show-color-name"), 900);
      };
      button.addEventListener("pointerdown", () => {
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => button.classList.add("show-color-name"), 500);
      });
      button.addEventListener("pointerup", clearLongPress);
      button.addEventListener("pointercancel", clearLongPress);
      button.addEventListener("pointerleave", clearLongPress);
    });
    panel.querySelector("[data-coloring-eraser]").addEventListener("click", (event) => {
      erasing = !erasing;
      event.currentTarget.setAttribute("aria-pressed", String(erasing));
    });
    panel.querySelector("[data-coloring-undo]").addEventListener("click", () => {
      if (!undoStack.length) return;
      redoStack.push(snapshot());
      applySnapshot(undoStack.pop());
    });
    panel.querySelector("[data-coloring-redo]").addEventListener("click", () => {
      if (!redoStack.length) return;
      undoStack.push(snapshot());
      applySnapshot(redoStack.pop());
    });
    panel.querySelector("[data-coloring-reset]").addEventListener("click", () => {
      if (Object.keys(regionColors).length) undoStack.push(snapshot());
      redoStack.length = 0;
      Object.keys(regionColors).forEach((regionId) => delete regionColors[regionId]);
      localStorage.removeItem(coloringStorageKey);
      customizationId = "";
      currentColoringDesign = null;
      renderCanvas();
      updateHistoryButtons();
    });
    panel.querySelector("[data-coloring-download]").addEventListener("click", async () => {
      persistColoringDesign();
      const exportTestMode = new URLSearchParams(location.search).get("paintExportTest");
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = baseImage.naturalWidth;
      exportCanvas.height = baseImage.naturalHeight;
      const exportContext = exportCanvas.getContext("2d");
      renderColoringArtwork(exportContext, exportCanvas.width, exportCanvas.height, {
        includeHighlight: false,
        flatMode: exportTestMode === "flat",
        includeDebug: false
      });
      if (exportTestMode) {
        panel.querySelector("[data-export-test-canvas]")?.remove();
        exportCanvas.dataset.exportTestCanvas = exportTestMode;
        exportCanvas.hidden = true;
        panel.append(exportCanvas);
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const link = document.createElement("a");
      link.download = exportTestMode === "flat"
        ? "export-flat-test.png"
        : exportTestMode === "raised"
          ? "export-raised-paint-test.png"
          : `iota-coloring-${product.id}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });

    panel.dataset.ready = "true";
    loading.hidden = true;
    if (debugColoring) loading.insertAdjacentHTML("afterend", `<strong class="product-coloring-debug">Debug: ${coloringRegions.length} regions</strong>`);
    console.log(`[coloring-game] totalRegions=${coloringRegions.length}`);
    syncCurrentColoringDesign();
    renderCanvas();
    updateFinalMedalPreview();
  }).catch((error) => {
    console.error("[coloring-game] Coloring editor initialization failed", {
      productId: product.id || "",
      productSlug: product.slug || "",
      coloringFileUrl: [product.coloringBaseImageUrl, product.coloringMaskUrl, product.coloringOutlineUrl, product.coloringRegionsUrl].filter(Boolean).map(assetUrl),
      httpStatus: Number(error?.status || 0),
      error
    });
    loading.textContent = "تعذر تحميل ملفات التلوين لهذا المنتج.";
  });
}

function render() {
  const optionControls = isMedalProduct ? `
    <fieldset class="medal-wood-options" data-medal-wood-options>
      <legend>اختر نوع الخشب <span aria-hidden="true">*</span></legend>
      <p class="medal-service-discount">خصم الخدمات 10%</p>
      <div class="medal-wood-grid">
        ${variants.map((variant) => {
          const wood = text(variant.options?.[medalWoodOptionName]);
          return `<label class="medal-wood-card">
            <input type="radio" name="medal-wood" value="${escapeHtml(wood)}" data-option="${escapeHtml(medalWoodOptionName)}" required>
            <span><strong>خشب ${escapeHtml(wood)}</strong><small><del>${money(variant.compareAtPrice)}</del> <b>${money(variant.price)}</b></small></span>
          </label>`;
        }).join("")}
      </div>
      <p class="medal-wood-required" data-wood-error>اختيار نوع الخشب مطلوب قبل الإضافة إلى السلة.</p>
    </fieldset>`
    : options.map((option) => {
    const name = text(option.name);
    const values = option.values || [];
    return `<label>${escapeHtml(name)}<select data-option="${escapeHtml(name)}">${values.map((value)=>`<option value="${escapeHtml(text(value))}" ${selected?.options?.[name]===text(value)?"selected":""}>${escapeHtml(text(value))}</option>`).join("")}</select></label>`;
  }).join("");
  root.innerHTML = `<div class="product-route-grid"><div class="product-route-gallery"><button class="product-route-main-image" type="button" data-main data-route-zoom aria-label="تكبير صورة ${escapeHtml(text(product.name))}">${images[0]?imageMarkup(images[0],0,"","main"):""}</button>${images.length>1?`<div class="product-route-thumbs">${images.map((image,index)=>`<button class="product-route-thumb" type="button" data-image="${escapeHtml(image)}" aria-pressed="${index===0}">${imageMarkup(image,index,"","thumbnail")}</button>`).join("")}</div>`:""}</div><article class="product-route-copy"><p class="product-route-category">${escapeHtml(text(product.label||product.badge||product.subcategory||"منتج"))}</p><h1>${escapeHtml(text(product.name))}</h1><p class="product-route-description">${escapeHtml(text(product.description))}</p>${coloringMarkup()}<div class="product-route-price" data-price>${isMedalProduct ? "اختر نوع الخشب لعرض السعر" : money(selected?.price ?? product.price)}</div><div class="product-route-options">${optionControls}</div><div class="product-route-actions"><input class="product-route-quantity" type="number" min="1" value="1" data-quantity aria-label="الكمية"><button class="button primary" type="button" data-add ${isMedalProduct || !available(selected)?"disabled":""}>${isMedalProduct ? "اختر نوع الخشب أولًا" : available(selected)?"أضف إلى السلة":"غير متاح حاليا"}</button><a class="button secondary" href="/cart">عرض السلة</a></div><p class="product-route-message" data-message></p></article></div>`;
}

function chooseVariant() {
  const chosen = Object.fromEntries([...root.querySelectorAll("[data-option]:checked, select[data-option]")].map((control) => [control.dataset.option, control.value]));
  selected = variants.find((variant)=>Object.entries(chosen).every(([key,value])=>text(variant.options?.[key])===value)&&available(variant)) || variants.find((variant)=>Object.entries(chosen).every(([key,value])=>text(variant.options?.[key])===value)) || selected;
  const qty = Math.max(1, Math.floor(Number(root.querySelector("[data-quantity]")?.value) || 1));
  root.querySelector("[data-price]").innerHTML = isMedalProduct && selected
    ? `<span class="medal-price-row"><del>${money(selected.compareAtPrice)}</del><strong>${money(selected.price)}</strong></span><small>خصم الخدمات 10% · الإجمالي: ${money(selected.price * qty)}</small>`
    : money(selected?.price ?? product.price);
  const button = root.querySelector("[data-add]");
  button.disabled = !selected || !available(selected);
  button.textContent = selected && available(selected) ? "أضف إلى السلة" : isMedalProduct ? "اختر نوع الخشب أولًا" : "غير متاح حاليا";
  root.querySelector("[data-wood-error]")?.classList.toggle("is-visible", isMedalProduct && !selected);
  if (isMedalProduct && selected) updateMedalPhotoPreview();
}

function readCart() {
  try { const data=JSON.parse(localStorage.getItem(cartKey)||"{}"); return Array.isArray(data.items)?data.items:[]; } catch { return []; }
}
function updateCount() { cartCount.textContent=readCart().reduce((sum,item)=>sum+(Number(item.qty)||0),0); }
function selectionKey(variantId, coloringDesign) {
  const options = Object.entries(selected?.options || {}).sort(([a], [b]) => a.localeCompare(b, "ar"));
  const coloring = coloringDesign ? JSON.stringify(coloringDesign) : "";
  const value = JSON.stringify({ variantId, options, coloring });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function addToCart() {
  if (isMedalProduct && !selected) {
    root.querySelector("[data-wood-error]")?.classList.add("is-visible");
    root.querySelector("[data-medal-wood-options]")?.focus();
    return;
  }
  const qty=Math.max(1,Math.floor(Number(root.querySelector("[data-quantity]")?.value)||1));
  const items=readCart(); const variantId=selected?.id||"default";
  const coloringDesign = currentColoringDesign ? JSON.parse(JSON.stringify(currentColoringDesign)) : null;
  const lineId = selectionKey(variantId, coloringDesign);
  const found=items.find((item)=>item.productId===product.id&&item.variantId===variantId&&(item.lineId||selectionKey(item.variantId, item.coloringDesign||null))===lineId);
  const medalDetails = isMedalProduct ? {
    woodType: text(selected?.options?.[medalWoodOptionName]),
    previewImage: currentMedalPreviewImage || assetUrl(activeImage),
    designId: product.coloringModelId || product.id,
    designName: text(product.name),
    customizationId: coloringDesign?.customizationId || createCustomizationId(),
    customization: { selectedColors: { ...(coloringDesign?.selectedColors || {}) } },
    selectedColors: { ...(coloringDesign?.selectedColors || {}) },
    finalPrice: Number(selected?.price) || 0
  } : null;
  if(found) {
    found.qty=(Number(found.qty)||0)+qty;
    if (coloringDesign) found.coloringDesign = coloringDesign;
    if (medalDetails) Object.assign(found, medalDetails);
  } else {
    items.push({productId:product.id,variantId,lineId,qty,image:currentMedalPreviewImage||assetUrl(activeImage),price:Number(selected?.price??product.price)||0,options:{...(selected?.options||{})},...(coloringDesign ? { coloringDesign } : {}),...(medalDetails || {})});
  }
  localStorage.setItem(cartKey,JSON.stringify({items,updatedAt:new Date().toISOString()})); localStorage.setItem("pope-kyrillos-cart:active",cartKey); updateCount(); root.querySelector("[data-message]").textContent="تمت إضافة المنتج إلى السلة";
}
async function loadRelated() {
  try { const category=product.mainCategory||product.category||"all"; const response=await fetch(`/api/catalog?category=${encodeURIComponent(category)}&limit=5`); const data=await response.json(); const items=(data.items||[]).filter((item)=>item.id!==product.id).slice(0,4); relatedRoot.innerHTML=items.map((item)=>`<article class="product-card"><a href="/products/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(text(item.name))}" width="320" height="320" loading="lazy" decoding="async"></a><div class="product-info"><h3><a href="/products/${encodeURIComponent(item.slug)}">${escapeHtml(text(item.name))}</a></h3><span class="price">${money(item.price)}</span></div></article>`).join(""); } catch { document.querySelector(".product-route-related")?.remove(); }
}

root.addEventListener("click", (event) => {
  const thumb=event.target.closest("[data-image]");
  if(thumb){activeImage=thumb.dataset.image;root.querySelector("[data-main]").innerHTML=imageMarkup(activeImage,0);root.querySelectorAll("[data-image]").forEach((button)=>button.setAttribute("aria-pressed",String(button===thumb)));if(isMedalProduct&&selected)updateMedalPhotoPreview();return;}
  if(event.target.closest("[data-route-zoom]")) openRouteLightbox();
  if(event.target.closest("[data-add]")) {
    event.preventDefault();
    event.stopPropagation();
    addToCart();
    return;
  }
  const open=event.target.closest("[data-coloring-open]");
  if(open){const panel=root.querySelector("[data-coloring-game]");panel.hidden=false;open.hidden=true;initializeColoringGame(panel);panel.scrollIntoView({behavior:"smooth",block:"center"});return;}
  const close=event.target.closest("[data-coloring-close]");
  if(close){
    close.closest("[data-coloring-game]").hidden=true;
    root.querySelector("[data-coloring-open]").hidden=false;
    document.body.classList.remove("coloring-group-editor-open");
    document.documentElement.classList.remove("coloring-group-editor-open");
  }
});
root.addEventListener("change", (event) => { if(event.target.matches("[data-option], [data-quantity]")) chooseVariant(); });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && routeLightbox?.getAttribute("aria-hidden") === "false") closeRouteLightbox();
});

render();
updateCount();
loadRelated();
