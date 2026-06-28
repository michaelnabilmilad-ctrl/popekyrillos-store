(function () {
  const categories = [
    { id: "brass", label: "نحاسيات" },
    { id: "candles", label: "شموع وبخور" },
    { id: "vestments", label: "أقمشة ومفارش" },
    { id: "icons", label: "أيقونات وهدايا" },
    { id: "books", label: "كتب وطقوس" }
  ];

  const state = {
    products: [],
    selectedId: "",
    fileHandle: null,
    dirty: false,
    search: "",
    categoryFilter: "all"
  };

  const elements = {
    productCount: document.querySelector("[data-product-count]"),
    saveState: document.querySelector("[data-save-state]"),
    productList: document.querySelector("[data-product-list]"),
    search: document.querySelector("[data-search]"),
    categoryFilter: document.querySelector("[data-category-filter]"),
    editor: document.querySelector("[data-editor]"),
    editorEmpty: document.querySelector("[data-editor-empty]"),
    editorTitle: document.querySelector("[data-editor-title]"),
    editorId: document.querySelector("[data-editor-id]"),
    imagePreview: document.querySelector("[data-image-preview]"),
    variantList: document.querySelector("[data-variant-list]"),
    importFallback: document.querySelector("[data-import-fallback]"),
    toast: document.querySelector("[data-toast]"),
    saveFileButton: document.querySelector("[data-action='save-file']"),
    publishProductsButton: document.querySelector("[data-action='publish-products']")
  };

  document.addEventListener("click", handleActionClick);
  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderProductList();
  });
  elements.categoryFilter.addEventListener("change", (event) => {
    state.categoryFilter = event.target.value;
    renderProductList();
  });
  elements.importFallback.addEventListener("change", importFallbackFile);
  elements.editor.addEventListener("input", handleEditorInput);
  elements.editor.addEventListener("change", handleEditorInput);

  fillCategorySelects();
  loadProductsFromSite();

  async function handleActionClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "load-site") {
      await loadProductsFromSite();
    }

    if (action === "open-file") {
      await openProductsFile();
    }

    if (action === "save-file") {
      await saveProductsToOpenedFile();
    }

    if (action === "publish-products") {
      await publishProductsToSite();
    }

    if (action === "download-products") {
      downloadJson("products.json", normalizeProducts(state.products));
    }

    if (action === "download-functions") {
      downloadJson("functions-products.json", buildFunctionsProducts());
    }

    if (action === "copy-json") {
      await copyProductsJson();
    }

    if (action === "add-product") {
      addProduct();
    }

    if (action === "duplicate-product") {
      duplicateProduct();
    }

    if (action === "delete-product") {
      deleteProduct();
    }

    if (action === "add-variant") {
      addVariant();
    }

    if (action === "remove-variant") {
      removeVariant(Number(button.closest("[data-variant-index]")?.dataset.variantIndex));
    }

    if (action === "sort-name") {
      sortProductsByName();
    }
  }

  async function loadProductsFromSite() {
    try {
      const response = await fetch(`/products.json?admin=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const products = await response.json();
      setProducts(products, "تم تحميل منتجات الموقع");
      state.fileHandle = null;
      elements.saveFileButton.disabled = true;
    } catch (error) {
      showToast("تعذر تحميل products.json. افتح الملف من جهازك بدلاً من ذلك.");
      console.error(error);
    }
  }

  async function openProductsFile() {
    if (!window.showOpenFilePicker) {
      elements.importFallback.click();
      return;
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Product JSON",
            accept: { "application/json": [".json"] }
          }
        ],
        multiple: false
      });
      const file = await fileHandle.getFile();
      const text = await file.text();
      setProducts(JSON.parse(text), `تم فتح ${file.name}`);
      state.fileHandle = fileHandle;
      elements.saveFileButton.disabled = false;
    } catch (error) {
      if (error.name !== "AbortError") {
        showToast("تعذر فتح الملف. تأكد أنك اخترت products.json صحيح.");
        console.error(error);
      }
    }
  }

  async function importFallbackFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setProducts(JSON.parse(text), `تم استيراد ${file.name}`);
      state.fileHandle = null;
      elements.saveFileButton.disabled = true;
      showToast("المتصفح لا يدعم الحفظ المباشر، استخدم زر تحميل products.json بعد التعديل.");
    } catch (error) {
      showToast("الملف غير صالح.");
      console.error(error);
    } finally {
      event.target.value = "";
    }
  }

  async function saveProductsToOpenedFile() {
    if (!state.fileHandle) {
      showToast("افتح ملف products.json من جهازك أولاً حتى أقدر أحفظ عليه.");
      return;
    }

    try {
      const writable = await state.fileHandle.createWritable();
      await writable.write(formatJson(normalizeProducts(state.products)));
      await writable.close();
      state.dirty = false;
      renderStatus("تم الحفظ في نفس الملف");
      showToast("تم حفظ products.json بنجاح.");
    } catch (error) {
      showToast("تعذر الحفظ. جرّب تحميل نسخة جديدة بدلاً من الحفظ المباشر.");
      console.error(error);
    }
  }

  async function publishProductsToSite() {
    if (!state.products.length) {
      showToast("لا توجد منتجات للنشر.");
      return;
    }

    const confirmed = window.confirm("سيتم حفظ products.json على GitHub وبدء نشر الموقع. هل تريد المتابعة؟");
    if (!confirmed) return;

    const previousText = elements.publishProductsButton?.textContent || "";

    try {
      if (elements.publishProductsButton) {
        elements.publishProductsButton.disabled = true;
        elements.publishProductsButton.textContent = "جاري الحفظ والنشر...";
      }

      const products = normalizeProducts(state.products);
      const response = await fetch("/admin/api/update-products", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products,
          message: `Update products from admin ${new Date().toISOString()}`
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || result.message || `HTTP ${response.status}`);
      }

      state.products = products;
      state.dirty = false;
      renderAll(`تم نشر المنتجات. Commit: ${(result.commitSha || "").slice(0, 7)}`);
      showToast("تم حفظ products.json على GitHub. Cloudflare سيبدأ النشر تلقائياً خلال دقائق.");
    } catch (error) {
      showToast(`تعذر النشر: ${error.message}`);
      console.error(error);
    } finally {
      if (elements.publishProductsButton) {
        elements.publishProductsButton.disabled = false;
        elements.publishProductsButton.textContent = previousText;
      }
    }
  }

  async function copyProductsJson() {
    try {
      await navigator.clipboard.writeText(formatJson(normalizeProducts(state.products)));
      showToast("تم نسخ JSON.");
    } catch (error) {
      showToast("تعذر النسخ من المتصفح.");
      console.error(error);
    }
  }

  function setProducts(products, message) {
    state.products = Array.isArray(products) ? products : [];
    state.selectedId = state.products[0]?.id || "";
    state.dirty = false;
    fillCategoryFilter();
    renderAll(message);
  }

  function fillCategorySelects() {
    const categorySelect = elements.editor.querySelector("[data-field='category']");
    categorySelect.innerHTML = categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`).join("");
    fillCategoryFilter();
  }

  function fillCategoryFilter() {
    const counts = new Map();
    state.products.forEach((product) => {
      counts.set(product.category, (counts.get(product.category) || 0) + 1);
    });

    elements.categoryFilter.innerHTML = [
      `<option value="all">كل الأقسام (${state.products.length})</option>`,
      ...categories.map((category) => `<option value="${category.id}">${category.label} (${counts.get(category.id) || 0})</option>`)
    ].join("");
    elements.categoryFilter.value = state.categoryFilter;
  }

  function renderAll(message) {
    renderStatus(message);
    renderProductList();
    renderEditor();
  }

  function renderStatus(message) {
    elements.productCount.textContent = `${state.products.length} منتج`;
    elements.saveState.textContent = state.dirty ? "يوجد تعديلات غير محفوظة" : message || "جاهز";
    elements.saveState.style.color = state.dirty ? "var(--burgundy)" : "var(--muted)";
  }

  function renderProductList() {
    if (!state.products.length) {
      elements.productList.innerHTML = `<div class="empty-state">لا توجد منتجات محملة.</div>`;
      return;
    }

    const products = filteredProducts();
    if (!products.length) {
      elements.productList.innerHTML = `<div class="empty-state">لا توجد نتائج بهذا البحث.</div>`;
      return;
    }

    elements.productList.innerHTML = products.map((product) => {
      const category = categories.find((item) => item.id === product.category)?.label || product.category || "بدون قسم";
      const selected = product.id === state.selectedId ? " active" : "";
      const price = product.price ? `${formatNumber(product.price)} ج.م` : "بدون سعر";
      return `
        <button class="product-list-item${selected}" type="button" data-select-product="${escapeHtml(product.id)}">
          <strong>${escapeHtml(product.name || "منتج بدون اسم")}</strong>
          <span>${escapeHtml(category)} - ${escapeHtml(product.label || "بدون تصنيف")}</span>
          <small>${escapeHtml(price)}</small>
        </button>
      `;
    }).join("");

    elements.productList.querySelectorAll("[data-select-product]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedId = button.dataset.selectProduct;
        renderProductList();
        renderEditor();
      });
    });
  }

  function filteredProducts() {
    return state.products.filter((product) => {
      const searchText = [product.id, product.name, product.label, product.badge, product.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !state.search || searchText.includes(state.search);
      const matchesCategory = state.categoryFilter === "all" || product.category === state.categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }

  function renderEditor() {
    const product = currentProduct();
    elements.editor.hidden = !product;
    elements.editorEmpty.hidden = Boolean(product);

    if (!product) return;

    ensureProductShape(product);
    elements.editorTitle.textContent = product.name || "منتج بدون اسم";
    elements.editorId.textContent = `الكود: ${product.id}`;

    setValue("name", product.name);
    setValue("id", product.id);
    setValue("category", product.category);
    setValue("label", product.label);
    setValue("badge", product.badge);
    setValue("stock", product.stock || "متاح");
    setValue("price", product.price ?? "");
    setValue("priceNote", product.priceNote);
    setValue("description", product.description);
    setValue("tags", arrayToLines(product.tags));
    setValue("images", arrayToLines(product.images?.length ? product.images : [product.image].filter(Boolean)));
    setValue("options", JSON.stringify(product.options || [], null, 2));

    renderImagePreview(product.images || []);
    renderVariants(product);
  }

  function renderImagePreview(images) {
    const visibleImages = (images || []).filter(Boolean).slice(0, 8);
    if (!visibleImages.length) {
      elements.imagePreview.innerHTML = `<div class="empty-state">لا توجد صور بعد.</div>`;
      return;
    }

    elements.imagePreview.innerHTML = visibleImages.map((image, index) => `
      <figure>
        <img src="${escapeAttribute(previewAssetUrl(image))}" alt="صورة ${index + 1}" loading="lazy" decoding="async" onerror="this.closest('figure').classList.add('image-missing')">
        <figcaption>${escapeHtml(image)}</figcaption>
      </figure>
    `).join("");
  }

  function renderVariants(product) {
    if (!product.variants.length) product.variants.push(createVariant(product));

    elements.variantList.innerHTML = product.variants.map((variant, index) => {
      const optionsText = JSON.stringify(variant.options || {}, null, 2);
      const imagesText = arrayToLines(variant.images || [variant.image].filter(Boolean));
      return `
        <article class="variant-card" data-variant-index="${index}">
          <div class="variant-head">
            <strong>اختيار ${index + 1}</strong>
            <button class="button small danger" type="button" data-action="remove-variant">حذف الاختيار</button>
          </div>
          <div class="variant-grid">
            <label>
              <span>اسم الاختيار</span>
              <input type="text" data-variant-field="title" value="${escapeAttribute(variant.title || "")}">
            </label>
            <label>
              <span>السعر</span>
              <input type="number" min="0" step="1" data-variant-field="price" value="${escapeAttribute(variant.price ?? "")}">
            </label>
            <label>
              <span>السعر قبل الخصم</span>
              <input type="number" min="0" step="1" data-variant-field="compareAtPrice" value="${escapeAttribute(variant.compareAtPrice ?? "")}">
            </label>
            <label>
              <span>الكمية المتاحة</span>
              <input type="number" min="0" step="1" data-variant-field="quantity" value="${escapeAttribute(variant.quantity ?? "")}">
            </label>
            <label>
              <span>SKU</span>
              <input type="text" data-variant-field="sku" value="${escapeAttribute(variant.sku || "")}">
            </label>
            <label class="check-row">
              <input type="checkbox" data-variant-field="available" ${variant.available !== false ? "checked" : ""}>
              <span>متاح للبيع</span>
            </label>
          </div>
          <label>
            <span>اختيارات هذا السطر JSON</span>
            <textarea rows="4" dir="ltr" data-variant-field="options">${escapeHtml(optionsText)}</textarea>
          </label>
          <label>
            <span>صور هذا الاختيار - كل مسار في سطر</span>
            <textarea rows="3" dir="ltr" data-variant-field="images">${escapeHtml(imagesText)}</textarea>
          </label>
        </article>
      `;
    }).join("");
  }

  function handleEditorInput(event) {
    const product = currentProduct();
    if (!product) return;

    const fieldElement = event.target.closest("[data-field]");
    const variantElement = event.target.closest("[data-variant-field]");

    if (fieldElement) updateProductField(product, fieldElement);
    if (variantElement) updateVariantField(product, variantElement);

    markDirty();
  }

  function updateProductField(product, element) {
    const field = element.dataset.field;
    const value = element.value;

    if (field === "id") {
      const oldId = product.id;
      product.id = slugLike(value) || oldId;
      state.selectedId = product.id;
      elements.editorId.textContent = `الكود: ${product.id}`;
      renderProductList();
      return;
    }

    if (field === "price") {
      product.price = numberOrNull(value) ?? 0;
      syncSingleDefaultVariant(product);
      renderProductList();
      return;
    }

    if (field === "images") {
      product.images = parseImageLines(value);
      syncNormalizedFieldValue(element, product.images);
      product.image = product.images[0] || "";
      renderImagePreview(product.images);
      return;
    }

    if (field === "tags") {
      product.tags = parseLines(value);
      return;
    }

    if (field === "options") {
      try {
        product.options = JSON.parse(value || "[]");
        element.setCustomValidity("");
      } catch {
        element.setCustomValidity("صيغة JSON غير صحيحة");
      }
      return;
    }

    product[field] = value;

    if (field === "name") {
      elements.editorTitle.textContent = product.name || "منتج بدون اسم";
      renderProductList();
    }

    if (field === "category" || field === "label" || field === "badge") {
      fillCategoryFilter();
      renderProductList();
    }

    if (field === "stock") {
      const available = value !== "غير متاح حاليا";
      product.variants.forEach((variant) => {
        if (variant.available !== available && product.variants.length === 1) variant.available = available;
      });
      renderVariants(product);
    }
  }

  function updateVariantField(product, element) {
    const card = element.closest("[data-variant-index]");
    const index = Number(card?.dataset.variantIndex);
    const variant = product.variants[index];
    if (!variant) return;

    const field = element.dataset.variantField;

    if (field === "available") {
      variant.available = element.checked;
      return;
    }

    if (field === "price" || field === "compareAtPrice" || field === "quantity") {
      variant[field] = numberOrNull(element.value);
      if (field === "price" && product.variants.length === 1) {
        product.price = variant.price ?? 0;
        setValue("price", product.price);
        renderProductList();
      }
      return;
    }

    if (field === "options") {
      try {
        variant.options = JSON.parse(element.value || "{}");
        element.setCustomValidity("");
      } catch {
        element.setCustomValidity("صيغة JSON غير صحيحة");
      }
      return;
    }

    if (field === "images") {
      variant.images = parseImageLines(element.value);
      syncNormalizedFieldValue(element, variant.images);
      variant.image = variant.images[0] || null;
      return;
    }

    variant[field] = element.value;
  }

  function addProduct() {
    const id = `custom-${Date.now()}`;
    const product = {
      id,
      name: "منتج جديد",
      category: "brass",
      label: "نحاسيات",
      description: "",
      price: 0,
      priceNote: "",
      stock: "متاح",
      badge: "",
      image: "",
      url: `https://popekyrillos.store/?product=${id}`,
      tags: [],
      images: [],
      options: [],
      variants: []
    };
    product.variants.push(createVariant(product));
    state.products.unshift(product);
    state.selectedId = id;
    markDirty();
    fillCategoryFilter();
    renderProductList();
    renderEditor();
    showToast("تم إضافة منتج جديد.");
  }

  function duplicateProduct() {
    const product = currentProduct();
    if (!product) return;

    const copy = deepClone(product);
    copy.id = `${product.id}-copy-${Date.now()}`;
    copy.name = `${product.name || "منتج"} - نسخة`;
    copy.url = `https://popekyrillos.store/?product=${copy.id}`;
    copy.variants = (copy.variants || []).map((variant, index) => ({
      ...variant,
      id: `${copy.id}-variant-${index + 1}`
    }));
    state.products.unshift(copy);
    state.selectedId = copy.id;
    markDirty();
    fillCategoryFilter();
    renderProductList();
    renderEditor();
    showToast("تم تكرار المنتج.");
  }

  function deleteProduct() {
    const product = currentProduct();
    if (!product) return;
    const confirmed = window.confirm(`هل تريد حذف "${product.name}"؟`);
    if (!confirmed) return;

    state.products = state.products.filter((item) => item.id !== product.id);
    state.selectedId = state.products[0]?.id || "";
    markDirty();
    fillCategoryFilter();
    renderProductList();
    renderEditor();
    showToast("تم حذف المنتج من النسخة الحالية.");
  }

  function addVariant() {
    const product = currentProduct();
    if (!product) return;
    product.variants.push(createVariant(product, product.variants.length + 1));
    markDirty();
    renderVariants(product);
  }

  function removeVariant(index) {
    const product = currentProduct();
    if (!product || Number.isNaN(index)) return;
    product.variants.splice(index, 1);
    if (!product.variants.length) product.variants.push(createVariant(product));
    markDirty();
    renderVariants(product);
  }

  function sortProductsByName() {
    state.products.sort((first, second) => (first.name || "").localeCompare(second.name || "", "ar"));
    markDirty();
    renderProductList();
  }

  function currentProduct() {
    return state.products.find((product) => product.id === state.selectedId) || null;
  }

  function ensureProductShape(product) {
    product.images = Array.isArray(product.images) ? product.images : [product.image].filter(Boolean);
    product.tags = Array.isArray(product.tags) ? product.tags : [];
    product.options = Array.isArray(product.options) ? product.options : [];
    product.variants = Array.isArray(product.variants) ? product.variants : [];
  }

  function createVariant(product, index = 1) {
    return {
      id: `${product.id || "product"}-variant-${Date.now()}-${index}`,
      title: index === 1 ? "الاختيار الافتراضي" : `اختيار ${index}`,
      options: {},
      price: product.price ?? 0,
      compareAtPrice: null,
      available: product.stock !== "غير متاح حاليا",
      image: product.image || null,
      images: product.images?.length ? [product.images[0]] : [],
      sku: "",
      quantity: null
    };
  }

  function syncSingleDefaultVariant(product) {
    if (product.variants?.length !== 1) return;
    const variant = product.variants[0];
    if (!variant || Object.keys(variant.options || {}).length) return;
    variant.price = product.price ?? 0;
  }

  function normalizeProducts(products) {
    return deepClone(products).map((product) => {
      ensureProductShape(product);
      product.id = slugLike(product.id || product.name || `custom-${Date.now()}`);
      product.name = product.name || "منتج بدون اسم";
      product.category = product.category || "brass";
      product.label = product.label || categories.find((category) => category.id === product.category)?.label || "";
      product.price = numberOrNull(product.price) ?? 0;
      product.priceNote = product.priceNote || "";
      product.stock = product.stock || "متاح";
      product.badge = product.badge || product.label || "";
      product.tags = unique(product.tags || []);
      product.images = unique((product.images || []).map(normalizeImagePath).filter(Boolean));
      product.image = product.images[0] || normalizeImagePath(product.image) || "";
      product.url = product.url || `https://popekyrillos.store/?product=${product.id}`;
      product.variants = product.variants.length ? product.variants : [createVariant(product)];
      product.variants = product.variants.map((variant, index) => normalizeVariant(product, variant, index));
      return product;
    });
  }

  function normalizeVariant(product, variant, index) {
    const images = unique((variant.images || [variant.image].filter(Boolean)).map(normalizeImagePath).filter(Boolean));
    return {
      id: variant.id || `${product.id}-variant-${index + 1}`,
      title: variant.title || `اختيار ${index + 1}`,
      options: variant.options || {},
      price: numberOrNull(variant.price) ?? product.price ?? 0,
      compareAtPrice: numberOrNull(variant.compareAtPrice),
      available: variant.available !== false,
      image: images[0] || normalizeImagePath(variant.image) || null,
      images,
      sku: variant.sku || "",
      quantity: numberOrNull(variant.quantity)
    };
  }

  function buildFunctionsProducts() {
    return normalizeProducts(state.products).map((product) => mapProductImages(product, mapAssetPathForFunctions));
  }

  function mapProductImages(product, mapper) {
    const copy = deepClone(product);
    copy.image = mapper(copy.image);
    copy.images = (copy.images || []).map(mapper);
    copy.variants = (copy.variants || []).map((variant) => ({
      ...variant,
      image: mapper(variant.image),
      images: (variant.images || []).map(mapper)
    }));
    return copy;
  }

  function mapAssetPathForFunctions(path) {
    if (!path) return path;
    return path
      .replace(/^assets\/optimized\/products\//, "assets/products/")
      .replace(/^assets\/detail\/products\//, "assets/products/")
      .replace(/\.webp$/i, ".jpg");
  }

  function downloadJson(filename, data) {
    const blob = new Blob([formatJson(data)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`تم تجهيز ${filename}.`);
  }

  function markDirty() {
    state.dirty = true;
    renderStatus();
  }

  function setValue(field, value) {
    const element = elements.editor.querySelector(`[data-field="${field}"]`);
    if (element) element.value = value ?? "";
  }

  function parseLines(value) {
    return unique(String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean));
  }

  function parseImageLines(value) {
    return unique(String(value || "")
      .split(/\r?\n/)
      .map(normalizeImagePath)
      .filter(Boolean));
  }

  function normalizeLatinDigits(value = "") {
    return String(value || "")
      .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  }

  function normalizeImagePath(value = "") {
    return normalizeLatinDigits(value)
      .trim()
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\\/g, "/")
      .replace(/\s+/g, "%20");
  }

  function previewAssetUrl(path = "") {
    const value = String(path || "");
    if (!value || /^(?:https?:|data:|blob:|\/)/i.test(value)) return value;
    if (value.startsWith("assets/")) return `/${value}`;
    return value;
  }

  function syncNormalizedFieldValue(element, values) {
    const normalizedValue = arrayToLines(values);
    if (element.value !== normalizedValue) element.value = normalizedValue;
  }

  function arrayToLines(value) {
    return (Array.isArray(value) ? value : []).filter(Boolean).join("\n");
  }

  function numberOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const normalized = String(value).replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ar-EG").format(numberOrNull(value) ?? 0);
  }

  function slugLike(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u0600-\u06ff-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function unique(items) {
    return [...new Set(items.filter((item) => item !== null && item !== undefined && item !== ""))];
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function formatJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("\n", " ");
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3200);
  }
})();
