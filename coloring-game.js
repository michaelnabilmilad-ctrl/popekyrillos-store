(() => {
  "use strict";
  const designs = Array.isArray(window.COLORING_DESIGNS) ? window.COLORING_DESIGNS : [];
  const canvas = document.querySelector("[data-coloring-canvas]");
  if (!canvas || !designs.length) return;
  const coloringParams = new URLSearchParams(window.location.search);
  const requestedDesign = designs.find((design) => design.id === coloringParams.get("design"))
    || designs.find((design) => design.productId === coloringParams.get("product"))
    || designs[0];

  const ctx = canvas.getContext("2d");
  const colorCanvas = document.createElement("canvas");
  const colorCtx = colorCanvas.getContext("2d");
  const highlightCanvas = document.createElement("canvas");
  const highlightCtx = highlightCanvas.getContext("2d");
  const loading = document.querySelector("[data-loading]");
  const shell = document.querySelector("[data-canvas-shell]");
  const status = document.querySelector("[data-status]");
  const hint = document.querySelector("[data-touch-hint]");
  const modelName = document.querySelector("#current-model-name");
  const selectedPreview = document.querySelector("[data-selected-preview]");
  const storagePrefix = "pope-kyrillos-coloring:";
  const palette = (window.YOTA_COLORS || [])
    .filter((color) => color.available !== false)
    .map((color) => [color.name, color.hex, color]);
  const state = {
    design: requestedDesign, base: null, outline: null, regionPixels: new Map(), regionAt: null,
    colors: {}, selectedColor: palette[0][1], eraser: false, undo: [], redo: [],
    hoveredRegion: "", ready: false
  };

  const announce = (message) => { status.textContent = message; };
  const storageKey = () => `${storagePrefix}${state.design.id}`;
  const snapshot = () => JSON.stringify(state.colors);
  const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

  function setActionState() {
    document.querySelector('[data-action="undo"]').disabled = !state.undo.length;
    document.querySelector('[data-action="redo"]').disabled = !state.redo.length;
  }
  function saveLocal(showMessage = false) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        modelId: state.design.id, coloredParts: state.colors, savedAt: new Date().toISOString()
      }));
      if (showMessage) announce("تم حفظ التصميم على هذا الجهاز.");
    } catch { announce("تعذّر الحفظ على هذا الجهاز."); }
  }
  function restoreLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      state.colors = saved.coloredParts && typeof saved.coloredParts === "object" ? saved.coloredParts : {};
    } catch { state.colors = {}; }
  }
  function buildPalette() {
    const target = document.querySelector("[data-palette]");
    palette.forEach(([name, color, metadata], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-swatch";
      button.style.background = color;
      button.dataset.color = color;
      button.dataset.light = ["#F7F6F6", "#FEC105"].includes(color);
      if (metadata?.metallic) button.style.background = `linear-gradient(135deg,${metadata.highlight},${metadata.hex},${metadata.shadow})`;
      button.setAttribute("aria-label", name);
      button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
      button.addEventListener("click", () => selectColor(color));
      target.append(button);
    });
  }
  function selectColor(color) {
    state.selectedColor = color;
    state.eraser = false;
    selectedPreview.style.background = color;
    canvas.classList.remove("is-eraser");
    document.querySelector('[data-action="eraser"]').classList.remove("is-active");
    document.querySelectorAll(".color-swatch").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.color.toLowerCase() === color.toLowerCase() ? "true" : "false");
    });
  }
  function readRegionMap(image) {
    const reader = document.createElement("canvas");
    reader.width = canvas.width;
    reader.height = canvas.height;
    const readerCtx = reader.getContext("2d", { willReadFrequently: true });
    readerCtx.imageSmoothingEnabled = false;
    readerCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = readerCtx.getImageData(0, 0, canvas.width, canvas.height).data;
    const regionAt = new Array(canvas.width * canvas.height).fill("");
    const lists = new Map();
    for (let pixel = 0; pixel < regionAt.length; pixel++) {
      const index = pixel * 4;
      if (data[index + 3] === 0) continue;
      const id = `${data[index]},${data[index + 1]},${data[index + 2]}`;
      regionAt[pixel] = id;
      if (!lists.has(id)) lists.set(id, []);
      lists.get(id).push(pixel);
    }
    state.regionAt = regionAt;
    state.regionPixels = new Map([...lists].map(([id, pixels]) => [id, new Uint32Array(pixels)]));
  }
  function hexRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  function buildColorLayer() {
    colorCtx.clearRect(0, 0, colorCanvas.width, colorCanvas.height);
    const layer = colorCtx.createImageData(canvas.width, canvas.height);
    Object.entries(state.colors).forEach(([id, color]) => {
      const pixels = state.regionPixels.get(id);
      if (!pixels) return;
      const [r, g, b] = hexRgb(color);
      pixels.forEach((pixel) => {
        const index = pixel * 4;
        layer.data[index] = r;
        layer.data[index + 1] = g;
        layer.data[index + 2] = b;
        layer.data[index + 3] = 255;
      });
    });
    colorCtx.putImageData(layer, 0, 0);
  }
  function buildHighlightLayer() {
    highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
    const pixels = state.regionPixels.get(state.hoveredRegion);
    if (!pixels) return;
    const layer = highlightCtx.createImageData(canvas.width, canvas.height);
    pixels.forEach((pixel) => {
      const index = pixel * 4;
      layer.data[index] = 255;
      layer.data[index + 1] = 238;
      layer.data[index + 2] = 145;
      layer.data[index + 3] = 78;
    });
    highlightCtx.putImageData(layer, 0, 0);
  }
  function render(includeHighlight = true) {
    if (!state.ready) return;
    buildColorLayer();
    if (includeHighlight) buildHighlightLayer();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(state.base, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = state.design.colorOpacity ?? 0.72;
    ctx.drawImage(colorCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (includeHighlight) ctx.drawImage(highlightCanvas, 0, 0);
    ctx.drawImage(state.outline, 0, 0, canvas.width, canvas.height);
  }
  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * canvas.width / rect.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * canvas.height / rect.height)))
    };
  }
  function regionFromEvent(event) {
    if (!state.ready) return "";
    const { x, y } = canvasPoint(event);
    return state.regionAt[y * canvas.width + x] || "";
  }
  function colorRegion(event) {
    const id = regionFromEvent(event);
    if (!id) {
      announce("هذه المساحة غير قابلة للتلوين. اختر جزءًا داخل النقشة.");
      return;
    }
    const previous = snapshot();
    if (state.eraser) delete state.colors[id];
    else state.colors[id] = state.selectedColor;
    if (snapshot() === previous) return;
    state.undo.push(previous);
    if (state.undo.length > 60) state.undo.shift();
    state.redo = [];
    state.hoveredRegion = id;
    setActionState();
    render();
    saveLocal();
    hint.classList.add("is-hidden");
    announce(state.eraser ? "عاد الجزء إلى لون الخشب الأصلي." : "تم تلوين المنطقة كاملة.");
  }
  function hoverRegion(event) {
    const id = regionFromEvent(event);
    if (id === state.hoveredRegion) return;
    state.hoveredRegion = id;
    canvas.classList.toggle("has-region", Boolean(id));
    render();
  }
  function applySnapshot(value) {
    try { state.colors = JSON.parse(value); } catch { state.colors = {}; }
    state.hoveredRegion = "";
    render();
    saveLocal();
    setActionState();
  }
  function undo() {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    applySnapshot(state.undo.pop());
    announce("تم التراجع.");
  }
  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    applySnapshot(state.redo.pop());
    announce("تمت الإعادة.");
  }
  function reset(confirmFirst = true) {
    if (confirmFirst && Object.keys(state.colors).length && !window.confirm("هل تريد بدء الرسمة من جديد؟")) return;
    if (Object.keys(state.colors).length) state.undo.push(snapshot());
    state.colors = {};
    state.redo = [];
    state.hoveredRegion = "";
    render();
    saveLocal();
    setActionState();
    announce("بدأت رسمة جديدة.");
  }
  function exportPng() {
    if (!state.ready) return;
    const previousHover = state.hoveredRegion;
    state.hoveredRegion = "";
    render(false);
    const exportCanvas = document.createElement("canvas");
    const scale = Math.max(1, Math.min(2, 2400 / canvas.width));
    exportCanvas.width = Math.round(canvas.width * scale);
    exportCanvas.height = Math.round(canvas.height * scale);
    const exportCtx = exportCanvas.getContext("2d");
    exportCtx.fillStyle = "#fff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";
    exportCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    state.hoveredRegion = previousHover;
    render();
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.download = `${state.design.id}-colored.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      announce("تم حفظ الرسمة كصورة PNG.");
    }, "image/png");
  }
  async function loadDesign(design) {
    state.ready = false;
    state.design = design;
    state.undo = [];
    state.redo = [];
    shell.setAttribute("aria-busy", "true");
    loading.hidden = false;
    modelName.textContent = design.name;
    try {
      const [base, regions, outline] = await Promise.all([
        loadImage(design.basePath), loadImage(design.regionsPath), loadImage(design.outlinePath)
      ]);
      if (base.naturalWidth !== regions.naturalWidth || base.naturalHeight !== regions.naturalHeight ||
          base.naturalWidth !== outline.naturalWidth || base.naturalHeight !== outline.naturalHeight) {
        throw new Error("Coloring model layers must have identical dimensions.");
      }
      state.base = base;
      state.outline = outline;
      canvas.width = colorCanvas.width = highlightCanvas.width = base.naturalWidth;
      canvas.height = colorCanvas.height = highlightCanvas.height = base.naturalHeight;
      readRegionMap(regions);
      restoreLocal();
      state.ready = true;
      render();
      setActionState();
      loading.hidden = true;
      shell.setAttribute("aria-busy", "false");
      announce(`جاهز — ${new Intl.NumberFormat("ar-EG").format(state.regionPixels.size)} منطقة مستقلة قابلة للتلوين.`);
    } catch (error) {
      loading.innerHTML = "<strong>تعذّر تحميل طبقات الميدالية.</strong>";
      announce("تحقق من ملفات base وregions وoutline.");
      console.error(error);
    }
  }
  function buildModels() {
    const target = document.querySelector("[data-models]");
    designs.forEach((design) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-card";
      button.innerHTML = `<img src="${design.basePath}" alt="" loading="lazy"><span>${design.name}</span>`;
      button.addEventListener("click", () => loadDesign(design));
      target.append(button);
    });
  }

  buildPalette();
  buildModels();
  canvas.addEventListener("click", colorRegion);
  canvas.addEventListener("pointermove", (event) => { if (event.pointerType === "mouse") hoverRegion(event); });
  canvas.addEventListener("pointerleave", () => { state.hoveredRegion = ""; canvas.classList.remove("has-region"); render(); });
  document.querySelector('[data-action="undo"]').addEventListener("click", undo);
  document.querySelector('[data-action="redo"]').addEventListener("click", redo);
  document.querySelector('[data-action="eraser"]').addEventListener("click", (event) => {
    state.eraser = !state.eraser;
    event.currentTarget.classList.toggle("is-active", state.eraser);
    canvas.classList.toggle("is-eraser", state.eraser);
    announce(state.eraser ? "الممحاة مفعّلة. اضغط منطقة لإعادة لون الخشب." : "تم إيقاف الممحاة.");
  });
  document.querySelector('[data-action="reset"]').addEventListener("click", () => reset(true));
  document.querySelector("[data-new-design]").addEventListener("click", () => reset(true));
  document.querySelector("[data-save]").addEventListener("click", () => { saveLocal(); exportPng(); });
  document.querySelector("[data-download]").addEventListener("click", exportPng);
  window.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if (event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  });
  selectColor(state.selectedColor);
  loadDesign(requestedDesign);
})();
