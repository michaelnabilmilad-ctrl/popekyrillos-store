export function normalizePaintColor(color) {
  const value = String(color || "").trim().toLowerCase();
  if (value === "#f7f6f6") return "#ffffff";
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${value.slice(1).split("").map((digit) => digit + digit).join("")}`;
  return "";
}

export function applyRegionPaint(selectedColors, targetIds, color, eraser = false) {
  const next = { ...(selectedColors || {}) };
  const paintColor = normalizePaintColor(color);
  (Array.isArray(targetIds) ? targetIds : []).forEach((targetId) => {
    if (eraser) delete next[targetId];
    else if (paintColor) next[targetId] = paintColor;
  });
  return next;
}

export const isWhitePaint = (color) => normalizePaintColor(color) === "#ffffff";

export function resolvePaintTargets(clickedId, groupingEnabled, paintTargets) {
  return groupingEnabled ? (paintTargets?.get(clickedId) || [clickedId]) : [clickedId];
}

export function designUrlWithModel(currentHref, modelId) {
  if (!/^yota-(0[1-9]|1[0-3])$/.test(String(modelId || ""))) {
    throw new TypeError(`Invalid Yota coloring design ID: ${modelId || "empty"}`);
  }
  const url = new URL(currentHref, "https://popekyrillos.store");
  url.searchParams.set("design", String(modelId));
  url.searchParams.delete("product");
  return `${url.pathname}${url.search}${url.hash}`;
}

function normalizeSavedColors(selectedColors) {
  return Object.fromEntries(Object.entries(selectedColors || {}).flatMap(([regionId, color]) => {
    const normalized = normalizePaintColor(color);
    return regionId && normalized ? [[regionId, normalized]] : [];
  }));
}

(() => {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const designs = (Array.isArray(window.COLORING_DESIGNS) ? window.COLORING_DESIGNS : [])
    .filter((design) => design.enabled !== false);
  const canvas = document.querySelector("[data-coloring-canvas]");
  if (!canvas || !designs.length) return;
  const coloringParams = new URLSearchParams(window.location.search);
  const defaultDesign = designs.find((design) => design.id === "yota-01");
  const requestedDesign = designs.find((design) => design.id === coloringParams.get("design"))
    || designs.find((design) => design.productId === coloringParams.get("product"))
    || defaultDesign;
  if (!requestedDesign) return;

  const ctx = canvas.getContext("2d");
  const colorCanvas = document.createElement("canvas");
  const colorCtx = colorCanvas.getContext("2d");
  const whiteCanvas = document.createElement("canvas");
  const whiteCtx = whiteCanvas.getContext("2d");
  const solidWhiteCanvas = document.createElement("canvas");
  const solidWhiteCtx = solidWhiteCanvas.getContext("2d");
  const highlightCanvas = document.createElement("canvas");
  const highlightCtx = highlightCanvas.getContext("2d");
  const loading = document.querySelector("[data-loading]");
  const shell = document.querySelector("[data-canvas-shell]");
  const status = document.querySelector("[data-status]");
  const hint = document.querySelector("[data-touch-hint]");
  const modelName = document.querySelector("#current-model-name");
  const loadedModelId = document.querySelector("[data-loaded-model-id]");
  const symmetry = document.querySelector("[data-coloring-symmetry]");
  const selectedPreview = document.querySelector("[data-selected-preview]");
  const storagePrefix = "pope-kyrillos-coloring:";
  const palette = (window.YOTA_COLORS || [])
    .filter((color) => color.available !== false)
    .map((color) => [color.name, color.hex, color]);
  const state = {
    design: requestedDesign, base: null, basePixels: null, outline: null, regionPixels: new Map(), regionAt: null,
    selectedColors: {}, selectedColor: normalizePaintColor(palette[0][1]), eraser: false, undo: [], redo: [],
    hoveredRegion: "", paintTargets: new Map(), solidWhiteRegionKeys: new Set(), ready: false, loadRequest: 0
  };

  const announce = (message) => { status.textContent = message; };
  const storageKey = () => `${storagePrefix}${state.design.id}${state.design.storageVersion ? `:${state.design.storageVersion}` : ""}`;
  const snapshot = () => JSON.stringify(state.selectedColors);
  const absoluteAssetUrl = (src) => new URL(src, window.location.href).href;
  const assetError = (design, kind, src, detail = "") => {
    const url = absoluteAssetUrl(src);
    const error = new Error(`[Yota coloring] model=${design.id} asset=${kind} url=${url}${detail ? ` ${detail}` : ""}`);
    console.error(error.message);
    return error;
  };
  const loadImage = (design, kind, src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(assetError(design, kind, src));
    image.src = src;
  });
  const loadJson = async (design, kind, src) => {
    let response;
    try {
      response = await fetch(src);
    } catch (error) {
      throw assetError(design, kind, src, `network=${error?.message || "failed"}`);
    }
    if (!response.ok) throw assetError(design, kind, src, `status=${response.status}`);
    try {
      return await response.json();
    } catch (error) {
      throw assetError(design, kind, src, `json=${error?.message || "invalid"}`);
    }
  };

  function setActionState() {
    document.querySelector('[data-action="undo"]').disabled = !state.undo.length;
    document.querySelector('[data-action="redo"]').disabled = !state.redo.length;
  }
  function saveLocal(showMessage = false) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        modelId: state.design.id, selectedColors: { ...state.selectedColors }, savedAt: new Date().toISOString()
      }));
      if (showMessage) announce("تم حفظ التصميم على هذا الجهاز.");
    } catch { announce("تعذّر الحفظ على هذا الجهاز."); }
  }
  function restoreLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      if (saved.modelId && saved.modelId !== state.design.id) {
        console.warn(`[Yota coloring] ignored saved state for ${saved.modelId}; selected=${state.design.id}`);
        state.selectedColors = {};
        return;
      }
      const selectedColors = saved.selectedColors ?? saved.coloredParts;
      state.selectedColors = normalizeSavedColors(Array.isArray(selectedColors)
        ? Object.fromEntries(selectedColors.flatMap((part) => part?.regionId && part?.colorHex ? [[part.regionId, part.colorHex]] : []))
        : selectedColors && typeof selectedColors === "object" ? selectedColors : {});
    } catch { state.selectedColors = {}; }
  }
  function buildPalette() {
    const target = document.querySelector("[data-palette]");
    palette.forEach(([name, color, metadata], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-swatch";
      button.style.background = color;
      button.dataset.color = color;
      button.dataset.light = isWhitePaint(color) || normalizePaintColor(color) === "#fec105";
      if (metadata?.metallic) button.style.background = `linear-gradient(135deg,${metadata.highlight},${metadata.hex},${metadata.shadow})`;
      button.setAttribute("aria-label", name);
      button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
      button.addEventListener("click", () => selectColor(color));
      target.append(button);
    });
  }
  function selectColor(color) {
    state.selectedColor = normalizePaintColor(color);
    state.eraser = false;
    selectedPreview.style.background = color;
    canvas.classList.remove("is-eraser");
    document.querySelector('[data-action="eraser"]').classList.remove("is-active");
    document.querySelectorAll(".color-swatch").forEach((button) => {
      button.setAttribute("aria-pressed", normalizePaintColor(button.dataset.color) === state.selectedColor ? "true" : "false");
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
  function paintedWoodRgb(rgb, pixel) {
    const effect = state.design.woodPaintEffect;
    const index = pixel * 4;
    const baseR = state.basePixels[index];
    const baseG = state.basePixels[index + 1];
    const baseB = state.basePixels[index + 2];
    const luminance = 0.2126 * baseR + 0.7152 * baseG + 0.0722 * baseB;
    const strength = effect.strength ?? 0.88;
    const textureAmount = effect.textureAmount ?? 0.16;
    const brightness = 1 + ((luminance - 178) / 255) * textureAmount;
    return rgb.map((channel) => Math.max(0, Math.min(255, Math.round(
      strength * Math.min(255, channel * brightness) + (1 - strength) * luminance
    ))));
  }
  function paintedWoodEdgeAlpha(id, pixel) {
    const effect = state.design.woodPaintEffect;
    if (!effect?.smoothEdges) return 255;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    let matchingNeighbors = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY++) for (let offsetX = -1; offsetX <= 1; offsetX++) {
      if (!offsetX && !offsetY) continue;
      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (neighborX >= 0 && neighborY >= 0 && neighborX < canvas.width && neighborY < canvas.height &&
          state.regionAt[neighborY * canvas.width + neighborX] === id) matchingNeighbors++;
    }
    return matchingNeighbors === 8 ? 255 : Math.round((effect.edgeAlpha ?? 0.92) * 255 + matchingNeighbors / 8 * 20);
  }
  function buildColorLayer() {
    colorCtx.clearRect(0, 0, colorCanvas.width, colorCanvas.height);
    whiteCtx.clearRect(0, 0, whiteCanvas.width, whiteCanvas.height);
    solidWhiteCtx.clearRect(0, 0, solidWhiteCanvas.width, solidWhiteCanvas.height);
    const layer = colorCtx.createImageData(canvas.width, canvas.height);
    const whiteLayer = whiteCtx.createImageData(canvas.width, canvas.height);
    const solidWhiteLayer = solidWhiteCtx.createImageData(canvas.width, canvas.height);
    Object.entries(state.selectedColors).forEach(([id, color]) => {
      const pixels = state.regionPixels.get(id);
      if (!pixels) return;
      const normalizedColor = normalizePaintColor(color);
      if (!normalizedColor) return;
      const targetLayer = state.design.woodPaintEffect ? layer : isWhitePaint(normalizedColor)
        ? (state.solidWhiteRegionKeys.has(id) ? solidWhiteLayer : whiteLayer)
        : layer;
      const rgb = hexRgb(normalizedColor);
      pixels.forEach((pixel) => {
        const index = pixel * 4;
        const [r, g, b] = state.design.woodPaintEffect ? paintedWoodRgb(rgb, pixel) : rgb;
        targetLayer.data[index] = r;
        targetLayer.data[index + 1] = g;
        targetLayer.data[index + 2] = b;
        targetLayer.data[index + 3] = paintedWoodEdgeAlpha(id, pixel);
      });
    });
    colorCtx.putImageData(layer, 0, 0);
    whiteCtx.putImageData(whiteLayer, 0, 0);
    solidWhiteCtx.putImageData(solidWhiteLayer, 0, 0);
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
    if (state.design.woodPaintEffect) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(colorCanvas, 0, 0);
    } else {
    ctx.globalAlpha = state.design.whiteColorOpacity ?? 0.9;
    ctx.drawImage(whiteCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(solidWhiteCanvas, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = state.design.colorOpacity ?? 0.72;
    ctx.drawImage(colorCanvas, 0, 0);
    }
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
    const targets = resolvePaintTargets(id, Boolean(symmetry?.checked), state.paintTargets);
    state.selectedColors = applyRegionPaint(state.selectedColors, targets, state.selectedColor, state.eraser);
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
    try { state.selectedColors = normalizeSavedColors(JSON.parse(value)); } catch { state.selectedColors = {}; }
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
    if (confirmFirst && Object.keys(state.selectedColors).length && !window.confirm("هل تريد بدء الرسمة من جديد؟")) return;
    if (Object.keys(state.selectedColors).length) state.undo.push(snapshot());
    state.selectedColors = {};
    if (symmetry) symmetry.checked = false;
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
  async function loadDesign(design, historyMode = "push") {
    const requestId = ++state.loadRequest;
    state.ready = false;
    state.design = design;
    state.base = null;
    state.basePixels = null;
    state.outline = null;
    state.regionAt = null;
    state.regionPixels = new Map();
    state.paintTargets = new Map();
    state.solidWhiteRegionKeys = new Set();
    state.selectedColors = {};
    if (symmetry) symmetry.checked = false;
    state.hoveredRegion = "";
    state.undo = [];
    state.redo = [];
    shell.setAttribute("aria-busy", "true");
    loading.hidden = false;
    loadedModelId.dataset.loadedColoringModelId = "";
    try {
      const [base, regions, outline, regionData, overrides] = await Promise.all([
        loadImage(design, "base", design.basePath),
        loadImage(design, "mask", design.regionsPath),
        loadImage(design, "outline", design.outlinePath),
        loadJson(design, "config", design.regionsDataPath),
        design.regionOverridesPath
          ? loadJson(design, "region-overrides", design.regionOverridesPath)
          : Promise.resolve({ logicalShapes: {}, similarShapeGroups: {} })
      ]);
      if (requestId !== state.loadRequest) return;
      if (String(regionData.modelId || "") !== design.id) {
        throw new Error(`Coloring model mismatch: selected=${design.id}, loaded=${regionData.modelId || "missing"}`);
      }
      if (design.regionOverridesPath && String(overrides.modelId || "") !== design.id) {
        throw new Error(`Coloring overrides mismatch: selected=${design.id}, loaded=${overrides.modelId || "missing"}`);
      }
      if (base.naturalWidth !== regions.naturalWidth || base.naturalHeight !== regions.naturalHeight ||
          base.naturalWidth !== outline.naturalWidth || base.naturalHeight !== outline.naturalHeight) {
        throw new Error("Coloring model layers must have identical dimensions.");
      }
      state.base = base;
      state.outline = outline;
      canvas.width = colorCanvas.width = whiteCanvas.width = solidWhiteCanvas.width = highlightCanvas.width = base.naturalWidth;
      canvas.height = colorCanvas.height = whiteCanvas.height = solidWhiteCanvas.height = highlightCanvas.height = base.naturalHeight;
      const baseReader = document.createElement("canvas");
      baseReader.width = canvas.width;
      baseReader.height = canvas.height;
      const baseReaderCtx = baseReader.getContext("2d", { willReadFrequently: true });
      baseReaderCtx.drawImage(base, 0, 0, canvas.width, canvas.height);
      state.basePixels = baseReaderCtx.getImageData(0, 0, canvas.width, canvas.height).data;
      readRegionMap(regions);
      const colorKeyByRawId = new Map((regionData.regions || []).map((region) => [
        region.id || region.regionId,
        (region.maskColor || []).join(",")
      ]));
      state.solidWhiteRegionKeys = new Set((design.solidWhiteRegionIds || [])
        .map((regionId) => colorKeyByRawId.get(regionId))
        .filter(Boolean));
      const rawIdsByLogical = new Map(Object.entries(overrides.logicalShapes || {}));
      const logicalByRawId = new Map([...rawIdsByLogical].flatMap(([logicalId, rawIds]) =>
        (Array.isArray(rawIds) ? rawIds : []).map((rawId) => [rawId, logicalId])
      ));
      const groupByLogical = new Map(Object.entries(overrides.similarShapeGroups || {}).flatMap(([groupId, logicalIds]) =>
        (Array.isArray(logicalIds) ? logicalIds : []).map((logicalId) => [logicalId, groupId])
      ));
      colorKeyByRawId.forEach((colorKey, rawId) => {
        const logicalId = logicalByRawId.get(rawId) || rawId;
        const groupId = groupByLogical.get(logicalId);
        const logicalTargets = groupId ? overrides.similarShapeGroups[groupId] : [logicalId];
        const rawTargets = logicalTargets.flatMap((targetLogicalId) => rawIdsByLogical.get(targetLogicalId) || [targetLogicalId]);
        state.paintTargets.set(colorKey, rawTargets.map((targetRawId) => colorKeyByRawId.get(targetRawId)).filter(Boolean));
      });
      restoreLocal();
      state.ready = true;
      modelName.textContent = design.name;
      loadedModelId.textContent = `ID: ${design.id}`;
      loadedModelId.dataset.loadedColoringModelId = design.id;
      if (historyMode && window.location.search !== new URL(designUrlWithModel(window.location.href, design.id), window.location.origin).search) {
        window.history[historyMode === "replace" ? "replaceState" : "pushState"](
          { coloringModelId: design.id }, "", designUrlWithModel(window.location.href, design.id)
        );
      }
      render();
      setActionState();
      loading.hidden = true;
      shell.setAttribute("aria-busy", "false");
      announce(`جاهز — ${new Intl.NumberFormat("ar-EG").format(state.regionPixels.size)} منطقة مستقلة قابلة للتلوين.`);
    } catch (error) {
      loading.innerHTML = "<strong>تعذّر تحميل طبقات الميدالية.</strong>";
      announce("تحقق من ملفات base وregions وoutline.");
      console.error(`[Yota coloring] failed model=${design.id}`, error);
    }
  }
  function buildModels() {
    const target = document.querySelector("[data-models]");
    designs.forEach((design) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-card";
      button.dataset.coloringModelId = design.id;
      button.innerHTML = `<img src="${design.thumbnailPath || design.basePath}" alt="" loading="lazy"><span>${design.name}</span>`;
      button.addEventListener("click", () => loadDesign(design, "push"));
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
  window.addEventListener("popstate", () => {
    const modelId = new URLSearchParams(window.location.search).get("design");
    const design = designs.find((candidate) => candidate.id === modelId) || defaultDesign;
    if (!design) return;
    if (design.id !== modelId) {
      window.history.replaceState({ coloringModelId: design.id }, "", designUrlWithModel(window.location.href, design.id));
    }
    if (design.id !== state.design.id) loadDesign(design, null);
  });
  selectColor(state.selectedColor);
  loadDesign(requestedDesign, "replace");
})();
