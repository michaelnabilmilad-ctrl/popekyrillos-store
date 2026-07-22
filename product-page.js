const product = JSON.parse(document.querySelector("#product-data")?.textContent || "{}");
const root = document.querySelector("#product-detail");
const relatedRoot = document.querySelector("[data-related-products]");
const cartCount = document.querySelector("[data-cart-count]");
const cartKey = "pope-kyrillos-cart:guest";
const coloringStorageKey = `pope-kyrillos-coloring:${product.id || "product"}`;

const text = (value) => typeof value === "object" && value ? value.ar || value.en || Object.values(value)[0] || "" : String(value || "");
const money = (value) => Number.isFinite(Number(value)) ? `${new Intl.NumberFormat("ar-EG").format(Number(value))} ج.م` : "";
const escapeHtml = (value) => String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const assetUrl = (value) => /^(?:https?:)?\/\//i.test(String(value || "")) || String(value || "").startsWith("/") ? String(value || "") : `/${String(value || "").replace(/^\/+/, "")}`;
const images = [...new Set([...(product.images || []), product.image].filter(Boolean))];
const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{ id:"default", price:product.price, available:product.stock !== "غير متاح حاليا", options:{} }];
const options = Array.isArray(product.options) ? product.options : [];
const coloringRegions = Array.isArray(product.coloringRegions) ? product.coloringRegions : [];
const regionByMaskKey = new Map(coloringRegions.map((region) => [region.maskColor.join(","), region.id]));
const hasColoringGame = Boolean(product.coloringBaseImageUrl && product.coloringMaskUrl && product.coloringOutlineUrl && coloringRegions.length);
let selected = variants.find((variant) => variant.available !== false) || variants[0];

function imageMarkup(source, index, className="") {
  return `<img class="${className}" src="${escapeHtml(assetUrl(source))}" alt="${index === 0 ? escapeHtml(text(product.name)) : ""}" width="800" height="800" ${index ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">`;
}

function available(variant) {
  const qty = Number(variant?.quantity);
  return Number.isInteger(qty) && qty >= 0 ? qty > 0 : variant?.available !== false;
}

function coloringMarkup() {
  if (!hasColoringGame) return "";
  const colors = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#ec407a", "#6d4c41"];
  return `
    <button class="button product-coloring-launch" type="button" data-coloring-open>✏️ العب ولوّن المادلية دي</button>
    <section class="product-coloring-game" data-coloring-game hidden>
      <div class="product-coloring-heading">
        <div><strong>لوّن مادلية اليوتا</strong><small>اختار لون واضغط داخل أي جزء لتلوينه بالكامل</small></div>
        <button type="button" data-coloring-close aria-label="إغلاق لعبة التلوين">×</button>
      </div>
      <div class="product-coloring-stage">
        <canvas data-coloring-canvas role="img" aria-label="لعبة تلوين مادلية اليوتا"></canvas>
        <span data-coloring-loading>بنجهّز مناطق التلوين…</span>
      </div>
      <div class="product-coloring-palette" aria-label="لوحة الألوان">
        ${colors.map((color,index)=>`<button type="button" data-coloring-color="${color}" style="--swatch:${color}" aria-label="اللون ${index+1}" aria-pressed="${index===0}"></button>`).join("")}
      </div>
      <div class="product-coloring-tools">
        <label><span class="product-coloring-symmetry"><input type="checkbox" data-coloring-symmetry checked> لوّن الأجزاء المتناظرة معًا</span></label>
        <button type="button" data-coloring-eraser aria-pressed="false">الممحاة</button>
        <button type="button" data-coloring-reset>ابدأ من جديد</button>
        <button class="primary" type="button" data-coloring-download>احفظ الرسمة</button>
      </div>
    </section>`;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = assetUrl(source);
  });
}

function readSavedColoring() {
  try {
    const parsed = JSON.parse(localStorage.getItem(coloringStorageKey) || "{}");
    return Object.fromEntries(Object.entries(parsed).filter(([regionId, color]) => coloringRegions.some((region) => region.id === regionId) && /^#[0-9a-f]{6}$/i.test(color)));
  } catch {
    return {};
  }
}

function initializeColoringGame(panel) {
  if (!panel || panel.dataset.ready === "true") return;
  const canvas = panel.querySelector("[data-coloring-canvas]");
  const loading = panel.querySelector("[data-coloring-loading]");
  Promise.all([
    loadImage(product.coloringBaseImageUrl),
    loadImage(product.coloringMaskUrl),
    loadImage(product.coloringOutlineUrl)
  ]).then(([baseImage, maskImage, outlineImage]) => {
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
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
    const overlayContext = overlayCanvas.getContext("2d");
    const regionPixelIndexes = new Map(coloringRegions.map((region) => [region.id, []]));
    const regionColors = readSavedColoring();
    let activeColor = "#e53935";
    let erasing = false;

    for (let pixel = 0; pixel < maskPixels.length; pixel += 4) {
      const regionId = regionByMaskKey.get(`${maskPixels[pixel]},${maskPixels[pixel+1]},${maskPixels[pixel+2]}`);
      if (regionId) regionPixelIndexes.get(regionId).push(pixel);
    }

    const renderCanvas = () => {
      const overlay = overlayContext.createImageData(canvas.width, canvas.height);
      Object.entries(regionColors).forEach(([regionId, color]) => {
        const match = color.match(/[0-9a-f]{2}/gi);
        if (!match || !regionPixelIndexes.has(regionId)) return;
        const [red, green, blue] = match.map((part) => parseInt(part, 16));
        regionPixelIndexes.get(regionId).forEach((pixel) => {
          overlay.data[pixel] = red;
          overlay.data[pixel+1] = green;
          overlay.data[pixel+2] = blue;
          overlay.data[pixel+3] = 170;
        });
      });
      overlayContext.putImageData(overlay, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(baseImage, 0, 0);
      context.save();
      context.globalCompositeOperation = "multiply";
      context.drawImage(overlayCanvas, 0, 0);
      context.restore();
      context.drawImage(outlineImage, 0, 0);
    };

    const relatedRegions = (regionId) => {
      if (!panel.querySelector("[data-coloring-symmetry]")?.checked) return [regionId];
      const group = (product.symmetryGroups || []).find((items) => items.includes(regionId));
      return group || [regionId];
    };

    const regionAtPointer = (event) => {
      const bounds = canvas.getBoundingClientRect();
      const imageAspect = canvas.width / canvas.height;
      const boxAspect = bounds.width / bounds.height;
      const renderedWidth = boxAspect > imageAspect ? bounds.height * imageAspect : bounds.width;
      const renderedHeight = boxAspect > imageAspect ? bounds.height : bounds.width / imageAspect;
      const offsetX = (bounds.width - renderedWidth) / 2;
      const offsetY = (bounds.height - renderedHeight) / 2;
      const localX = event.clientX - bounds.left - offsetX;
      const localY = event.clientY - bounds.top - offsetY;
      if (localX < 0 || localY < 0 || localX >= renderedWidth || localY >= renderedHeight) return "";
      const x = Math.min(canvas.width - 1, Math.floor(localX * canvas.width / renderedWidth));
      const y = Math.min(canvas.height - 1, Math.floor(localY * canvas.height / renderedHeight));
      const pixel = (y * canvas.width + x) * 4;
      return regionByMaskKey.get(`${maskPixels[pixel]},${maskPixels[pixel+1]},${maskPixels[pixel+2]}`) || "";
    };

    canvas.addEventListener("click", (event) => {
      const regionId = regionAtPointer(event);
      if (!regionId) return;
      relatedRegions(regionId).forEach((id) => {
        if (erasing) delete regionColors[id];
        else regionColors[id] = activeColor;
      });
      localStorage.setItem(coloringStorageKey, JSON.stringify(regionColors));
      renderCanvas();
    });

    panel.querySelectorAll("[data-coloring-color]").forEach((button) => button.addEventListener("click", () => {
      activeColor = button.dataset.coloringColor;
      erasing = false;
      panel.querySelectorAll("[data-coloring-color]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      panel.querySelector("[data-coloring-eraser]").setAttribute("aria-pressed", "false");
    }));
    panel.querySelector("[data-coloring-eraser]").addEventListener("click", (event) => {
      erasing = !erasing;
      event.currentTarget.setAttribute("aria-pressed", String(erasing));
    });
    panel.querySelector("[data-coloring-reset]").addEventListener("click", () => {
      Object.keys(regionColors).forEach((regionId) => delete regionColors[regionId]);
      localStorage.removeItem(coloringStorageKey);
      renderCanvas();
    });
    panel.querySelector("[data-coloring-download]").addEventListener("click", () => {
      localStorage.setItem(coloringStorageKey, JSON.stringify(regionColors));
      renderCanvas();
      const link = document.createElement("a");
      link.download = `iota-coloring-${product.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });

    panel.dataset.ready = "true";
    loading.hidden = true;
    renderCanvas();
  }).catch(() => {
    loading.textContent = "تعذر تحميل ملفات التلوين لهذا المنتج.";
  });
}

function render() {
  const optionControls = options.map((option) => {
    const name = text(option.name);
    const values = option.values || [];
    return `<label>${escapeHtml(name)}<select data-option="${escapeHtml(name)}">${values.map((value)=>`<option value="${escapeHtml(text(value))}" ${selected?.options?.[name]===text(value)?"selected":""}>${escapeHtml(text(value))}</option>`).join("")}</select></label>`;
  }).join("");
  root.innerHTML = `<div class="product-route-grid"><div class="product-route-gallery"><div class="product-route-main-image" data-main>${images[0]?imageMarkup(images[0],0):""}</div>${images.length>1?`<div class="product-route-thumbs">${images.map((image,index)=>`<button class="product-route-thumb" type="button" data-image="${escapeHtml(image)}" aria-pressed="${index===0}">${imageMarkup(image,index)}</button>`).join("")}</div>`:""}</div><article class="product-route-copy"><p class="product-route-category">${escapeHtml(text(product.label||product.badge||product.subcategory||"منتج"))}</p><h1>${escapeHtml(text(product.name))}</h1><p class="product-route-description">${escapeHtml(text(product.description))}</p>${coloringMarkup()}<p class="product-route-price" data-price>${money(selected?.price ?? product.price)}</p><div class="product-route-options">${optionControls}</div><div class="product-route-actions"><input class="product-route-quantity" type="number" min="1" value="1" data-quantity aria-label="الكمية"><button class="button primary" type="button" data-add ${available(selected)?"":"disabled"}>${available(selected)?"أضف إلى السلة":"غير متاح حاليا"}</button><a class="button secondary" href="/cart">عرض السلة</a></div><p class="product-route-message" data-message></p></article></div>`;
}

function chooseVariant() {
  const chosen = Object.fromEntries([...root.querySelectorAll("[data-option]")].map((select) => [select.dataset.option, select.value]));
  selected = variants.find((variant)=>Object.entries(chosen).every(([key,value])=>text(variant.options?.[key])===value)&&available(variant)) || variants.find((variant)=>Object.entries(chosen).every(([key,value])=>text(variant.options?.[key])===value)) || selected;
  root.querySelector("[data-price]").textContent = money(selected?.price ?? product.price);
  const button = root.querySelector("[data-add]");
  button.disabled = !available(selected);
  button.textContent = available(selected) ? "أضف إلى السلة" : "غير متاح حاليا";
}

function readCart() {
  try { const data=JSON.parse(localStorage.getItem(cartKey)||"{}"); return Array.isArray(data.items)?data.items:[]; } catch { return []; }
}
function updateCount() { cartCount.textContent=readCart().reduce((sum,item)=>sum+(Number(item.qty)||0),0); }
function addToCart() {
  const qty=Math.max(1,Math.floor(Number(root.querySelector("[data-quantity]")?.value)||1));
  const items=readCart(); const variantId=selected?.id||"default"; const found=items.find((item)=>item.productId===product.id&&item.variantId===variantId);
  if(found) found.qty=(Number(found.qty)||0)+qty; else items.push({productId:product.id,variantId,qty});
  localStorage.setItem(cartKey,JSON.stringify({items,updatedAt:new Date().toISOString()})); localStorage.setItem("pope-kyrillos-cart:active",cartKey); updateCount(); root.querySelector("[data-message]").textContent="تمت الإضافة إلى السلة";
}
async function loadRelated() {
  try { const category=product.mainCategory||product.category||"all"; const response=await fetch(`/api/catalog?category=${encodeURIComponent(category)}&limit=5`); const data=await response.json(); const items=(data.items||[]).filter((item)=>item.id!==product.id).slice(0,4); relatedRoot.innerHTML=items.map((item)=>`<article class="product-card"><a href="/products/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.thumbnail)}" alt="${escapeHtml(text(item.name))}" width="320" height="320" loading="lazy" decoding="async"></a><div class="product-info"><h3><a href="/products/${encodeURIComponent(item.slug)}">${escapeHtml(text(item.name))}</a></h3><span class="price">${money(item.price)}</span></div></article>`).join(""); } catch { document.querySelector(".product-route-related")?.remove(); }
}

root.addEventListener("click", (event) => {
  const thumb=event.target.closest("[data-image]");
  if(thumb){root.querySelector("[data-main]").innerHTML=imageMarkup(thumb.dataset.image,0);root.querySelectorAll("[data-image]").forEach((button)=>button.setAttribute("aria-pressed",String(button===thumb)));}
  if(event.target.closest("[data-add]")) addToCart();
  const open=event.target.closest("[data-coloring-open]");
  if(open){const panel=root.querySelector("[data-coloring-game]");panel.hidden=false;open.hidden=true;initializeColoringGame(panel);panel.scrollIntoView({behavior:"smooth",block:"center"});return;}
  const close=event.target.closest("[data-coloring-close]");
  if(close){close.closest("[data-coloring-game]").hidden=true;root.querySelector("[data-coloring-open]").hidden=false;}
});
root.addEventListener("change", (event) => { if(event.target.matches("[data-option]")) chooseVariant(); });

render();
updateCount();
loadRelated();
