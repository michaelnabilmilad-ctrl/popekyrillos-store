(function () {
  const categories = [
    { id: "brass", label: "نحاسيات" },
    { id: "candles", label: "شموع وبخور" },
    { id: "vestments", label: "أقمشة ومفارش" },
    { id: "icons", label: "أيقونات وهدايا" },
    { id: "books", label: "كتب وطقوس" },
    { id: "atb3ho", label: "منتجات أتبعه" }
  ];

  const TAXONOMY_DRAFT_KEY = "pope-kyrillos-admin-taxonomy-draft";
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
    newProductIds: new Set(),
    taxonomy: [],
    taxonomyMain: "",
    taxonomyStatus: "loading",
    taxonomyError: "",
    originalTaxonomy: null,
    taxonomyImageUpload: null,
    selectedId: "",
    fileHandle: null,
    dirty: false,
    search: "",
    categoryFilter: "all",
    mainCategoryFilter: "all",
    subCategoryFilter: "all",
    stockFilter: "all",
    needsReviewOnly: false,
    adminView: "products",
    quickEditId: "",
    assetPreviewVersion: String(Date.now()),
    productImageUploadMode: "append",
    imagePreviewLimit: 6,
    imagePreviewProductId: ""
  };

  const elements = {
    productCount: document.querySelector("[data-product-count]"),
    saveState: document.querySelector("[data-save-state]"),
    productList: document.querySelector("[data-product-list]"),
    search: document.querySelector("[data-search]"),
    categoryFilter: document.querySelector("[data-category-filter]"),
    mainCategoryFilter: document.querySelector("[data-main-category-filter]"),
    subCategoryFilter: document.querySelector("[data-sub-category-filter]"),
    stockFilter: document.querySelector("[data-stock-filter]"),
    needsReviewFilter: document.querySelector("[data-needs-review-filter]"),
    editor: document.querySelector("[data-editor]"),
    editorEmpty: document.querySelector("[data-editor-empty]"),
    editorTitle: document.querySelector("[data-editor-title]"),
    editorId: document.querySelector("[data-editor-id]"),
    imagePreview: document.querySelector("[data-image-preview]"),
    imageSection: document.querySelector('[data-editor-section="images"]'),
    variantList: document.querySelector("[data-variant-list]"),
    importFallback: document.querySelector("[data-import-fallback]"),
    imageUpload: document.querySelector("[data-image-upload]"),
    taxonomyMain: document.querySelector("[data-taxonomy-main]"),
    taxonomyList: document.querySelector("[data-taxonomy-list]"),
    toast: document.querySelector("[data-toast]"),
    actionsProductName: document.querySelector("[data-actions-product-name]"),
    saveFileButton: document.querySelector("[data-action='save-file']"),
    publishProductsButton: document.querySelector("[data-action='publish-products']"),
    publishTaxonomyButton: document.querySelector("[data-action='publish-taxonomy']"),
    taxonomyImport: document.querySelector("[data-taxonomy-import]"),
    saveBar: document.querySelector("[data-save-bar]"),
    stickySaveState: document.querySelector("[data-sticky-save-state]"),
    quickEditDialog: document.querySelector("[data-quick-edit-dialog]"),
    quickEditForm: document.querySelector("[data-quick-edit-form]")
  };

  document.addEventListener("click", handleActionClick);
  document.querySelectorAll("[data-ui-action='toggle-sidebar']").forEach((control) => control.addEventListener("click", toggleProductSidebar));
  document.querySelector("[data-ui-action='toggle-admin-nav']")?.addEventListener("click", (event) => {
    const nav = event.currentTarget.closest(".admin-primary-nav");
    const open = nav.classList.toggle("is-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  elements.editor.addEventListener("invalid", openInvalidEditorSection, true);
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
  elements.stockFilter?.addEventListener("change", (event) => {
    state.stockFilter = event.target.value;
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
  document.querySelector("[data-has-variants]")?.addEventListener("change", toggleVariantsUi);
  const imageDropZone = document.querySelector("[data-image-drop-zone]");
  imageDropZone?.addEventListener("click", () => openImageUpload("append"));
  imageDropZone?.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") openImageUpload("append"); });
  ["dragenter", "dragover"].forEach((type) => imageDropZone?.addEventListener(type, (event) => { event.preventDefault(); imageDropZone.classList.add("is-dragging"); }));
  ["dragleave", "drop"].forEach((type) => imageDropZone?.addEventListener(type, (event) => { event.preventDefault(); imageDropZone.classList.remove("is-dragging"); }));
  imageDropZone?.addEventListener("drop", (event) => processProductImageFiles(event.dataTransfer?.files, "append"));
  document.querySelectorAll("[data-admin-view-target]").forEach((button) => button.addEventListener("click", () => setAdminView(button.dataset.adminViewTarget)));
  document.querySelectorAll("[data-editor-tab]").forEach((button) => button.addEventListener("click", () => selectEditorTab(button.dataset.editorTab)));
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  elements.imageSection?.addEventListener("toggle", () => {
    state.imagePreviewLimit = 6;
    renderImagePreview(currentProduct()?.images || []);
  });

  renderTaxonomyManager();
  Promise.all([loadCategoryTaxonomy(), loadProductsFromSite()]).catch((error) => {
    console.error("Failed to initialize admin data:", error);
  });

  async function loadCategoryTaxonomy() {
    state.taxonomyStatus = "loading";
    state.taxonomyError = "";
    renderTaxonomyManager();
    try {
      let loaded = window.POPE_KYRILLOS_TAXONOMY;
      if (!Array.isArray(loaded?.categories) || !loaded.categories.length) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `/category-taxonomy.js?admin=${Date.now()}`;
          script.onload = resolve;
          script.onerror = () => reject(new Error("Unable to load /category-taxonomy.js"));
          document.head.append(script);
        });
        loaded = window.POPE_KYRILLOS_TAXONOMY;
      }
      if (!Array.isArray(loaded?.categories) || !loaded.categories.length) {
        throw new Error("category-taxonomy.js did not expose a non-empty categories array");
      }
      const siteCategories = deepClone(loaded.categories);
      state.originalTaxonomy = deepClone(siteCategories);
      let editableCategories = siteCategories;
      try {
        const draft = JSON.parse(localStorage.getItem(TAXONOMY_DRAFT_KEY) || "null");
        if (Array.isArray(draft?.categories) && validateTaxonomy(draft.categories).ok) editableCategories = deepClone(draft.categories);
      } catch (error) {
        console.error("Failed to restore taxonomy draft:", error);
      }
      state.taxonomy = editableCategories;
      state.taxonomyMain = editableCategories.find((category) => !category.hiddenFromCustomerNav)?.id || editableCategories[0].id;
      state.taxonomyStatus = "loaded";
      renderTaxonomyManager();
      refreshTaxonomyDependentUi();
    } catch (error) {
      state.taxonomy = [];
      state.originalTaxonomy = null;
      state.taxonomyStatus = "error";
      state.taxonomyError = "تعذر تحميل الأقسام الحالية. لم يتم إجراء أي تعديل لحماية بيانات الموقع.";
      renderTaxonomyManager();
      console.error("Failed to load category taxonomy:", error);
    }
  }

  function selectedAirtableOrderNumbers() {
    const value = document.querySelector("[data-airtable-order-numbers]")?.value || "";
    return [...new Set(value.split(/[,،\s]+/).map((item) => item.trim()).filter((item) => /^\d+$/.test(item)))];
  }

  function setAirtableSyncBusy(busy) {
    document.querySelectorAll("[data-airtable-sync] button[data-action]").forEach((button) => { button.disabled = busy; });
  }

  function renderAirtableReport(title, entries, lists = []) {
    const target = document.querySelector("[data-airtable-sync-report]");
    if (!target) return;
    target.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = title;
    target.append(heading);
    const stats = document.createElement("dl");
    for (const [label, value] of entries) {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = String(value ?? 0);
      wrapper.append(term, description);
      stats.append(wrapper);
    }
    target.append(stats);
    for (const [label, values] of lists) {
      if (!values?.length) continue;
      const subheading = document.createElement("h4");
      subheading.textContent = label;
      const list = document.createElement("ul");
      values.forEach((value) => {
        const item = document.createElement("li");
        item.textContent = typeof value === "string" ? value : JSON.stringify(value);
        list.append(item);
      });
      target.append(subheading, list);
    }
  }

  async function runAirtableOrderBackfill(dryRun) {
    const orderNumbers = selectedAirtableOrderNumbers();
    if (!dryRun) {
      const scope = orderNumbers.length ? `للطلبات ${orderNumbers.join(", ")}` : "لكل تفاصيل الطلبات القديمة غير المرتبطة";
      if (!window.confirm(`سيتم تعديل Airtable فعليًا ${scope}. هل تريد المتابعة؟`)) return;
    }
    setAirtableSyncBusy(true);
    try {
      const response = await fetch("/admin/api/backfill-airtable-order-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, orderNumbers, ...(!dryRun ? { confirm: "BACKFILL_AIRTABLE_ORDER_PRODUCTS" } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || "تعذر تشغيل إصلاح ربط الطلبات.");
      const report = data.report || {};
      renderAirtableReport(dryRun ? "معاينة إصلاح ربط الطلبات" : "نتيجة إصلاح ربط الطلبات", [
        [dryRun ? "سيتم ربطها" : "تم ربطها", report.linked],
        ["مرتبطة بالفعل", report.alreadyLinked],
        ["تعذر تحديدها", report.unresolved],
        ["طلبات بها مشكلة", report.problemOrderNumbers?.length || 0]
      ], [
        ["أرقام الطلبات التي بها مشكلة", report.problemOrderNumbers || []],
        ["تفاصيل الفشل", (report.failures || []).map((failure) => `طلب ${failure.orderNumber || "غير معروف"}، بند ${failure.itemNumber}: ${failure.reason}`)]
      ]);
    } catch (error) {
      renderAirtableReport("فشل إصلاح ربط الطلبات", [["الحالة", error.message]]);
    } finally {
      setAirtableSyncBusy(false);
    }
  }

  async function runAirtableProductMediaSync(dryRun) {
    if (!dryRun && !window.confirm("سيتم تحديث أو إنشاء سجلات المنتجات وصورها في Airtable. هل تريد المتابعة؟")) return;
    setAirtableSyncBusy(true);
    try {
      const response = await fetch("/admin/api/sync-airtable-product-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, ...(!dryRun ? { confirm: "SYNC_AIRTABLE_PRODUCT_MEDIA" } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || "تعذر تشغيل مزامنة صور المنتجات.");
      const summary = data.summary || {};
      renderAirtableReport(dryRun ? "معاينة مزامنة صور المنتجات" : "نتيجة مزامنة صور المنتجات", [
        ["منتجات الموقع", summary.websiteProductsScanned],
        [dryRun ? "سيتم تحديثها" : "تم تحديثها", summary.airtableProductsUpdated],
        [dryRun ? "سيتم إنشاؤها" : "تم إنشاؤها", summary.airtableProductsCreated],
        ["تم تخطيها", summary.skipped ?? ((summary.alreadyCurrent || 0) + (summary.skippedMissingSku?.length || 0))]
      ], [
        ["منتجات بلا SKU", summary.skippedMissingSku || []],
        ["منتجات بلا صورة", summary.productsMissingImage || []],
        ["أخطاء", summary.failedUpdates || []]
      ]);
    } catch (error) {
      renderAirtableReport("فشل مزامنة صور المنتجات", [["الحالة", error.message]]);
    } finally {
      setAirtableSyncBusy(false);
    }
  }

  function toggleProductSidebar() {
    if (window.matchMedia("(max-width: 820px)").matches) {
      document.body.classList.toggle("sidebar-mobile-open");
    } else {
      document.body.classList.toggle("sidebar-collapsed");
    }
  }

  function openInvalidEditorSection(event) {
    const section = event.target.closest("details[data-editor-section]");
    if (section) section.open = true;
  }

  async function handleActionClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "preview-airtable-order-backfill") return runAirtableOrderBackfill(true);
    if (action === "apply-airtable-order-backfill") return runAirtableOrderBackfill(false);
    if (action === "preview-airtable-product-media") return runAirtableProductMediaSync(true);
    if (action === "apply-airtable-product-media") return runAirtableProductMediaSync(false);
    if (action === "reset-filters") return resetProductFilters();
    if (action === "quick-edit") return openQuickEdit(button.dataset.productId);
    if (action === "save-quick-edit") return saveQuickEdit(event);
    if (action === "cancel-edits") return loadProductsFromSite();
    if (action === "toggle-product-visibility") return toggleProductVisibility(button.dataset.productId);
    if (action === "duplicate-product-row") return duplicateProductById(button.dataset.productId);
    if (action === "delete-product-row") return deleteProductById(button.dataset.productId);
    if (action === "duplicate-variant") return duplicateVariant(Number(button.closest("[data-variant-index]")?.dataset.variantIndex));
    if (action === "generate-product-sku") return generateProductSku();
    if (action === "toggle-variant-json") return document.body.classList.toggle("show-variant-json");

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

    if (action === "save-taxonomy") saveTaxonomyDraft();
    if (action === "remove-main-category") removeMainCategory();

    if (action === "upload-image") {
      await openImageUpload("append");
    }

    if (action === "replace-product-images") {
      const product = currentProduct();
      if (!product) return;
      const confirmed = window.confirm("سيتم استبدال جميع صور المنتج الحالية بالصور الجديدة، وإزالة الصور القديمة من اختيارات المنتج أيضًا. هل تريد المتابعة؟");
      if (confirmed) await openImageUpload("replace");
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

    if (action === "remove-product-image") {
      removeProductImage(Number(button.closest("[data-image-index]")?.dataset.imageIndex));
    }

    if (action === "show-more-product-images") {
      state.imagePreviewLimit += 6;
      renderImagePreview(currentProduct()?.images || []);
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

    if (action === "add-main-category") addMainCategory();
    if (action === "move-main-before") moveMainCategory(-1);
    if (action === "move-main-after") moveMainCategory(1);

    if (action === "upload-taxonomy-image") {
      await openTaxonomyImageUpload(Number(button.closest("[data-taxonomy-sub-index]")?.dataset.taxonomySubIndex));
    }

    if (action === "remove-taxonomy-image") {
      const index = Number(button.closest("[data-taxonomy-sub-index]")?.dataset.taxonomySubIndex);
      const subcategory = selectedTaxonomyCategory()?.subcategories?.[index];
      if (subcategory && !Number.isNaN(index)) {
        subcategory.manualImage = "";
        renderTaxonomyManager();
        refreshTaxonomyDependentUi();
        showToast("تم حذف الصورة المخصصة محليًا. اضغط حفظ ونشر الأقسام لتطبيق التغيير.");
      }
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
          newProductIds: [...state.newProductIds],
          message: `Update products from admin ${new Date().toISOString()}`
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || result.message || `HTTP ${response.status}`);
      }

      state.products = Array.isArray(result.products) ? result.products : products;
      state.newProductIds.clear();
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

  async function openImageUpload(mode = "append") {
    state.taxonomyImageUpload = null;
    state.productImageUploadMode = mode === "replace" ? "replace" : "append";
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
        await processProductImageFiles(await Promise.all(fileHandles.map((fileHandle) => fileHandle.getFile())), state.productImageUploadMode);
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
    const mode = state.productImageUploadMode;
    state.productImageUploadMode = "append";
    await processProductImageFiles(files, mode);
  }

  async function publishTaxonomyToSite() {
    const categoriesList = taxonomyCategoriesForAdmin();
    if (state.taxonomyStatus !== "loaded" || !state.originalTaxonomy) {
      showToast("تعذر تحميل الأقسام الحالية. لم يتم إجراء أي تعديل لحماية بيانات الموقع.");
      return;
    }
    const validation = validateTaxonomy(categoriesList);
    if (!validation.ok) {
      showToast(`تعذر النشر:\n${validation.errors.join("\n")}`);
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

      state.originalTaxonomy = deepClone(categoriesList);
      localStorage.removeItem(TAXONOMY_DRAFT_KEY);
      renderAll(`تم نشر الأقسام. Commit: ${(result.commitSha || "").slice(0, 7)}`);
      showToast("تم حفظ الأقسام وصورها. التحديث يظهر خلال ثواني قليلة.");
    } catch (error) {
      showToast(`تعذر نشر الأقسام: ${error.message}`);
      console.error("Failed to publish category taxonomy:", error);
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

      subcategory.manualImage = result.path;
      state.assetPreviewVersion = String(Date.now());
      renderTaxonomyManager();
      refreshTaxonomyDependentUi();
      showToast("تم رفع الصورة اليدوية للقسم. اضغط حفظ ونشر الأقسام حتى تظهر على الموقع.");
    } catch (error) {
      showToast(`تعذر رفع صورة القسم: ${friendlyUploadError(error.message)}`);
      console.error(error);
    }
  }

  async function processProductImageFiles(files, mode = "append") {
    const imageFiles = Array.from(files || []).filter(Boolean);
    if (!imageFiles.length) return;

    const product = currentProduct();
    if (!product) return;
    ensureProductShape(product);
    const replaceExisting = mode === "replace";
    const previousImages = [...(product.images || [])];
    let uploadedCount = 0;

    if (replaceExisting) {
      product.images = [];
      product.image = "";
    }

    for (let index = 0; index < imageFiles.length; index += 1) {
      if (imageFiles.length > 1) {
        showToast(`جاري رفع الصورة ${index + 1} من ${imageFiles.length}...`);
      }
      if (await processProductImageFile(imageFiles[index])) uploadedCount += 1;
    }

    if (replaceExisting && uploadedCount === 0) {
      product.images = previousImages;
      product.image = previousImages[0] || "";
      setValue("images", arrayToLines(product.images));
      renderImagePreview(product.images);
      showToast("لم يتم رفع أي صورة جديدة؛ تم الاحتفاظ بالصور القديمة.");
      return;
    }

    if (replaceExisting) {
      removeImagesFromVariants(product, previousImages);
      renderVariants(product);
      setValue("images", arrayToLines(product.images));
      renderImagePreview(product.images);
      markDirty();
      showToast(`تم استبدال الصور القديمة ورفع ${uploadedCount} صورة جديدة. اضغط حفظ ونشر على الموقع لتطبيق التغيير.`);
    } else if (imageFiles.length > 1) {
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
      return true;
    } catch (error) {
      showToast(`تعذر رفع الصورة: ${friendlyUploadError(error.message)}`);
      console.error(error);
      return false;
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
    state.newProductIds.clear();
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

  function categoryProductImages(product) {
    if (Array.isArray(product?.images) && product.images.length) return product.images;
    return product?.image ? [product.image] : [];
  }

  function categoryProductHasAvailableVariant(product) {
    if (product?.stock === "غير متاح حاليا" || product?.stock === "Currently unavailable") return false;
    const variants = Array.isArray(product?.variants) && product.variants.length ? product.variants : [product];
    return variants.some((variant) => {
      if (variant?.quantity !== null && variant?.quantity !== undefined && variant?.quantity !== "") {
        const quantity = Number(variant.quantity);
        if (Number.isInteger(quantity) && quantity >= 0) return quantity > 0;
      }
      return variant?.available !== false;
    });
  }

  function effectiveCategoryImage(categoryId, subcategory) {
    return window.POPE_KYRILLOS_SUBCATEGORY_IMAGE_POLICY?.chooseImage({
      categoryId,
      subcategory,
      products: state.products,
      getMainId: (product) => normalizeMainCategoryValue(product.mainCategory, product.category),
      getSubId: (product) => normalizeSubCategoryValue(product.subcategory || product.subCategory),
      getImages: categoryProductImages,
      isActive: (product) => product?.published !== false && product?.deleted !== true && categoryProductHasAvailableVariant(product)
    }) || { image: "", source: "none", productId: "" };
  }

  function productById(productId) {
    return state.products.find((product) => String(product.id) === String(productId || "")) || null;
  }

  function productOptionLabel(product) {
    const sku = String(product?.sku || "").trim();
    return `${product?.name || product?.id || "منتج"}${sku ? ` — SKU: ${sku}` : ""}`;
  }

  function representativeProductOptions(categoryId, subcategory) {
    const options = state.products.filter((product) => normalizeMainCategoryValue(product.mainCategory, product.category) === categoryId
      && normalizeSubCategoryValue(product.subcategory || product.subCategory) === subcategory.id
      && product.published !== false && product.deleted !== true
      && categoryProductHasAvailableVariant(product)
      && Boolean((product.images || [])[0] || product.image));
    return [`<option value="">تلقائي: أول منتج صالح من نفس القسم</option>`, ...options.map((product) => {
      const selected = String(product.id) === String(subcategory.representativeProductId || "") ? " selected" : "";
      return `<option value="${escapeAttribute(product.id)}"${selected}>${escapeHtml(productOptionLabel(product))}</option>`;
    })].join("");
  }

  function renderTaxonomyManager() {
    if (!elements.taxonomyMain || !elements.taxonomyList) return;
    if (state.taxonomyStatus === "loading") {
      elements.taxonomyMain.innerHTML = "";
      elements.taxonomyMain.disabled = true;
      elements.taxonomyList.innerHTML = `<div class="empty-state" role="status">جاري تحميل الأقسام...</div>`;
      return;
    }
    if (state.taxonomyStatus === "error") {
      elements.taxonomyMain.innerHTML = "";
      elements.taxonomyMain.disabled = true;
      elements.taxonomyList.innerHTML = `<div class="empty-state error-state" role="alert">${escapeHtml(state.taxonomyError)}<br>حدث خطأ أثناء تحميل الأقسام. لم يتم تغيير أو حذف أي بيانات.</div>`;
      if (elements.publishTaxonomyButton) elements.publishTaxonomyButton.disabled = true;
      return;
    }
    elements.taxonomyMain.disabled = false;
    if (elements.publishTaxonomyButton) elements.publishTaxonomyButton.disabled = false;
    const categoriesList = taxonomyCategoriesForAdmin();
    if (!categoriesList.length) {
      elements.taxonomyMain.innerHTML = "";
      elements.taxonomyList.innerHTML = `<div class="empty-state">لا توجد أقسام بعد. أضف قسمًا جديدًا.</div>`;
      return;
    }

    if (!findTaxonomyCategory(state.taxonomyMain)) state.taxonomyMain = categoriesList[0].id;
    elements.taxonomyMain.innerHTML = categoriesList
      .map((category) => `<option value="${escapeAttribute(category.id)}">${escapeHtml(category.name)}</option>`)
      .join("");
    elements.taxonomyMain.value = state.taxonomyMain;

    const category = selectedTaxonomyCategory();
    document.querySelectorAll("[data-taxonomy-main-field]").forEach((field) => {
      const key = field.dataset.taxonomyMainField;
      if (field.type === "checkbox") field.checked = category?.[key] !== false;
      else field.value = category?.[key] || "";
    });
    const allSubcategories = category?.subcategories || [];
    const subcategories = allSubcategories.map((subcategory, index) => ({ subcategory, index }));
    if (!subcategories.length) {
      elements.taxonomyList.innerHTML = `<div class="empty-state">لا توجد أقسام فرعية هنا.</div>`;
      return;
    }

    const categoryOptions = categoriesList
      .map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name)}</option>`)
      .join("");

    elements.taxonomyList.innerHTML = subcategories.map(({ subcategory, index }) => {
      const effectiveImage = effectiveCategoryImage(category.id, subcategory);
      const effectiveProduct = productById(effectiveImage.productId);
      const effectiveSource = effectiveImage.source === "manual"
        ? "المصدر: صورة مخصصة للقسم"
        : effectiveProduct
          ? `المصدر: صورة المنتج \"${effectiveProduct.name || effectiveProduct.id}\"`
          : "⚠ لا توجد صورة متاحة لهذا القسم حاليًا.";
      const automaticProduct = !subcategory.representativeProductId && effectiveProduct
        ? `يستخدم حاليًا: ${productOptionLabel(effectiveProduct)}`
        : "";
      const representativePreview = effectiveProduct;
      return `
      <article class="taxonomy-card" data-taxonomy-sub-index="${index}">
        <div class="taxonomy-current-image ${effectiveImage.image ? "" : "is-missing"}">
          <strong>الصورة الحالية للقسم</strong>
          <div class="taxonomy-preview taxonomy-effective-preview">
            ${effectiveImage.image ? `<img src="${escapeAttribute(previewAssetUrl(effectiveImage.image))}" alt="صورة ${escapeAttribute(subcategory.name || "القسم")}" loading="lazy" decoding="async">` : ""}
          </div>
          <p class="taxonomy-image-source ${effectiveImage.image ? "" : "warning"}">${escapeHtml(effectiveSource)}</p>
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
            <span>الوصف</span>
            <input type="text" data-taxonomy-field="description" value="${escapeAttribute(subcategory.description || "")}">
          </label>
          <section class="taxonomy-manual-image">
            <strong>صورة مخصصة للقسم (اختياري)</strong>
            <div class="taxonomy-manual-preview">
              ${subcategory.manualImage ? `<img src="${escapeAttribute(previewAssetUrl(subcategory.manualImage))}" alt="معاينة الصورة المخصصة" loading="lazy" decoding="async">` : `<span>لا توجد صورة مخصصة</span>`}
            </div>
            <label>
              <span class="sr-only">مسار الصورة المخصصة</span>
              <input type="text" dir="ltr" data-taxonomy-field="manualImage" value="${escapeAttribute(subcategory.manualImage || "")}" placeholder="اتركه فارغًا لاستخدام منتج من نفس القسم">
            </label>
            <div class="taxonomy-image-actions">
              <button class="button small secondary" type="button" data-action="upload-taxonomy-image">${subcategory.manualImage ? "تغيير الصورة" : "رفع صورة"}</button>
              <button class="button small ghost" type="button" data-action="remove-taxonomy-image" ${subcategory.manualImage ? "" : "disabled"}>حذف الصورة المخصصة</button>
            </div>
            <small>إذا لم تضف صورة مخصصة، سيستخدم الموقع تلقائيًا صورة المنتج الممثل للقسم.</small>
          </section>
          <label>
            <span>المنتج الممثل للقسم</span>
            <select data-taxonomy-field="representativeProductId">${representativeProductOptions(category.id, subcategory)}</select>
            ${automaticProduct ? `<small class="taxonomy-auto-product">${escapeHtml(automaticProduct)}</small>` : ""}
            ${representativePreview ? `<span class="taxonomy-selected-product"><img src="${escapeAttribute(previewAssetUrl(categoryProductImages(representativePreview)[0] || ""))}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(productOptionLabel(representativePreview))}</span></span>` : ""}
          </label>
          <label>
            <span>نقل إلى قسم رئيسي</span>
            <select data-taxonomy-field="mainId">${categoryOptions}</select>
          </label>
          <label class="check-row"><input type="checkbox" data-taxonomy-field="visible" ${subcategory.visible !== false ? "checked" : ""}><span>ظاهر للعملاء</span></label>
          <label class="check-row"><input type="checkbox" data-taxonomy-field="homeVisible" ${subcategory.homeVisible !== false ? "checked" : ""}><span>ظاهر في الرئيسية</span></label>
        </div>
        <div class="taxonomy-card-actions">
          <button class="button small ghost" type="button" data-action="move-subcategory-before" ${index === 0 ? "disabled" : ""}>فوق</button>
          <button class="button small ghost" type="button" data-action="move-subcategory-after" ${index === allSubcategories.length - 1 ? "disabled" : ""}>تحت</button>
          <button class="button small danger" type="button" data-action="remove-subcategory">حذف</button>
        </div>
      </article>
    `;
    }).join("");

    elements.taxonomyList.querySelectorAll("[data-taxonomy-field='mainId']").forEach((select) => {
      select.value = category.id;
    });
  }

  function addMainCategory() {
    if (state.taxonomyStatus !== "loaded") return;
    const id = `custom-category-${Date.now()}`;
    state.taxonomy.push({ id, name: "قسم رئيسي جديد", description: "", subcategoryImage: "assets/optimized/hero-products-collage.webp", visible: true, homeVisible: true, subcategories: [] });
    state.taxonomyMain = id; renderTaxonomyManager(); refreshTaxonomyDependentUi(); showToast("تم إضافة قسم رئيسي جديد.");
  }

  function removeMainCategory() {
    const category = selectedTaxonomyCategory();
    if (!category) return;
    const linked = state.products.some((product) => normalizeMainCategoryValue(product.mainCategory, product.category) === category.id);
    if (linked) {
      showToast("لا يمكن حذف هذا القسم لأنه مرتبط بمنتجات حالية.");
      return;
    }
    if (!window.confirm(`هل تريد حذف القسم «${category.name}»؟`)) return;
    state.taxonomy = state.taxonomy.filter((item) => item !== category);
    state.taxonomyMain = state.taxonomy[0]?.id || "";
    renderTaxonomyManager();
    refreshTaxonomyDependentUi();
  }

  function moveMainCategory(direction) {
    const index = state.taxonomy.findIndex((item) => item.id === state.taxonomyMain);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= state.taxonomy.length) return;
    [state.taxonomy[index], state.taxonomy[next]] = [state.taxonomy[next], state.taxonomy[index]];
    renderTaxonomyManager(); refreshTaxonomyDependentUi();
  }

  document.querySelector(".taxonomy-main-fields")?.addEventListener("input", (event) => {
    const field = event.target.closest("[data-taxonomy-main-field]");
    const category = selectedTaxonomyCategory();
    if (!field || !category) return;
    const key = field.dataset.taxonomyMainField;
    category[key] = field.type === "checkbox" ? field.checked : field.value.trim();
    if (key === "name") renderTaxonomyManager();
    refreshTaxonomyDependentUi();
  });

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
    } else if (field === "manualImage") {
      subcategory.manualImage = normalizeImagePath(element.value);
      if (element.value !== subcategory.manualImage) element.value = subcategory.manualImage;
    } else {
      subcategory[field] = element.type === "checkbox" ? element.checked : element.value.trim();
    }

    if (event.type === "change" && (field === "manualImage" || field === "representativeProductId")) {
      renderTaxonomyManager();
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
      description: "",
      manualImage: "",
      representativeProductId: "",
      visible: true,
      homeVisible: true
    });
    renderTaxonomyManager();
    refreshTaxonomyDependentUi();
    showToast("تم إضافة قسم فرعي جديد.");
  }

  function removeSubcategory(index) {
    const category = selectedTaxonomyCategory();
    if (!category || Number.isNaN(index) || !category.subcategories?.[index]) return;
    const subcategory = category.subcategories[index];
    const linked = state.products.some((product) => normalizeSubCategoryValue(product.subcategory || product.subCategory) === subcategory.id);
    if (linked) {
      showToast("لا يمكن حذف هذا القسم الفرعي لأنه مرتبط بمنتجات حالية.");
      return;
    }
    const confirmed = window.confirm("هل تريد حذف هذا القسم الفرعي من قائمة الأقسام؟");
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
    if (elements.stickySaveState) elements.stickySaveState.textContent = state.dirty ? "هناك تعديلات غير محفوظة" : message || "تم الحفظ";
    if (elements.saveBar) elements.saveBar.hidden = !state.selectedId;
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

  elements.productList.innerHTML = `<div class="product-table" role="table">
    <div class="product-table-head" role="row"><span>اختيار</span><span>الصورة</span><span>اسم المنتج</span><span>القسم</span><span>السعر</span><span>المخزون</span><span>الحالة</span><span>الإجراءات</span></div>
    ${products.map((product) => {
    const taxonomyLine = `${mainCategoryName(product)} / ${subCategoryName(product)}`;
    const selected = product.id === state.selectedId ? " active" : "";
    const price = product.price ? `${formatNumber(product.price)} ج.م` : "بدون سعر";
    const reviewBadge = needsReview(product) ? " - يحتاج مراجعة" : "";
    const quantity = totalProductQuantity(product);
    const image = product.images?.[0] || product.image || "assets/optimized/hero-products-collage.webp";
    return `<article class="product-table-row${selected}" role="row" data-product-row="${escapeAttribute(product.id)}">
      <span><input type="checkbox" aria-label="اختيار ${escapeAttribute(product.name || "المنتج")}"></span>
      <span><img src="${escapeAttribute(previewAssetUrl(image))}" alt="" loading="lazy" decoding="async"></span>
      <button class="product-name-cell" type="button" data-select-product="${escapeAttribute(product.id)}"><strong>${escapeHtml(product.name || "منتج بدون اسم")}</strong><small>${escapeHtml(firstProductSku(product) || product.id)}</small>${reviewBadge ? `<b class="review-badge">يحتاج مراجعة</b>` : ""}</button>
      <span>${escapeHtml(taxonomyLine)}</span><strong>${escapeHtml(price)}</strong><span>${quantity === null ? "—" : formatNumber(quantity)}</span>
      <span class="status-pill ${product.stock === "غير متاح حاليا" ? "is-out" : ""}">${escapeHtml(product.stock || "متاح")}</span>
      <span class="row-actions"><button type="button" data-select-product="${escapeAttribute(product.id)}">تعديل</button><button type="button" data-action="quick-edit" data-product-id="${escapeAttribute(product.id)}">تعديل سريع</button><button type="button" data-action="duplicate-product-row" data-product-id="${escapeAttribute(product.id)}">تكرار</button><button type="button" data-action="toggle-product-visibility" data-product-id="${escapeAttribute(product.id)}">${product.stock === "غير متاح حاليا" ? "إظهار" : "إخفاء"}</button><button class="danger-link" type="button" data-action="delete-product-row" data-product-id="${escapeAttribute(product.id)}">حذف</button></span>
    </article>`;
  }).join("")}</div>`;

  elements.productList.querySelectorAll("[data-select-product]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.selectProduct;
      renderProductList();
      renderEditor();
      if (window.matchMedia("(max-width: 820px)").matches) document.body.classList.remove("sidebar-mobile-open");
    });
  });
}

  function filteredProducts() {
  return state.products.filter((product) => {
    const searchText = [product.id, product.sku, product.name, product.label, product.badge, product.description, product.mainCategory, product.subCategory, ...(product.tags || []), ...(product.variants || []).map((variant) => variant.sku)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !state.search || searchText.includes(state.search);
    const matchesCategory = state.categoryFilter === "all" || product.category === state.categoryFilter;
    const matchesMain = state.mainCategoryFilter === "all" || mainCategoryName(product) === state.mainCategoryFilter;
    const matchesSub = state.subCategoryFilter === "all" || subCategoryName(product) === state.subCategoryFilter;
    const matchesReview = !state.needsReviewOnly || needsReview(product);
    const isOut = product.stock === "غير متاح حاليا" || (totalProductQuantity(product) === 0);
    const matchesStock = state.stockFilter === "all" || (state.stockFilter === "out" ? isOut : !isOut);
    return matchesSearch && matchesCategory && matchesMain && matchesSub && matchesReview && matchesStock;
  });
}

  function firstProductSku(product) {
    return product.sku || (product.variants || []).find((variant) => variant.sku)?.sku || "";
  }

  function validateTaxonomy(categoriesList) {
    const errors = [];
    if (!Array.isArray(categoriesList) || !categoriesList.length) errors.push("قائمة الأقسام فارغة.");
    const categoryIds = new Set();
    const subcategoryIds = new Set();
    const duplicateCategoryIds = new Set();
    const duplicateSubcategoryIds = new Set();
    for (const category of categoriesList || []) {
      const id = String(category?.id || "").trim();
      if (!id) errors.push("يوجد قسم رئيسي بدون ID صالح.");
      else if (categoryIds.has(id)) duplicateCategoryIds.add(id);
      categoryIds.add(id);
      if (!String(category?.name || "").trim()) errors.push(`القسم ${id || "غير المعروف"} بدون اسم.`);
      if (!Array.isArray(category?.subcategories)) errors.push(`الأقسام الفرعية في ${id} غير صالحة.`);
      for (const subcategory of category?.subcategories || []) {
        const subId = String(subcategory?.id || "").trim();
        if (!subId) errors.push(`يوجد قسم فرعي بدون ID داخل ${id}.`);
        else if (subcategoryIds.has(subId)) duplicateSubcategoryIds.add(subId);
        subcategoryIds.add(subId);
        if (!String(subcategory?.name || "").trim()) errors.push(`القسم الفرعي ${subId || "غير المعروف"} بدون اسم.`);
      }
    }
    const duplicateIds = [
      ...[...duplicateCategoryIds].map((id) => `قسم رئيسي: ${id}`),
      ...[...duplicateSubcategoryIds].map((id) => `قسم فرعي: ${id}`)
    ];
    if (duplicateIds.length) {
      errors.unshift(`تم العثور على ${duplicateIds.length} IDs مكررة:\n${duplicateIds.map((item) => `• ${item}`).join("\n")}`);
    }
    if (state.products.length) {
      const parentBySubcategory = new Map();
      for (const category of categoriesList || []) {
        for (const subcategory of category.subcategories || []) parentBySubcategory.set(subcategory.id, category.id);
      }
      for (const product of state.products) {
        const mainId = normalizeMainCategoryValue(product.mainCategory, product.category);
        const subId = normalizeSubCategoryValue(product.subcategory || product.subCategory);
        if (!categoryIds.has(mainId)) errors.push(`المنتج ${product.id} مرتبط بقسم رئيسي غير موجود: ${mainId}`);
        if (!parentBySubcategory.has(subId)) errors.push(`المنتج ${product.id} مرتبط بقسم فرعي غير موجود: ${subId}`);
        else if (parentBySubcategory.get(subId) !== mainId) errors.push(`القسم الفرعي للمنتج ${product.id} لا يتبع قسمه الرئيسي.`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function saveTaxonomyDraft() {
    if (state.taxonomyStatus !== "loaded" || !state.originalTaxonomy) {
      showToast("تعذر تحميل الأقسام الحالية؛ تم منع الحفظ لحماية البيانات.");
      return;
    }
    const validation = validateTaxonomy(state.taxonomy);
    if (!validation.ok) {
      showToast(`تعذر الحفظ:\n${validation.errors.join("\n")}`);
      return;
    }
    try {
      localStorage.setItem(TAXONOMY_DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), categories: state.taxonomy }));
      showToast("تم حفظ مسودة الأقسام بأمان على هذا الجهاز.");
    } catch (error) {
      console.error("Failed to save taxonomy draft:", error);
      showToast("تعذر حفظ مسودة الأقسام. لم يتم تغيير بيانات الموقع.");
    }
  }

  function totalProductQuantity(product) {
    const quantities = (product.variants || []).map((variant) => numberOrNull(variant.quantity)).filter((value) => value !== null);
    return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : numberOrNull(product.quantity);
  }

  function resetProductFilters() {
    state.search = "";
    state.categoryFilter = "all";
    state.mainCategoryFilter = "all";
    state.subCategoryFilter = "all";
    state.stockFilter = "all";
    state.needsReviewOnly = false;
    if (elements.search) elements.search.value = "";
    if (elements.mainCategoryFilter) elements.mainCategoryFilter.value = "all";
    fillSubCategoryFilter();
    if (elements.subCategoryFilter) elements.subCategoryFilter.value = "all";
    if (elements.stockFilter) elements.stockFilter.value = "all";
    if (elements.needsReviewFilter) elements.needsReviewFilter.checked = false;
    renderProductList();
  }

  function setAdminView(view) {
    state.adminView = view || "products";
    document.querySelector("[data-admin-layout]")?.setAttribute("data-admin-view", state.adminView);
    document.querySelectorAll("[data-admin-view-target]").forEach((button) => {
      const active = button.dataset.adminViewTarget === state.adminView;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    const section = document.querySelector(`[data-view-section="${state.adminView}"]`);
    if (section) section.open = true;
  }

  function selectEditorTab(tab) {
    document.querySelectorAll("[data-editor-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.editorTab === tab));
    document.querySelectorAll("[data-editor-section]").forEach((section) => { section.open = section.dataset.editorSection === tab; });
    if (tab === "images") renderImagePreview(currentProduct()?.images || []);
  }

  function openQuickEdit(productId) {
    const product = state.products.find((item) => item.id === productId);
    const form = elements.quickEditForm;
    if (!product || !form) return;
    state.quickEditId = product.id;
    document.querySelector("[data-quick-edit-title]").textContent = product.name || "منتج";
    form.elements.name.value = product.name || "";
    form.elements.price.value = product.price ?? "";
    form.elements.quantity.value = totalProductQuantity(product) ?? "";
    form.elements.stock.value = product.stock || "متاح";
    form.elements.mainCategory.innerHTML = taxonomyCategoriesForAdmin().map((category) => `<option value="${escapeAttribute(category.name)}">${escapeHtml(category.name)}</option>`).join("");
    form.elements.mainCategory.value = mainCategoryOptionValue(product.mainCategory, product.category);
    fillQuickEditSubcategories(form, product.subCategory);
    form.elements.mainCategory.onchange = () => fillQuickEditSubcategories(form, "");
    elements.quickEditDialog.showModal();
  }

  function fillQuickEditSubcategories(form, selectedValue) {
    const subs = taxonomySubcategories(form.elements.mainCategory.value) || [];
    form.elements.subCategory.innerHTML = subs.map((item) => `<option value="${escapeAttribute(item.name)}">${escapeHtml(item.name)}</option>`).join("");
    form.elements.subCategory.value = subCategoryOptionValue(selectedValue);
  }

  function saveQuickEdit(event) {
    event.preventDefault();
    const product = state.products.find((item) => item.id === state.quickEditId);
    const form = elements.quickEditForm;
    if (!product || !form || !form.reportValidity()) return;
    product.name = form.elements.name.value.trim();
    product.price = numberOrNull(form.elements.price.value) ?? 0;
    product.mainCategory = form.elements.mainCategory.value;
    product.subCategory = form.elements.subCategory.value;
    product.stock = form.elements.stock.value;
    const quantity = numberOrNull(form.elements.quantity.value);
    if ((product.variants || []).length === 1) product.variants[0].quantity = quantity;
    (product.variants || []).forEach((variant) => { variant.available = product.stock !== "غير متاح حاليا"; });
    markDirty();
    renderProductList();
    if (state.selectedId === product.id) renderEditor();
    elements.quickEditDialog.close();
    showToast("تم تطبيق التعديل السريع. احفظ أو انشر لتثبيت التغييرات.");
  }

  function toggleProductVisibility(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    product.stock = product.stock === "غير متاح حاليا" ? "متاح" : "غير متاح حاليا";
    (product.variants || []).forEach((variant) => { variant.available = product.stock !== "غير متاح حاليا"; });
    markDirty();
    renderProductList();
  }

  function renderEditor() {
    const product = currentProduct();
    elements.editor.hidden = !product;
    elements.editorEmpty.hidden = Boolean(product);
    if (elements.actionsProductName) elements.actionsProductName.textContent = product?.name || "اختر منتجًا للتعديل";

    if (!product) return;

    ensureProductShape(product);
    if (state.imagePreviewProductId !== product.id) {
      state.imagePreviewProductId = product.id;
      state.imagePreviewLimit = 6;
    }
    elements.editorTitle.textContent = product.name || "منتج بدون اسم";
    elements.editorId.textContent = `الكود: ${product.id}`;
    const breadcrumb = document.querySelector("[data-editor-breadcrumb]");
    if (breadcrumb) breadcrumb.textContent = `المنتجات  >  ${mainCategoryName(product)}  >  ${subCategoryName(product)}  >  ${product.name || "منتج"}`;
    const coloringWarning = elements.editor.querySelector("[data-coloring-files-warning]");
    if (coloringWarning) {
      const searchable = [product.name, product.description, ...(product.tags || [])].join(" ");
      const needsColoringFiles = /(?:تلوين|يوتا|يوطا|coloring|yota)/i.test(searchable) && !(
        product.coloringBaseImageUrl && product.coloringMaskUrl && product.coloringOutlineUrl &&
        (product.coloringRegionsUrl || product.coloringRegions?.length)
      );
      coloringWarning.hidden = !needsColoringFiles;
      coloringWarning.textContent = needsColoringFiles
        ? "هذا المنتج يحتاج إلى إضافة ملفات التلوين: صورة الأساس، قناع المناطق، الحدود، وبيانات المناطق. لن يظهر محرر التلوين للعميل قبل اكتمالها."
        : "";
    }

    setValue("name", product.name);
    setValue("id", product.id);
    setValue("sku", product.sku || "");
    setValue("category", product.category);
    setValue("label", product.label);
    setValue("mainCategory", mainCategoryOptionValue(product.mainCategory, product.category));
    fillSubCategorySelect(product);
    setValue("subCategory", subCategoryOptionValue(product.subCategory));
    setValue("badge", product.badge);
    setValue("stock", product.stock || "متاح");
    setValue("price", product.price ?? "");
    setValue("priceNote", product.priceNote);
    setValue("isBestSeller", Boolean(product.isBestSeller));
    setValue("description", product.description);
    setValue("tags", arrayToLines(product.tags));
    setValue("images", arrayToLines(product.images?.length ? product.images : [product.image].filter(Boolean)));
    setValue("options", JSON.stringify(product.options || [], null, 2));
    const hasVariants = document.querySelector("[data-has-variants]");
    if (hasVariants) hasVariants.checked = product.variants.length > 1 || product.variants.some((variant) => Object.keys(variant.options || {}).length);

    renderImagePreview(product.images || []);
    renderVariants(product);
  }

  function renderImagePreview(images) {
    const visibleImages = (images || []).filter(Boolean);
    if (elements.imageSection && !elements.imageSection.open) {
      elements.imagePreview.innerHTML = `<div class="image-preview-placeholder">${visibleImages.length ? `${visibleImages.length} صورة — افتح قسم الصور للمعاينة والحذف والترتيب.` : "لا توجد صور بعد."}</div>`;
      return;
    }
    if (!visibleImages.length) {
      elements.imagePreview.innerHTML = `<div class="empty-state">لا توجد صور بعد.</div>`;
      return;
    }

    const renderedImages = visibleImages.slice(0, state.imagePreviewLimit);
    elements.imagePreview.innerHTML = renderedImages.map((image, index) => `
      <figure class="${index === 0 ? "image-primary" : ""}" data-image-index="${index}">
        <img src="${escapeAttribute(previewAssetUrl(image))}" alt="صورة ${index + 1}" loading="lazy" decoding="async" fetchpriority="low" onload="this.closest('figure').classList.remove('image-missing')" onerror="this.closest('figure').classList.add('image-missing')">
        <div class="image-preview-actions" aria-label="ترتيب الصورة">
          <button type="button" data-action="move-image-before" ${index === 0 ? "disabled" : ""} title="انقل الصورة قبل اللي قبلها">قبلها</button>
          <button type="button" data-action="make-primary-image" ${index === 0 ? "disabled" : ""} title="اجعل الصورة هي الصورة الأساسية">الأولى</button>
          <button type="button" data-action="move-image-after" ${index === visibleImages.length - 1 ? "disabled" : ""} title="انقل الصورة بعد اللي بعدها">بعدها</button>
          <button class="image-action-delete" type="button" data-action="remove-product-image" title="احذف الصورة القديمة من المنتج">حذف</button>
        </div>
        ${index === 0 ? `<span class="image-primary-badge">⭐ الصورة الرئيسية</span>` : ""}
        <figcaption>${escapeHtml(image)}</figcaption>
      </figure>
    `).join("") + (renderedImages.length < visibleImages.length
      ? `<button class="button secondary image-preview-more" type="button" data-action="show-more-product-images">عرض ${Math.min(6, visibleImages.length - renderedImages.length)} صور إضافية</button>`
      : "");
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

  function removeProductImage(index) {
    const product = currentProduct();
    if (!product || !Number.isInteger(index) || index < 0 || index >= product.images.length) return;
    const image = product.images[index];

    removeImagesFromVariants(product, [image]);
    updateProductImages(product, product.images.filter((_, imageIndex) => imageIndex !== index));
    renderVariants(product);
    showToast("تم حذف الصورة القديمة من المنتج. اضغط حفظ ونشر لتطبيق التغيير على الموقع.");
  }

  function removeImagesFromVariants(product, imagesToRemove) {
    const removed = new Set(imagesToRemove.map(normalizeImagePath).filter(Boolean));
    if (!removed.size) return;

    (product.variants || []).forEach((variant) => {
      variant.images = unique((variant.images || [variant.image].filter(Boolean))
        .map(normalizeImagePath)
        .filter((image) => image && !removed.has(image)));
      variant.image = variant.images[0] || null;
    });
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
              <button class="button small secondary" type="button" data-action="duplicate-variant">تكرار</button>
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
          <label class="advanced-variant-json">
            <span>اختيارات هذا السطر JSON</span>
            <textarea rows="4" dir="ltr" data-variant-field="options">${escapeHtml(optionsText)}</textarea>
          </label>
          <label class="advanced-variant-json">
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
  if (field === "isBestSeller") {
    product.isBestSeller = element.checked === true;
    renderProductList();
    return;
  }

  const value = element.value;

  if (field === "id") {
    const oldId = product.id;
    product.id = slugLike(value) || oldId;
    if (state.newProductIds.has(oldId) && product.id !== oldId) {
      state.newProductIds.delete(oldId);
      state.newProductIds.add(product.id);
    }
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
      variant.available = available;
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

  function generatePermanentAdminSku() {
    const used = new Set(state.products.flatMap((product) => [
      product.sku,
      ...(product.variants || []).map((variant) => variant.sku)
    ]).filter(Boolean));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let randomPart = "";
      if (window.crypto?.randomUUID) {
        randomPart = window.crypto.randomUUID().replace(/-/g, "");
      } else if (window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        randomPart = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      const sku = `PK-${randomPart.toUpperCase()}`;
      if (/^PK-[A-F0-9]{32}$/.test(sku) && !used.has(sku)) return sku;
    }
    throw new Error("تعذر إنشاء SKU فريد للمنتج الجديد.");
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
      isBestSeller: false,
      image: "",
      url: `https://popekyrillos.store/?product=${id}`,
      tags: [],
      images: [],
      options: [],
      variants: []
    };
    const variant = createVariant(product);
    variant.sku = generatePermanentAdminSku();
    product.variants.push(variant);
    state.products.unshift(product);
    state.newProductIds.add(id);
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
      id: `${copy.id}-variant-${index + 1}`,
      sku: generatePermanentAdminSku()
    }));
    if (!copy.variants.length) {
      const variant = createVariant(copy);
      variant.sku = generatePermanentAdminSku();
      copy.variants.push(variant);
    }
    state.products.unshift(copy);
    state.newProductIds.add(copy.id);
    state.selectedId = copy.id;
    markDirty();
    fillCategoryFilter();
    renderProductList();
    renderEditor();
    showToast("تم تكرار المنتج.");
  }

  function generateProductSku() {
    const product = currentProduct();
    if (!product) return;
    if (product.sku && !window.confirm("يوجد SKU حالي بالفعل. هل تريد استبداله؟")) return;
    product.sku = generatePermanentAdminSku();
    setValue("sku", product.sku);
    markDirty();
  }

  function duplicateProductById(productId) {
    state.selectedId = productId;
    duplicateProduct();
  }

  function deleteProductById(productId) {
    state.selectedId = productId;
    deleteProduct();
  }

  function toggleVariantsUi(event) {
    const product = currentProduct();
    if (!product) return;
    if (event.currentTarget.checked && !product.variants.length) product.variants.push(createVariant(product));
    elements.variantList.hidden = !event.currentTarget.checked;
  }

  function deleteProduct() {
    const product = currentProduct();
    if (!product) return;
    const confirmed = window.confirm(`هل تريد حذف "${product.name}"؟`);
    if (!confirmed) return;

    state.products = state.products.filter((item) => item.id !== product.id);
    state.newProductIds.delete(product.id);
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
    const variant = createVariant(product, product.variants.length + 1);
    if (state.newProductIds.has(product.id)) variant.sku = generatePermanentAdminSku();
    product.variants.push(variant);
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

  function duplicateVariant(index) {
    const product = currentProduct();
    const source = product?.variants?.[index];
    if (!product || !source) return;
    const copy = deepClone(source);
    copy.id = `${product.id}-variant-${Date.now()}-${index + 2}`;
    copy.sku = generatePermanentAdminSku();
    copy.title = `${source.title || `اختيار ${index + 1}`} - نسخة`;
    product.variants.splice(index + 1, 0, copy);
    reorderProductOptionsFromVariants(product);
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
  product.isBestSeller = product.isBestSeller === true;
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
    product.isBestSeller = product.isBestSeller === true;
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
    const productAvailable = product.stock !== "غير متاح حاليا";
    return {
      id: variant.id || `${product.id}-variant-${index + 1}`,
      title: variant.title || `اختيار ${index + 1}`,
      options: variant.options || {},
      price: numberOrNull(variant.price) ?? product.price ?? 0,
      compareAtPrice: numberOrNull(variant.compareAtPrice),
      available: productAvailable && variant.available !== false,
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
    const taxonomyVersion = Date.now();
    const categoriesSource = JSON.stringify(taxonomyCategoriesForAdmin(), null, 4)
      .replace(/^/gm, "  ");
    return `(function () {
  const defaultCategories = ${categoriesSource.trimStart()};
  const TAXONOMY_STORAGE_KEY = "pope-kyrillos-taxonomy";
  const TAXONOMY_VERSION_STORAGE_KEY = "pope-kyrillos-taxonomy-version";
  const CURRENT_TAXONOMY_VERSION = ${taxonomyVersion};
  const categories = (() => {
    try {
      const storedVersion = Number(localStorage.getItem(TAXONOMY_VERSION_STORAGE_KEY) || 0);
      if (!Number.isFinite(storedVersion) || storedVersion < CURRENT_TAXONOMY_VERSION) {
        localStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify(defaultCategories));
        localStorage.setItem(TAXONOMY_VERSION_STORAGE_KEY, String(CURRENT_TAXONOMY_VERSION));
        return defaultCategories;
      }
      const stored = JSON.parse(localStorage.getItem(TAXONOMY_STORAGE_KEY) || "null");
      if (Array.isArray(stored)) return stored;
      localStorage.setItem(TAXONOMY_STORAGE_KEY, JSON.stringify(defaultCategories));
      localStorage.setItem(TAXONOMY_VERSION_STORAGE_KEY, String(CURRENT_TAXONOMY_VERSION));
      return defaultCategories;
    } catch {
      return defaultCategories;
    }
  })();

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

  function categoryImage(category) {
    const value = category?.subcategoryImage || category?.imageUrl || category?.imageURL || category?.image_url || category?.image || category?.thumbnail || category?.thumbnailUrl || category?.cover || category?.categoryImage || "";
    if (typeof value !== "string" || !value.trim() || /^(?:javascript|data:text|blob):/i.test(value.trim())) return "";
    return value.trim().replace(/^\\/public\\//, "/");
  }

  window.POPE_KYRILLOS_TAXONOMY = {
    categories,
    defaultCategories,
    CURRENT_TAXONOMY_VERSION,
    customerCategories,
    categoryById,
    categoryByName,
    subcategoryById,
    subcategoryByName,
    categoryIdFromName,
    categoryNameFromId,
    subcategoryIdFromName,
    subcategoryNameFromId,
    getSubcategories,
    categoryImage
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
    if (element.type === "checkbox") {
      element.checked = value === true;
      return;
    }
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
