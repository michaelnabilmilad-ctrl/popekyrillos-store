(function () {
  const categories = [
    { id: "brass", label: "نحاسيات" },
    { id: "candles", label: "شموع وبخور" },
    { id: "vestments", label: "أقمشة ومفارش" },
    { id: "icons", label: "أيقونات وهدايا" },
    { id: "books", label: "كتب وطقوس" },
    { id: "atb3ho", label: "منتجات أتبعه" }
  ];

  const taxonomy = window.POPE_KYRILLOS_TAXONOMY || null;
  const taxonomyCategories = taxonomy?.categories || [];
  const legacyCategoryToMainCategory = {
    brass: "altar-tools",
    candles: "candles-incense",
    vestments: "church-vestments",
    icons: "icons-frames",
    books: "books-rituals",
    atb3ho: "atb3ho-products"
  };

  const state = {
    products: [],
    taxonomy: deepClone(taxonomyCategories),
    taxonomyMain: taxonomyCategories.find((category) => !category.hiddenFromCustomerNav)?.id || taxonomyCategories[0]?.id || "",
    taxonomyImageUpload: null,
    selectedId: "",
    fileHandle: null,
    dirty: false,
    search: "",
    categoryFilter: "all",
    mainCategoryFilter: "all",
    subCategoryFilter: "all",
    needsReviewOnly: false,
    assetPreviewVersion: String(Date.now())
  };

  const elements = {
    productCount: document.querySelector("[data-product-count]"),
    saveState: document.querySelector("[data-save-state]"),
    productList: document.querySelector("[data-product-list]"),
    search: document.querySelector("[data-search]"),
    categoryFilter: document.querySelector("[data-category-filter]"),
    mainCategoryFilter: document.querySelector("[data-main-category-filter]"),
    subCategoryFilter: document.querySelector("[data-sub-category-filter]"),
    needsReviewFilter: document.querySelector("[data-needs-review-filter]"),
    editor: document.querySelector("[data-editor]"),
    editorEmpty: document.querySelector("[data-editor-empty]"),
    editorTitle: document.querySelector("[data-editor-title]"),
    editorId: document.querySelector("[data-editor-id]"),
    imagePreview: document.querySelector("[data-image-preview]"),
    variantList: document.querySelector("[data-variant-list]"),
    importFallback: document.querySelector("[data-import-fallback]"),
    imageUpload: document.querySelector("[data-image-upload]"),
    taxonomyMain: document.querySelector("[data-taxonomy-main]"),
    taxonomyList: document.querySelector("[data-taxonomy-list]"),
    toast: document.querySelector("[data-toast]"),
    saveFileButton: document.querySelector("[data-action='save-file']"),
    publishProductsButton: document.querySelector("[data-action='publish-products']"),
    publishTaxonomyButton: document.querySelector("[data-action='publish-taxonomy']")
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
  elements.mainCategoryFilter?.addEventListener("change", (event) => {
    state.mainCategoryFilter = event.target.value;
    state.subCategoryFilter = "all";
    fillSubCategoryFilter();
    renderProductList();
  });
  elements.subCategoryFilter?.addEventListener("change", (event) => {
    state.subCategoryFilter = event.target.value;
    renderProductList();
  });
  elements.needsReviewFilter?.addEventListener("change", (event) => {
    state.needsReviewOnly = event.target.checked;
    renderProductList();
  });
  elements.taxonomyMain?.addEventListener("change", (event) => {
    state.taxonomyMain = event.target.value;
    renderTaxonomyManager();
  });
  elements.taxonomyList?.addEventListener("input", handleTaxonomyInput);
  elements.taxonomyList?.addEventListener("change", handleTaxonomyInput);
  elements.importFallback.addEventListener("change", importFallbackFile);
  getImageUploadInput().addEventListener("change", uploadProductImage);
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

    if (action === "publish-taxonomy") {
      await publishTaxonomyToSite();
    }

    if (action === "upload-image") {
      await openImageUpload();
    }

    if (action === "make-primary-image") {
      makeProductImagePrimary(Number(button.closest("[data-image-index]")?.dataset.imageIndex));
    }

    if (action === "move-image-before") {
      moveProductImage(Number(button.closest("[data-image-index]")?.dataset.imageIndex), -1);
    }

    if (action === "move-image-after") {
      moveProductImage(Number(button.closest("[data-image-index]")?.dataset.imageIndex), 1);
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

    if (action === "download-taxonomy") {
      downloadText("category-taxonomy.js", buildTaxonomyFile(), "text/javascript;charset=utf-8");
    }

    if (action === "add-subcategory") {
      addSubcategory();
    }

    if (action === "upload-taxonomy-image") {
      await openTaxonomyImageUpload(Number(button.closest("[data-taxonomy-sub-index]")?.dataset.taxonomySubIndex));
    }

    if (action === "remove-subcategory") {
      removeSubcategory(Number(button.closest("[data-taxonomy-sub-index]")?.dataset.taxonomySubIndex));
    }

    if (action === "move-subcategory-before") {
      moveSubcategory(Number(button.closest("[data-taxonomy-sub-index]")?.dataset.taxonomySubIndex), -1);
    }

    if (action === "move-subcategory-after") {
      moveSubcategory(Number(button.closest("[data-taxonomy-sub-index]")?.dataset.taxonomySubIndex), 1);
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

    if (action === "sync-variant-options") {
      syncCurrentVariantOptions();
    }

    if (action === "remove-variant") {
      removeVariant(Number(button.closest("[data-variant-index]")?.dataset.variantIndex));
    }

    if (action === "move-variant-before") {
      moveVariant(Number(button.closest("[data-variant-index]")?.dataset.variantIndex), -1);
    }

    if (action === "move-variant-after") {
      moveVariant(Number(button.closest("[data-variant-index]")?.dataset.variantIndex), 1);
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

    const confirmed = window.confirm("سيتم حفظ products.json على فرع المنتجات وتحديث الموقع مباشرة بدون تشغيل Cloudflare build. هل تريد المتابعة؟");
    if (!confirmed) return;

    const previousText = elements.publishProductsButton?.textContent || "";

    try {
      if (elements.publishProductsButton) {
        elements.publishProductsButton.disabled = true;
        elements.publishProductsButton.textContent = "جاري الحفظ والتحديث...";
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
      showToast("تم حفظ المنتجات بدون تشغيل Cloudflare build. التحديث يظهر خلال ثواني قليلة.");
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

  async function openImageUpload() {
    state.taxonomyImageUpload = null;
    if (!currentProduct()) {
      showToast("اختر منتجاً أولاً قبل رفع الصورة.");
      return;
    }

    if (window.showOpenFilePicker) {
      try {
        const fileHandles = await window.showOpenFilePicker({
          types: [
            {
              description: "Images",
              accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"] }
            }
          ],
          multiple: true
        });
        await processProductImageFiles(await Promise.all(fileHandles.map((fileHandle) => fileHandle.getFile())));
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
        console.warn("Image picker failed, falling back to file input.", error);
      }
    }

    getImageUploadInput().multiple = true;
    getImageUploadInput().click();
  }

  async function uploadProductImage(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) return;
    if (state.taxonomyImageUpload) {
      const uploadTarget = state.taxonomyImageUpload;
      state.taxonomyImageUpload = null;
      await processTaxonomyImageFile(files[0], uploadTarget);
      return;
    }
    await processProductImageFiles(files);
  }

  async function publishTaxonomyToSite() {
    const categoriesList = taxonomyCategoriesForAdmin();
    if (!categoriesList.length) {
      showToast("لا توجد أقسام للنشر.");
      return;
    }

    const confirmed = window.confirm("سيتم حفظ صور وترتيب الأقسام على الموقع مباشرة. هل تريد المتابعة؟");
    if (!confirmed) return;

    const previousText = elements.publishTaxonomyButton?.textContent || "";

    try {
      if (elements.publishTaxonomyButton) {
        elements.publishTaxonomyButton.disabled = true;
        elements.publishTaxonomyButton.textContent = "جاري نشر الأقسام...";
      }

      const response = await fetch("/admin/api/update-taxonomy", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: categoriesList,
          taxonomySource: buildTaxonomyFile(),
          message: `Update category taxonomy from admin ${new Date().toISOString()}`
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || result.message || `HTTP ${response.status}`);
      }

      renderAll(`تم نشر الأقسام. Commit: ${(result.commitSha || "").slice(0, 7)}`);
      showToast("تم حفظ الأقسام وصورها. التحديث يظهر خلال ثواني قليلة.");
    } catch (error) {
      showToast(`تعذر نشر الأقسام: ${error.message}`);
      console.error(error);
    } finally {
      if (elements.publishTaxonomyButton) {
        elements.publishTaxonomyButton.disabled = false;
        elements.publishTaxonomyButton.textContent = previousText;
      }
    }
  }

  async function openTaxonomyImageUpload(index) {
    const category = selectedTaxonomyCategory();
    const subcategory = category?.subcategories?.[index];
    if (!category || !subcategory || Number.isNaN(index)) return;

    state.taxonomyImageUpload = { mainId: category.id, subcategoryId: subcategory.id };

    if (window.showOpenFilePicker) {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: "Images",
              accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"] }
            }
          ],
          multiple: false
        });
        const uploadTarget = state.taxonomyImageUpload;
        state.taxonomyImageUpload = null;
        await processTaxonomyImageFile(await fileHandle.getFile(), uploadTarget);
        return;
      } catch (error) {
        state.taxonomyImageUpload = null;
        if (error.name === "AbortError") return;
        console.warn("Taxonomy image picker failed, falling back to file input.", error);
      }
    }

    state.taxonomyImageUpload = { mainId: category.id, subcategoryId: subcategory.id };
    getImageUploadInput().multiple = false;
    getImageUploadInput().click();
  }

  async function processTaxonomyImageFile(file, uploadTarget) {
    const category = findTaxonomyCategory(uploadTarget?.mainId);
    const subcategory = category?.subcategories?.find((item) => item.id === uploadTarget?.subcategoryId);
    if (!category || !subcategory) {
      showToast("تعذر تحديد القسم الفرعي لرفع الصورة.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("اختر ملف صورة صحيح.");
      return;
    }

    try {
      showToast("جاري تحويل صورة القسم إلى WebP...");
      const webp = await convertImageToWebp(file);
      showToast("جاري رفع صورة القسم على GitHub...");

      const response = await fetchWithTimeout("/admin/api/upload-product-image", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          productId: `taxonomy-${subcategory.id || "subcategory"}`,
          imageBase64: webp.base64
        })
      }, 60000);
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || result.message || `HTTP ${response.status}`);
      }

      subcategory.subcategoryImage = result.path;
      state.assetPreviewVersion = String(Date.now());
      renderTaxonomyManager();
      refreshTaxonomyDependentUi();
      showToast("تم رفع الصورة واستبدال صورة القسم. اضغط حفظ ونشر الأقسام حتى تظهر على الموقع.");
    } catch (error) {
      showToast(`تعذر رفع صورة القسم: ${friendlyUploadError(error.message)}`);
      console.error(error);
    }
  }

  async function processProductImageFiles(files) {
    const imageFiles = Array.from(files || []).filter(Boolean);
    if (!imageFiles.length) return;

    for (let index = 0; index < imageFiles.length; index += 1) {
      if (imageFiles.length > 1) {
        showToast(`جاري رفع الصورة ${index + 1} من ${imageFiles.length}...`);
      }
      await processProductImageFile(imageFiles[index]);
    }

    if (imageFiles.length > 1) {
      showToast(`تم رفع ${imageFiles.length} صورة وإضافتها للمنتج. اضغط حفظ ونشر على الموقع لتحديث products.json.`);
    }
  }

  async function processProductImageFile(file) {
    const product = currentProduct();
    if (!product) {
      showToast("اختر منتجاً أولاً قبل رفع الصورة.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("اختر ملف صورة صحيح.");
      return;
    }

    try {
      showToast("جاري تحويل الصورة إلى WebP...");
      const webp = await convertImageToWebp(file);
      showToast("جاري رفع الصورة على GitHub...");

      const response = await fetchWithTimeout("/admin/api/upload-product-image", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          productId: shortUploadProductId(product),
          imageBase64: webp.base64
        })
      }, 60000);
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || result.message || `HTTP ${response.status}`);
      }

      ensureProductShape(product);
      product.images = unique([...(product.images || []), result.path]);
      product.image = product.images[0] || result.path;
      state.assetPreviewVersion = String(Date.now());
      setValue("images", arrayToLines(product.images));
      renderImagePreview(product.images);
      markDirty();
      showToast("تم رفع الصورة وإضافتها للمنتج. اضغط حفظ ونشر على الموقع لتحديث products.json.");
    } catch (error) {
      showToast(`تعذر رفع الصورة: ${friendlyUploadError(error.message)}`);
      console.error(error);
    }
  }

  function getImageUploadInput() {
    if (elements.imageUpload) return elements.imageUpload;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.hidden = true;
    input.dataset.imageUpload = "";
    document.body.append(input);
    elements.imageUpload = input;

    return input;
  }

  async function convertImageToWebp(file) {
    const bitmap = await loadImageBitmap(file);
    const attempts = [
      { maxSide: 1400, quality: 0.84 },
      { maxSide: 1100, quality: 0.78 },
      { maxSide: 900, quality: 0.72 }
    ];
    let converted = null;

    try {
      for (const attempt of attempts) {
        converted = await renderWebpBlob(bitmap, attempt);
        if (converted.blob.size <= 1800 * 1024) break;
      }
    } finally {
      if (bitmap.close) bitmap.close();
    }

    if (!converted || converted.blob.size > 2 * 1024 * 1024) {
      throw new Error("الصورة كبيرة بعد التحويل. جرّب صورة أصغر أو قصها قبل الرفع.");
    }

    return {
      blob: converted.blob,
      base64: await blobToBase64(converted.blob),
      width: converted.width,
      height: converted.height
    };
  }

  async function renderWebpBlob(bitmap, { maxSide, quality }) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("المتصفح لم ينجح في تحويل الصورة إلى WebP."));
      }, "image/webp", quality);
    });

    return { blob, width, height };
  }

  async function loadImageBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" });
    }

    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("تعذر قراءة الصورة."));
        element.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error("تعذر قراءة الصورة بعد التحويل."));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("انتهت مهلة رفع الصورة. جرّب صورة أصغر أو تأكد من GITHUB_TOKEN.");
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function friendlyUploadError(message = "") {
    if (/GITHUB_TOKEN/i.test(message)) {
      return "GITHUB_TOKEN غير موجود في Cloudflare أو لم يتم عمل Deploy بعد إضافته.";
    }

    if (/bad credentials|401/i.test(message)) {
      return "GitHub token غير صحيح. أنشئ token جديد وضعه في Cloudflare.";
    }

    if (/resource not accessible|403|permission/i.test(message)) {
      return "صلاحيات GitHub token ناقصة. يجب أن تكون Contents: Read and write.";
    }

    return message || "حدث خطأ غير معروف.";
  }

  function shortUploadProductId(product) {
    const productIndex = state.products.findIndex((item) => item.id === product.id);
    const numericId = productIndex >= 0 ? productIndex + 1 : Date.now();
    return `product-${numericId}`;
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

  function taxonomyCategoriesForAdmin() {
    return state.taxonomy || [];
  }

  function findTaxonomyCategory(value = "") {
    return taxonomyCategoriesForAdmin().find((category) => category.id === value || category.name === value) || null;
  }

  function findTaxonomySubcategory(value = "") {
    for (const category of taxonomyCategoriesForAdmin()) {
      const subcategory = (category.subcategories || []).find((item) => item.id === value || item.name === value);
      if (subcategory) return { ...subcategory, mainId: category.id, mainName: category.name };
    }
    return null;
  }

  function taxonomyCategoryIdFromName(value = "") {
    return findTaxonomyCategory(value)?.id || "";
  }

  function taxonomyCategoryNameFromId(value = "") {
    return findTaxonomyCategory(value)?.name || "";
  }

  function taxonomySubcategoryIdFromName(value = "") {
    return findTaxonomySubcategory(value)?.id || "";
  }

  function taxonomySubcategoryNameFromId(value = "") {
    return findTaxonomySubcategory(value)?.name || "";
  }

  function taxonomySubcategories(value = "") {
    return findTaxonomyCategory(value)?.subcategories || [];
  }

  function normalizeMainCategoryValue(value, legacyCategory = "") {
    if (!value) return legacyCategoryToMainCategory[legacyCategory] || "uncategorized";
    return taxonomyCategoryIdFromName(value) || (findTaxonomyCategory(value) ? value : "uncategorized");
  }

  function normalizeSubCategoryValue(value) {
    if (!value) return "needs-review";
    return taxonomySubcategoryIdFromName(value) || (findTaxonomySubcategory(value) ? value : "needs-review");
  }

  function mainCategoryOptionValue(value, legacyCategory = "") {
    const id = normalizeMainCategoryValue(value, legacyCategory);
    return taxonomyCategoryNameFromId(id) || value || "";
  }

  function subCategoryOptionValue(value) {
    const id = normalizeSubCategoryValue(value);
    return taxonomySubcategoryNameFromId(id) || value || "";
  }

  function inferredSubcategoryFromProduct(product) {
    const values = [product.subCategory, product.label, product.badge, ...(product.tags || [])].filter(Boolean);
    for (const value of values) {
      const found = findTaxonomySubcategory(value);
      const id = found?.id || "";
      if (id && id !== "needs-review") return found;
    }
    return null;
  }

  function mainCategoryName(product) {
    let id = normalizeMainCategoryValue(product.mainCategory, product.category);
    if (id === "uncategorized") {
      const inferred = inferredSubcategoryFromProduct(product);
      id = inferred?.mainId || legacyCategoryToMainCategory[product.category] || id;
    }
    return taxonomyCategoryNameFromId(id) || product.mainCategory || "غير مصنف";
  }

  function subCategoryName(product) {
    let id = normalizeSubCategoryValue(product.subCategory);
    if (id === "needs-review") {
      const inferred = inferredSubcategoryFromProduct(product);
      id = inferred?.id || id;
    }
    return taxonomySubcategoryNameFromId(id) || product.subCategory || "يحتاج مراجعة";
  }

  function needsReview(product) {
    return mainCategoryName(product) === "غير مصنف" || subCategoryName(product) === "يحتاج مراجعة";
  }

  function setProducts(products, message) {
    state.products = Array.isArray(products) ? products : [];
    state.selectedId = state.products[0]?.id || "";
    state.dirty = false;
    fillCategoryFilter();
    fillMainCategoryFilter();
    fillSubCategoryFilter();
    renderAll(message);
  }

  function fillCategorySelects() {
  const categorySelect = elements.editor.querySelector("[data-field='category']");
  categorySelect.innerHTML = categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`).join("");
  const mainSelect = elements.editor.querySelector("[data-field='mainCategory']");
  if (mainSelect) {
    mainSelect.innerHTML = taxonomyCategoriesForAdmin().map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join("");
  }
  fillCategoryFilter();
  fillMainCategoryFilter();
  fillSubCategoryFilter();
  renderTaxonomyManager();
}

  function fillCategoryFilter() {
  const counts = new Map();
  state.products.forEach((product) => {
    counts.set(product.category, (counts.get(product.category) || 0) + 1);
  });

  elements.categoryFilter.innerHTML = [
    `<option value="all">كل الأقسام القديمة (${state.products.length})</option>`,
    ...categories.map((category) => `<option value="${category.id}">${category.label} (${counts.get(category.id) || 0})</option>`)
  ].join("");
  elements.categoryFilter.value = state.categoryFilter;
}

  function fillMainCategoryFilter() {
    if (!elements.mainCategoryFilter) return;
    const counts = new Map();
    state.products.forEach((product) => {
      const name = mainCategoryName(product);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    elements.mainCategoryFilter.innerHTML = [
      `<option value="all">كل الأقسام الرئيسية (${state.products.length})</option>`,
      ...taxonomyCategoriesForAdmin().map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)} (${counts.get(category.name) || 0})</option>`)
    ].join("");
    elements.mainCategoryFilter.value = state.mainCategoryFilter;
  }

  function fillSubCategoryFilter() {
    if (!elements.subCategoryFilter) return;
    const selectedMain = state.mainCategoryFilter === "all" ? "" : state.mainCategoryFilter;
    const subcategories = selectedMain
      ? taxonomySubcategories(selectedMain) || []
      : taxonomyCategoriesForAdmin().flatMap((category) => category.subcategories || []);
    const counts = new Map();
    state.products.forEach((product) => {
      const name = subCategoryName(product);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    elements.subCategoryFilter.innerHTML = [
      `<option value="all">كل الأقسام الفرعية</option>`,
      ...subcategories.map((subcategory) => `<option value="${escapeHtml(subcategory.name)}">${escapeHtml(subcategory.name)} (${counts.get(subcategory.name) || 0})</option>`)
    ].join("");
    elements.subCategoryFilter.value = state.subCategoryFilter;
  }

  function fillSubCategorySelect(product) {
    const mainSelect = elements.editor.querySelector("[data-field='mainCategory']");
    const subSelect = elements.editor.querySelector("[data-field='subCategory']");
    if (!subSelect) return;
    const mainValue = mainCategoryOptionValue(mainSelect?.value || product?.mainCategory, product?.category);
    const subcategories = taxonomySubcategories(mainValue) || taxonomySubcategories("غير مصنف") || [];
    subSelect.innerHTML = subcategories.map((subcategory) => `<option value="${escapeHtml(subcategory.name)}">${escapeHtml(subcategory.name)}</option>`).join("");
    const current = subCategoryOptionValue(product?.subCategory) || subcategories[0]?.name || "";
    subSelect.value = subcategories.some((item) => item.name === current) ? current : subcategories[0]?.name || "";
    if (product && subSelect.value && product.subCategory !== subSelect.value) product.subCategory = subSelect.value;
  }

  function selectedTaxonomyCategory() {
    return findTaxonomyCategory(state.taxonomyMain) || taxonomyCategoriesForAdmin()[0] || null;
  }

  function renderTaxonomyManager() {
    if (!elements.taxonomyMain || !elements.taxonomyList) return;
    const categoriesList = taxonomyCategoriesForAdmin();
    if (!categoriesList.length) {
      elements.taxonomyMain.innerHTML = "";
      elements.taxonomyList.innerHTML = `<div class="empty-state">لا توجد أقسام.</div>`;
      return;
    }

    if (!findTaxonomyCategory(state.taxonomyMain)) state.taxonomyMain = categoriesList[0].id;
    elements.taxonomyMain.innerHTML = categoriesList
      .map((category) => `<option value="${escapeAttribute(category.id)}">${escapeHtml(category.name)}</option>`)
      .join("");
    elements.taxonomyMain.value = state.taxonomyMain;

    const category = selectedTaxonomyCategory();
    const subcategories = category?.subcategories || [];
    if (!subcategories.length) {
      elements.taxonomyList.innerHTML = `<div class="empty-state">لا توجد أقسام فرعية هنا.</div>`;
      return;
    }

    const categoryOptions = categoriesList
      .map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name)}</option>`)
      .join("");

    elements.taxonomyList.innerHTML = subcategories.map((subcategory, index) => `
      <article class="taxonomy-card" data-taxonomy-sub-index="${index}">
        <div class="taxonomy-preview">
          <img src="${escapeAttribute(previewAssetUrl(subcategory.subcategoryImage || ""))}" alt="" loading="lazy" decoding="async" onerror="this.closest('.taxonomy-preview').classList.add('image-missing')">
        </div>
        <div class="taxonomy-fields">
          <label>
            <span>اسم القسم الفرعي</span>
            <input type="text" data-taxonomy-field="name" value="${escapeAttribute(subcategory.name || "")}">
          </label>
          <label>
            <span>ID</span>
            <input type="text" dir="ltr" data-taxonomy-field="id" value="${escapeAttribute(subcategory.id || "")}">
          </label>
          <label>
            <span>مسار الصورة</span>
            <input type="text" dir="ltr" data-taxonomy-field="subcategoryImage" value="${escapeAttribute(subcategory.subcategoryImage || "")}" placeholder="assets/optimized/products/example.webp">
          </label>
          <label>
            <span>نقل إلى قسم رئيسي</span>
            <select data-taxonomy-field="mainId">${categoryOptions}</select>
          </label>
        </div>
        <div class="taxonomy-card-actions">
          <button class="button small secondary" type="button" data-action="upload-taxonomy-image">رفع صورة</button>
          <button class="button small ghost" type="button" data-action="move-subcategory-before" ${index === 0 ? "disabled" : ""}>فوق</button>
          <button class="button small ghost" type="button" data-action="move-subcategory-after" ${index === subcategories.length - 1 ? "disabled" : ""}>تحت</button>
          <button class="button small danger" type="button" data-action="remove-subcategory">حذف</button>
        </div>
      </article>
    `).join("");

    elements.taxonomyList.querySelectorAll("[data-taxonomy-field='mainId']").forEach((select) => {
      select.value = category.id;
    });
  }

  function handleTaxonomyInput(event) {
    const element = event.target.closest("[data-taxonomy-field]");
    const card = event.target.closest("[data-taxonomy-sub-index]");
    const category = selectedTaxonomyCategory();
    const index = Number(card?.dataset.taxonomySubIndex);
    const subcategory = category?.subcategories?.[index];
    if (!element || !subcategory || Number.isNaN(index)) return;

    const field = element.dataset.taxonomyField;
    if (field === "mainId") {
      moveSubcategoryToMain(index, element.value);
      return;
    }

    if (field === "id") {
      subcategory.id = uniqueTaxonomySubcategoryId(slugLike(element.value) || `subcategory-${Date.now()}`, subcategory);
      if (element.value !== subcategory.id) element.value = subcategory.id;
    } else if (field === "subcategoryImage") {
      subcategory.subcategoryImage = normalizeImagePath(element.value);
      const image = card.querySelector(".taxonomy-preview img");
      const preview = card.querySelector(".taxonomy-preview");
      preview?.classList.remove("image-missing");
      if (image) image.src = previewAssetUrl(subcategory.subcategoryImage);
      if (element.value !== subcategory.subcategoryImage) element.value = subcategory.subcategoryImage;
    } else {
      subcategory[field] = element.value.trim();
    }

    refreshTaxonomyDependentUi();
  }

  function uniqueTaxonomySubcategoryId(baseId, currentSubcategory = null) {
    const base = slugLike(baseId) || `subcategory-${Date.now()}`;
    const used = new Set(
      taxonomyCategoriesForAdmin()
        .flatMap((category) => category.subcategories || [])
        .filter((subcategory) => subcategory !== currentSubcategory)
        .map((subcategory) => subcategory.id)
    );
    let nextId = base;
    let counter = 2;
    while (used.has(nextId)) {
      nextId = `${base}-${counter}`;
      counter += 1;
    }
    return nextId;
  }

  function addSubcategory() {
    const category = selectedTaxonomyCategory();
    if (!category) return;
    category.subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];
    category.subcategories.push({
      id: uniqueTaxonomySubcategoryId(`custom-subcategory-${Date.now()}`),
      name: "قسم فرعي جديد",
      subcategoryImage: "assets/optimized/hero-products-collage.webp"
    });
    renderTaxonomyManager();
    refreshTaxonomyDependentUi();
    showToast("تم إضافة قسم فرعي جديد.");
  }

  function removeSubcategory(index) {
    const category = selectedTaxonomyCategory();
    if (!category || Number.isNaN(index) || !category.subcategories?.[index]) return;
    const confirmed = window.confirm("هل تريد حذف هذا القسم الفرعي من قائمة الأقسام؟ لن يتم حذف المنتجات نفسها.");
    if (!confirmed) return;
    category.subcategories.splice(index, 1);
    renderTaxonomyManager();
    refreshTaxonomyDependentUi();
  }

  function moveSubcategory(index, direction) {
    const category = selectedTaxonomyCategory();
    const nextIndex = index + direction;
    if (!category || !category.subcategories || nextIndex < 0 || nextIndex >= category.subcategories.length) return;
    [category.subcategories[index], category.subcategories[nextIndex]] = [category.subcategories[nextIndex], category.subcategories[index]];
    renderTaxonomyManager();
    refreshTaxonomyDependentUi();
  }

  function moveSubcategoryToMain(index, nextMainId) {
    const category = selectedTaxonomyCategory();
    const nextCategory = findTaxonomyCategory(nextMainId);
    if (!category || !nextCategory || nextCategory.id === category.id || !category.subcategories?.[index]) return;
    const [subcategory] = category.subcategories.splice(index, 1);
    nextCategory.subcategories = Array.isArray(nextCategory.subcategories) ? nextCategory.subcategories : [];
    nextCategory.subcategories.push(subcategory);
    renderTaxonomyManager();
    refreshTaxonomyDependentUi();
    showToast(`تم نقل القسم الفرعي إلى ${nextCategory.name}.`);
  }

  function refreshTaxonomyDependentUi() {
    const mainSelect = elements.editor.querySelector("[data-field='mainCategory']");
    if (mainSelect) {
      const selected = mainSelect.value;
      mainSelect.innerHTML = taxonomyCategoriesForAdmin().map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join("");
      mainSelect.value = [...mainSelect.options].some((option) => option.value === selected) ? selected : mainSelect.options[0]?.value || "";
    }
    fillMainCategoryFilter();
    fillSubCategoryFilter();
    const product = currentProduct();
    if (product) fillSubCategorySelect(product);
    renderProductList();
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
    elements.productList.innerHTML = `<div class="empty-state">لا توجد منتجات تطابق الفلاتر.</div>`;
    return;
  }

  elements.productList.innerHTML = products.map((product) => {
    const taxonomyLine = `${mainCategoryName(product)} / ${subCategoryName(product)}`;
    const selected = product.id === state.selectedId ? " active" : "";
    const price = product.price ? `${formatNumber(product.price)} ج.م` : "بدون سعر";
    const reviewBadge = needsReview(product) ? " - يحتاج مراجعة" : "";
    return `
      <button class="product-list-item${selected}" type="button" data-select-product="${escapeHtml(product.id)}">
        <strong>${escapeHtml(product.name || "منتج بدون اسم")}</strong>
        <span>${escapeHtml(taxonomyLine)}${escapeHtml(reviewBadge)}</span>
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
    const searchText = [product.id, product.name, product.label, product.badge, product.description, product.mainCategory, product.subCategory, ...(product.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !state.search || searchText.includes(state.search);
    const matchesCategory = state.categoryFilter === "all" || product.category === state.categoryFilter;
    const matchesMain = state.mainCategoryFilter === "all" || mainCategoryName(product) === state.mainCategoryFilter;
    const matchesSub = state.subCategoryFilter === "all" || subCategoryName(product) === state.subCategoryFilter;
    const matchesReview = !state.needsReviewOnly || needsReview(product);
    return matchesSearch && matchesCategory && matchesMain && matchesSub && matchesReview;
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
    setValue("mainCategory", mainCategoryOptionValue(product.mainCategory, product.category));
    fillSubCategorySelect(product);
    setValue("subCategory", subCategoryOptionValue(product.subCategory));
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
    const visibleImages = (images || []).filter(Boolean);
    if (!visibleImages.length) {
      elements.imagePreview.innerHTML = `<div class="empty-state">لا توجد صور بعد.</div>`;
      return;
    }

    elements.imagePreview.innerHTML = visibleImages.map((image, index) => `
      <figure class="${index === 0 ? "image-primary" : ""}" data-image-index="${index}">
        <img src="${escapeAttribute(previewAssetUrl(image))}" alt="صورة ${index + 1}" loading="lazy" decoding="async" onload="this.closest('figure').classList.remove('image-missing')" onerror="this.closest('figure').classList.add('image-missing')">
        <div class="image-preview-actions" aria-label="ترتيب الصورة">
          <button type="button" data-action="move-image-before" ${index === 0 ? "disabled" : ""} title="انقل الصورة قبل اللي قبلها">قبلها</button>
          <button type="button" data-action="make-primary-image" ${index === 0 ? "disabled" : ""} title="اجعل الصورة هي الصورة الأساسية">الأولى</button>
          <button type="button" data-action="move-image-after" ${index === visibleImages.length - 1 ? "disabled" : ""} title="انقل الصورة بعد اللي بعدها">بعدها</button>
        </div>
        ${index === 0 ? `<span class="image-primary-badge">الصورة الأساسية</span>` : ""}
        <figcaption>${escapeHtml(image)}</figcaption>
      </figure>
    `).join("");
  }

  function makeProductImagePrimary(index) {
    const product = currentProduct();
    if (!product || !Number.isInteger(index) || index <= 0 || index >= product.images.length) return;

    const nextImages = [...product.images];
    const [selectedImage] = nextImages.splice(index, 1);
    nextImages.unshift(selectedImage);
    updateProductImages(product, nextImages);
    showToast("تم جعل الصورة هي الصورة الأساسية.");
  }

  function moveProductImage(index, direction) {
    const product = currentProduct();
    const nextIndex = index + direction;
    if (!product || !Number.isInteger(index) || nextIndex < 0 || nextIndex >= product.images.length) return;

    const nextImages = [...product.images];
    [nextImages[index], nextImages[nextIndex]] = [nextImages[nextIndex], nextImages[index]];
    updateProductImages(product, nextImages);
    showToast("تم تعديل ترتيب الصور.");
  }

  function updateProductImages(product, images) {
    product.images = unique(images.map(normalizeImagePath).filter(Boolean));
    product.image = product.images[0] || "";
    setValue("images", arrayToLines(product.images));
    renderImagePreview(product.images);
    markDirty();
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
            <div class="variant-actions">
              <button class="button small ghost" type="button" data-action="move-variant-before" ${index === 0 ? "disabled" : ""}>فوق</button>
              <button class="button small ghost" type="button" data-action="move-variant-after" ${index === product.variants.length - 1 ? "disabled" : ""}>تحت</button>
              <button class="button small danger" type="button" data-action="remove-variant">حذف الاختيار</button>
            </div>
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
    elements.editorId.textContent = `المعرف: ${product.id}`;
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

  if (field === "mainCategory") {
    product.mainCategory = mainCategoryOptionValue(value, product.category);
    fillSubCategorySelect(product);
    fillMainCategoryFilter();
    fillSubCategoryFilter();
    renderProductList();
    return;
  }

  if (field === "subCategory") {
    product.subCategory = subCategoryOptionValue(value);
    fillSubCategoryFilter();
    renderProductList();
    return;
  }

  if (field === "options") {
    try {
      const options = JSON.parse(value || "[]");
      if (!isValidProductOptions(options)) throw new Error("Invalid options shape");
      product.options = options;
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
    if (field === "title") {
      syncVariantOptionsFromTitles(product, { force: true, syncVisibleFields: true });
    }
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
    syncVariantOptionsFromTitles(product, { force: true });
    markDirty();
    renderVariants(product);
  }

  function removeVariant(index) {
    const product = currentProduct();
    if (!product || Number.isNaN(index)) return;
    product.variants.splice(index, 1);
    if (!product.variants.length) product.variants.push(createVariant(product));
    syncVariantOptionsFromTitles(product, { force: true });
    markDirty();
    renderVariants(product);
  }

  function moveVariant(index, direction) {
    const product = currentProduct();
    if (!product || Number.isNaN(index) || !direction) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= product.variants.length) return;

    const [variant] = product.variants.splice(index, 1);
    product.variants.splice(nextIndex, 0, variant);
    reorderProductOptionsFromVariants(product);
    setValue("options", JSON.stringify(product.options || [], null, 2));
    markDirty();
    renderVariants(product);
    renderProductList();
  }

  function sortProductsByName() {
    state.products.sort((first, second) => (first.name || "").localeCompare(second.name || "", "ar"));
    markDirty();
    renderProductList();
  }

  function syncCurrentVariantOptions() {
    const product = currentProduct();
    if (!product) return;

    ensureProductShape(product);
    const synced = syncVariantOptionsFromTitles(product, { force: true, syncVisibleFields: true });
    if (!synced) {
      showToast("أضف اختيارين على الأقل قبل توليد الاختيارات.");
      return;
    }

    renderVariants(product);
    renderProductList();
    markDirty();
    showToast("تم توليد الاختيارات من أسماء الاختيارات.");
  }

  function syncVariantOptionsFromTitles(product, options = {}) {
    const synced = syncVariantTitleOptions(product, options);
    if (!synced && options.force && Array.isArray(product.variants) && product.variants.length < 2) {
      product.options = [];
      product.variants.forEach((variant) => {
        variant.options = {};
      });
    }

    setValue("options", JSON.stringify(product.options || [], null, 2));
    if (options.syncVisibleFields) {
      elements.variantList.querySelectorAll("[data-variant-index]").forEach((card) => {
        const index = Number(card.dataset.variantIndex);
        const textarea = card.querySelector("[data-variant-field='options']");
        if (textarea && product.variants[index]) {
          textarea.value = JSON.stringify(product.variants[index].options || {}, null, 2);
        }
      });
    }
    return synced;
  }

  function reorderProductOptionsFromVariants(product) {
    if (!Array.isArray(product.options) || !product.options.length || !Array.isArray(product.variants)) return;

    product.options = product.options.map((option) => {
      if (!option?.name || !Array.isArray(option.values)) return option;

      const orderedValues = unique(product.variants.map((variant) => variant.options?.[option.name]).filter(Boolean));
      if (!orderedValues.length) return option;

      return {
        ...option,
        values: unique([
          ...orderedValues,
          ...option.values.filter((value) => !orderedValues.includes(value))
        ])
      };
    });
  }

  function isValidProductOptions(options) {
    return Array.isArray(options) && options.every((option) => (
      option &&
      typeof option === "object" &&
      typeof option.name === "string" &&
      Array.isArray(option.values)
    ));
  }

  function currentProduct() {
    return state.products.find((product) => product.id === state.selectedId) || null;
  }

  function ensureProductShape(product) {
  product.images = Array.isArray(product.images) ? product.images : [product.image].filter(Boolean);
  product.tags = Array.isArray(product.tags) ? product.tags : [];
  product.options = Array.isArray(product.options) ? product.options : [];
  product.variants = Array.isArray(product.variants) ? product.variants : [];
  product.mainCategory = mainCategoryName(product);
  product.subCategory = subCategoryName(product);
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
    product.mainCategory = mainCategoryName(product);
    product.subCategory = subCategoryName(product);
    if (!product.mainCategory || !product.subCategory) throw new Error("لا يمكن حفظ منتج بدون قسم رئيسي وفرعي.");
    product.price = numberOrNull(product.price) ?? 0;
    product.priceNote = product.priceNote || "";
    product.stock = product.stock || "متاح";
    product.badge = product.badge || product.label || product.subCategory || "";
    product.tags = unique(product.tags || []);
    product.images = unique((product.images || []).map(normalizeImagePath).filter(Boolean));
    product.image = product.images[0] || normalizeImagePath(product.image) || "";
    product.url = product.url || `https://popekyrillos.store/?product=${product.id}`;
    product.variants = product.variants.length ? product.variants : [createVariant(product)];
    removePlaceholderDefaultVariant(product);
    product.variants = product.variants.map((variant, index) => normalizeVariant(product, variant, index));
    syncVariantTitleOptions(product);
    return product;
  });
}

  function removePlaceholderDefaultVariant(product) {
    if (!Array.isArray(product.variants) || product.variants.length < 2) return;

    const defaultTitle = "\u0627\u0644\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a";
    const firstVariant = product.variants[0];
    const hasOnlyPlaceholderData =
      String(firstVariant.title || "").trim() === defaultTitle &&
      !Object.keys(firstVariant.options || {}).length &&
      !(firstVariant.images || []).filter(Boolean).length &&
      !firstVariant.image &&
      !firstVariant.sku &&
      (firstVariant.quantity === null || firstVariant.quantity === undefined || firstVariant.quantity === "") &&
      (numberOrNull(firstVariant.price) ?? product.price ?? 0) === (product.price ?? 0);

    if (hasOnlyPlaceholderData) product.variants.shift();
  }

  function syncVariantTitleOptions(product, options = {}) {
    if (!Array.isArray(product.variants) || product.variants.length < 2) return false;
    const hasStructuredOptions = product.options.length && product.variants.some((variant) => Object.keys(variant.options || {}).length);
    if (hasStructuredOptions && !options.force) return false;

    const optionName = "\u0627\u0644\u0627\u062e\u062a\u064a\u0627\u0631";
    const used = new Map();
    const labels = product.variants.map((variant, index) => {
      const raw = String(variant.title || "").trim();
      const fallback = `اختيار ${index + 1}`;
      const base = raw || fallback;
      const count = used.get(base) || 0;
      used.set(base, count + 1);
      return count ? `${base} ${count + 1}` : base;
    });

    product.options = [
      {
        name: optionName,
        values: labels
      }
    ];
    product.variants.forEach((variant, index) => {
      variant.options = {
        [optionName]: labels[index]
      };
    });
    return true;
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
    downloadBlob(filename, blob);
    showToast(`تم تجهيز ${filename}.`);
  }

  function downloadText(filename, text, type = "text/plain;charset=utf-8") {
    downloadBlob(filename, new Blob([text], { type }));
    showToast(`تم تجهيز ${filename}.`);
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function buildTaxonomyFile() {
    const categoriesSource = JSON.stringify(taxonomyCategoriesForAdmin(), null, 4)
      .replace(/^/gm, "  ");
    return `(function () {
  const categories = ${categoriesSource.trimStart()};

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryByName = new Map(categories.map((category) => [category.name, category]));
  const subcategoryById = new Map();
  const subcategoryByName = new Map();

  categories.forEach((category) => {
    category.subcategories.forEach((subcategory) => {
      const entry = { ...subcategory, mainId: category.id, mainName: category.name };
      subcategoryById.set(subcategory.id, entry);
      subcategoryByName.set(subcategory.name, entry);
    });
  });

  const categoryAliases = new Map([
    ["مستلزمات المذبح", "altar-tools"],
    ["نحاسيات", "altar-tools"],
    ["شموع وبخور", "candles-incense"],
    ["شمع وبخور وأباركة", "candles-incense"],
    ["تواني وأقمشة", "church-vestments"],
    ["أقمشة ومفارش", "church-vestments"],
    ["أيقونات وهدايا", "icons-frames"],
    ["أيقونات", "icons-frames"],
    ["كتب وطقوس", "books-rituals"],
    ["صلبان وهدايا", "crosses-gifts"]
  ]);

  categoryAliases.forEach((categoryId, alias) => {
    const category = categoryById.get(categoryId);
    if (category) categoryByName.set(alias, category);
  });

  const subcategoryAliases = new Map([
    ["يوتا", "small-icons"],
    ["يوطا", "small-icons"],
    ["مادليات", "small-icons"],
    ["ميداليات", "medals"]
  ]);

  subcategoryAliases.forEach((subcategoryId, alias) => {
    const subcategory = subcategoryById.get(subcategoryId);
    if (subcategory) subcategoryByName.set(alias, subcategory);
  });

  function customerCategories() {
    return categories.filter((category) => !category.hiddenFromCustomerNav);
  }

  function categoryIdFromName(name) {
    return categoryByName.get(name)?.id || "";
  }

  function categoryNameFromId(id) {
    return categoryById.get(id)?.name || "";
  }

  function subcategoryIdFromName(name) {
    return subcategoryByName.get(name)?.id || "";
  }

  function subcategoryNameFromId(id) {
    return subcategoryById.get(id)?.name || "";
  }

  function getSubcategories(categoryIdOrName) {
    const category = categoryById.get(categoryIdOrName) || categoryByName.get(categoryIdOrName);
    return category?.subcategories || [];
  }

  window.POPE_KYRILLOS_TAXONOMY = {
    categories,
    customerCategories,
    categoryById,
    categoryByName,
    subcategoryById,
    subcategoryByName,
    categoryIdFromName,
    categoryNameFromId,
    subcategoryIdFromName,
    subcategoryNameFromId,
    getSubcategories
  };
})();
`;
  }

  function markDirty() {
    state.dirty = true;
    renderStatus();
  }

  function setValue(field, value) {
    const element = elements.editor.querySelector(`[data-field="${field}"]`);
    if (!element) return;
    element.value = value ?? "";
    if (element.tagName === "SELECT" && element.options.length && element.selectedIndex === -1) {
      element.value = element.options[0].value;
    }
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
    if (value.startsWith("assets/")) return `/${value}?admin_preview=${encodeURIComponent(state.assetPreviewVersion || "1")}`;
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
