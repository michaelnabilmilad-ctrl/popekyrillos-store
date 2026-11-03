// Admin product editor: "الكتابة على الصليب" settings for one product (product.engraving).
// Self-contained: admin.js only announces each editor render (admin:product-editor-render).
// Edits stay a draft with a live preview until "اعتماد" copies them into the product;
// the existing «حفظ ونشر» button then publishes them like any other product field.
(function () {
  "use strict";
  const E = window.CrossEngraving;
  if (!E) return;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SAMPLES = { ar: "القمص يوحنا مرقس", en: "Fr. John Mark", cop: "ⲒⲰⲀⲚⲚⲎⲤ ⲘⲀⲢⲔⲞⲤ" };
  const LANG_LABEL = { ar: "العربية", en: "English", cop: "القبطية" };
  const SLIDERS = [
    ["x", "المكان أفقيًا", 0, 1, 0.0005], ["y", "المكان رأسيًا", 0, 1, 0.0005],
    ["len", "طول منطقة الكتابة", 0.02, 0.95, 0.001], ["thick", "عرض منطقة الكتابة", 0.005, 0.4, 0.0005],
    ["angle", "اتجاه الكتابة (درجة)", -180, 180, 0.5],
    ["fontMax", "أكبر حجم للخط (من عرض المنطقة)", 0.2, 0.95, 0.01], ["fontMin", "أصغر حجم مسموح", 0.15, 0.9, 0.01],
    ["weight", "سُمك إضافي للحروف", 0, 0.12, 0.005], ["padding", "هامش أمان في الطرفين", 0, 0.3, 0.005],
    ["curve", "استدارة اليد (للأيدي المستديرة)", 0, 1.3, 0.05]
  ];

  // One-click starting points from the owner's decisions (2026-11-03). They only fill the
  // draft: every value stays editable below and nothing applies until «اعتماد».
  const TEMPLATES = {
    black: { label: "صليب أسود: كتابة بيضاء، عربي فقط", languages: ["ar"], zone: { color: "#ffffff", finish: "ink" }, copticFont: "noto", freeNote: true },
    ivory: { label: "بديل عاج: كتابة سوداء، عربي وإنجليزي وقبطي", languages: ["ar", "en", "cop"], zone: { color: "#18130e", finish: "ink" }, copticFont: "athanasius", freeNote: true }
  };

  let ctx = null; // { product, markDirty, assetUrl, draft, section }
  let ticket = 0, drag = null;

  function ensureSection() {
    const form = document.querySelector("[data-editor]");
    if (!form) return null;
    let section = form.querySelector('[data-editor-section="engraving"]');
    if (section) return section;
    const tabs = form.querySelector(".editor-tabs");
    if (tabs && !tabs.querySelector('[data-editor-tab="engraving"]')) {
      const tab = document.createElement("button");
      tab.type = "button"; tab.dataset.editorTab = "engraving"; tab.textContent = "الكتابة على الصليب";
      tab.addEventListener("click", () => {
        tabs.querySelectorAll("[data-editor-tab]").forEach((b) => b.classList.toggle("is-active", b === tab));
        form.querySelectorAll("[data-editor-section]").forEach((s) => { s.open = s === section; });
        draw();
      });
      tabs.append(tab);
    }
    section = document.createElement("details");
    section.className = "form-section editor-accordion ae";
    section.dataset.editorSection = "engraving";
    section.innerHTML = `<summary><span>الكتابة على الصليب</span><small>اسم الكاهن: التفعيل ومكان الكتابة وحجم الخط واللون</small></summary><div class="accordion-body" data-ae-body></div>`;
    form.querySelector('[data-editor-section="advanced"]')?.before(section) || form.append(section);
    // Draft controls must not mark the product as edited; only "اعتماد" does.
    ["input", "change"].forEach((type) => section.addEventListener(type, (e) => { e.stopPropagation(); onControl(e); }));
    section.addEventListener("click", onClick);
    section.addEventListener("toggle", () => { if (section.open) draw(); });
    injectStyle();
    return section;
  }

  function injectStyle() {
    if (document.getElementById("ae-style")) return;
    const st = document.createElement("style");
    st.id = "ae-style";
    st.textContent = `.ae .ae-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(260px,1fr);gap:16px;align-items:start}
.ae .ae-canvas{position:relative;border:1px solid #ded8cb;border-radius:8px;overflow:hidden;background:#fff;touch-action:none}
.ae .ae-canvas canvas{display:block;width:100%;height:auto;cursor:move}
.ae .ae-ctl{display:grid;grid-template-columns:150px 1fr 64px;gap:8px;align-items:center;font-size:13px;margin:0 0 6px}
.ae .ae-ctl output{font-family:monospace;font-size:12px;direction:ltr;text-align:left}
.ae .ae-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.ae .ae-thumbs{display:flex;gap:6px;flex-wrap:wrap}.ae .ae-thumbs button{width:58px;height:58px;padding:0;border:2px solid #ded8cb;border-radius:6px;background:#fff;overflow:hidden;cursor:pointer}
.ae .ae-thumbs button[aria-pressed=true]{border-color:#0c6b68}.ae .ae-thumbs img{width:100%;height:100%;object-fit:cover}
.ae .ae-strips{display:grid;gap:8px;margin-top:10px}.ae .ae-strips figure{margin:0;border:1px solid #ded8cb;border-radius:8px;overflow:hidden;background:#f4efe4}
.ae .ae-strips canvas{display:block;width:100%;height:auto}.ae .ae-strips figcaption{font-size:12px;padding:4px 8px;background:#fff;display:flex;gap:6px;align-items:center}
.ae .ae-strips figcaption input{flex:1;min-width:0;font:inherit;font-size:13px;padding:3px 6px;border:1px solid #ded8cb;border-radius:6px}
.ae .ae-ok{color:#0c6b68}.ae .ae-bad{color:#85243c;font-weight:700}
.ae .ae-status{margin:8px 0 0;font-size:13px;font-weight:700}.ae .ae-status.is-dirty{color:#85243c}.ae .ae-status.is-clean{color:#0c6b68}
.ae .ae-toggle{display:flex;gap:8px;align-items:center;font-weight:800;font-size:15px}
.ae .ae-toggle input{width:20px;height:20px}
@media (max-width:820px){.ae .ae-grid{grid-template-columns:1fr}.ae .ae-ctl{grid-template-columns:1fr 1.4fr 56px}}`;
    document.head.append(st);
  }

  // Photos to choose from: the product's own photos plus any engraving-only preview photo
  // uploaded here (kept apart from the product photos, which are never changed).
  function images(product, extra = []) { return [...new Set([...(product.images || []), product.image, product.engraving?.previewImage, ...extra].filter(Boolean))]; }

  function defaultsFor(product) {
    const s = E.normalizeSettings({ ...(product.engraving || {}) });
    s.enabled = s.requested; delete s.requested; delete s.missing;
    // No photo is picked for the admin: the shop chooses (or uploads) the one that suits.
    return s;
  }

  function onRender(event) {
    const { product, markDirty, assetUrl } = event.detail || {};
    const section = ensureSection();
    if (!section || !product) return;
    // Re-renders of the same product keep the open draft.
    if (ctx && ctx.product === product && ctx.section === section) return;
    ctx = { product, markDirty, assetUrl: assetUrl || ((v) => v), draft: defaultsFor(product), section, tests: { ...SAMPLES } };
    build();
  }

  function build() {
    const { draft, product } = ctx;
    const z = draft.zone;
    const body = ctx.section.querySelector("[data-ae-body]");
    const imgs = images(product, ctx.uploaded || []);
    body.innerHTML = `
      <label class="ae-toggle"><input type="checkbox" data-ae="enabled" ${draft.enabled ? "checked" : ""}> السماح بالكتابة على هذا المنتج</label>
      <p class="hint">لما يتفعّل، صفحة المنتج تعرض للعميل اختيار «أضف اسم الكاهن» مع معاينة على الصورة اللي تختارها هنا. التعديلات هنا مسودة لحد ما تضغط «اعتماد».</p>
      <div class="ae-row"><strong>قالب جاهز:</strong>${Object.entries(TEMPLATES).map(([k, t]) => `<button class="button ghost" type="button" data-ae-template="${k}">${esc(t.label)}</button>`).join("")}<small class="hint">بيملأ اللون واللغات والخط بس؛ كل حاجة تفضل قابلة للتعديل.</small></div>
      <div class="ae-row"><strong>صورة المعاينة:</strong><div class="ae-thumbs">${imgs.map((src) => `<button type="button" data-ae-image="${esc(src)}" aria-pressed="${src === draft.previewImage}" title="${esc(src)}"><img src="${esc(ctx.assetUrl(src))}" alt=""></button>`).join("")}</div>
        <label class="button ghost ae-upload">رفع صورة معاينة خاصة<input type="file" accept="image/*" data-ae-upload hidden></label><small class="hint" data-ae-upload-status></small></div>
      <p class="hint">ممكن تكون مختلفة عن صور المنتج، ومش بتتضاف لصور المنتج ولا بتغيّرها. الأفضل صورة للصليب من فوق، على خلفية فاتحة، ومن غير علامة مائية على اليد.</p>
      <label class="ae-row"><input type="checkbox" data-ae="photoConfirmed" ${draft.photoConfirmed ? "checked" : ""}> <b>الصورة حقيقية لنفس المنتج، ومكان الكتابة واضح، ومفيش علامة مائية فوق مكان الاسم</b></label>
      <div class="ae-grid">
        <div>
          <div class="ae-canvas"><canvas data-ae-full width="900" height="900" aria-label="اسحب لتحريك منطقة الكتابة"></canvas></div>
          <p class="hint">اسحب المستطيل المنقط لتحريك مكان الكتابة.</p>
          <div class="ae-strips" data-ae-strips>${["ar", "en", "cop"].map((l) => `<figure><canvas width="900" height="300" data-ae-strip="${l}"></canvas><figcaption><b>${LANG_LABEL[l]}</b><input data-ae-test="${l}" value="${esc(ctx.tests[l])}" dir="${l === "ar" ? "rtl" : "ltr"}" aria-label="اسم تجربة ${LANG_LABEL[l]}"><span data-ae-fit="${l}"></span></figcaption></figure>`).join("")}</div>
        </div>
        <div>
          ${SLIDERS.map(([k, label, min, max, step]) => `<label class="ae-ctl"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${z[k]}" data-ae-z="${k}"><output data-ae-o="${k}">${fmt(z[k])}</output></label>`).join("")}
          <label class="ae-ctl"><span>شكل يد الصليب</span><select data-ae-s="surface"><option value="flat">مسطحة</option><option value="round">مستديرة</option></select><span></span></label>
          <label class="ae-ctl"><span>طريقة التنفيذ</span><select data-ae-s="finish">${Object.entries(E.FINISHES).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join("")}</select><span></span></label>
          <div class="ae-ctl"><span>لون الكتابة <b class="ae-bad">*</b></span><select data-ae-color aria-label="لون الكتابة"><option value="">— اختار اللون —</option>${E.COLOR_PRESETS.map((c) => `<option value="${c.value}">${esc(c.label)}</option>`).join("")}<option value="custom">لون آخر…</option></select><input type="color" data-ae-color-custom value="${z.color || "#18130e"}" aria-label="لون مخصص" ${E.COLOR_PRESETS.some((c) => c.value === z.color) || !z.color ? "hidden" : ""}></div>
          <p class="hint">مفيش لون افتراضي: لازم تختار لون الكتابة لكل منتج. لحد ما يتحدد، المعاينة هنا بالرمادي ومش هتظهر للعملاء.</p>
          <div class="ae-row"><span>أقصى عدد حروف:</span>${["ar", "en", "cop"].map((l) => `<label>${LANG_LABEL[l]} <input type="number" min="1" max="60" value="${z.maxChars[l]}" data-ae-max="${l}" style="width:60px"></label>`).join("")}<button class="button ghost" type="button" data-ae-act="measure">قياس من مساحة الكتابة</button></div>
          <p class="hint" data-ae-measure>القياس بيجرّب أسماء عريضة بالخط المختار على الصورة دي، ويحط أطول عدد حروف بيفضل واضح بأصغر حجم مسموح. وكل اسم بيتقاس تاني وقت ما العميل يكتبه.</p>
          <div class="ae-row"><span>اللغات المتاحة:</span>${["ar", "en", "cop"].map((l) => `<label><input type="checkbox" data-ae-lang="${l}" ${draft.languages.includes(l) ? "checked" : ""}> ${LANG_LABEL[l]}</label>`).join("")}</div>
          <label class="ae-ctl"><span>الخط القبطي</span><select data-ae-coptic><option value="noto">Noto Sans Coptic (مرخص مجانًا)</option><option value="athanasius">CS New Athanasius</option></select><span></span></label>
          <p class="hint" data-ae-coptic-note></p>
          <label class="ae-row"><input type="checkbox" data-ae="freeNote" ${draft.freeNote ? "checked" : ""}> إظهار «الكتابة مجانية» للعميل</label>
          <label class="ae-row"><input type="checkbox" data-ae="confirmed" ${z.confirmed ? "checked" : ""}> <b>راجعت مكان الكتابة ومقاسها على صورة المعاينة</b></label>
          <p class="hint">أي تحريك للمنطقة أو تغيير للصورة بيلغي المراجعة، عشان تتأكد منها تاني.</p>
          <div class="ae-row"><button class="button" type="button" data-ae-act="apply">اعتماد الإعدادات للمنتج</button><button class="button ghost" type="button" data-ae-act="reset">تراجع عن التعديلات</button></div>
          <p class="ae-status" data-ae-status></p>
        </div>
      </div>`;
    body.querySelector('[data-ae-s="surface"]').value = z.surface;
    body.querySelector("[data-ae-coptic]").value = draft.copticFont;
    body.querySelector('[data-ae-s="finish"]').value = z.finish;
    body.querySelector("[data-ae-color]").value = !z.color ? "" : (E.COLOR_PRESETS.some((c) => c.value === z.color) ? z.color : "custom");
    const canvas = body.querySelector("[data-ae-full]");
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, zx: ctx.draft.zone.x, zy: ctx.draft.zone.y }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      ctx.draft.zone.x = clamp(drag.zx + (e.clientX - drag.x) / r.width, 0, 1);
      ctx.draft.zone.y = clamp(drag.zy + (e.clientY - drag.y) / r.height, 0, 1);
      ctx.draft.zone.confirmed = false; syncConfirm();
      syncSliders(); changed();
    });
    canvas.addEventListener("pointerup", () => { drag = null; });
    status();
    draw();
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (v) => (Math.round(Number(v) * 10000) / 10000).toString();
  function syncSliders() {
    ctx.section.querySelectorAll("[data-ae-z]").forEach((s) => { s.value = ctx.draft.zone[s.dataset.aeZ]; ctx.section.querySelector(`[data-ae-o="${s.dataset.aeZ}"]`).textContent = fmt(ctx.draft.zone[s.dataset.aeZ]); });
  }
  function onControl(e) {
    if (!ctx) return;
    const t = e.target, z = ctx.draft.zone;
    if (t.dataset.ae === "enabled") ctx.draft.enabled = t.checked;
    else if (t.dataset.ae === "freeNote") ctx.draft.freeNote = t.checked;
    else if (t.dataset.ae === "photoConfirmed") ctx.draft.photoConfirmed = t.checked;
    else if (t.matches("[data-ae-upload]")) { uploadPreview(t.files?.[0]); t.value = ""; return; }
    else if (t.matches("[data-ae-coptic]")) ctx.draft.copticFont = t.value;
    else if (t.dataset.ae === "confirmed") z.confirmed = t.checked;
    else if (t.matches("[data-ae-color]")) {
      const custom = ctx.section.querySelector("[data-ae-color-custom]");
      custom.hidden = t.value !== "custom";
      z.color = t.value === "custom" ? custom.value : t.value;
    }
    else if (t.matches("[data-ae-color-custom]")) z.color = t.value;
    else if (t.dataset.aeZ) {
      z[t.dataset.aeZ] = Number(t.value); ctx.section.querySelector(`[data-ae-o="${t.dataset.aeZ}"]`).textContent = fmt(t.value);
      if (!["fontMax", "fontMin", "weight"].includes(t.dataset.aeZ)) { z.confirmed = false; syncConfirm(); }
    }
    else if (t.dataset.aeS) z[t.dataset.aeS] = t.value;
    else if (t.dataset.aeMax) z.maxChars[t.dataset.aeMax] = Number(t.value);
    else if (t.dataset.aeLang) ctx.draft.languages = ["ar", "en", "cop"].filter((l) => ctx.section.querySelector(`[data-ae-lang="${l}"]`).checked);
    else if (t.dataset.aeTest) { ctx.tests[t.dataset.aeTest] = t.value; draw(); return; }
    else return;
    changed();
  }
  function onClick(e) {
    if (!ctx) return;
    const img = e.target.closest("[data-ae-image]");
    if (img) {
      ctx.draft.previewImage = img.dataset.aeImage;
      ctx.draft.zone.confirmed = false; syncConfirm();
      ctx.draft.photoConfirmed = false;
      const pc = ctx.section.querySelector('[data-ae="photoConfirmed"]'); if (pc) pc.checked = false;
      ctx.section.querySelectorAll("[data-ae-image]").forEach((b) => b.setAttribute("aria-pressed", String(b === img)));
      changed();
      return;
    }
    const tpl = e.target.closest("[data-ae-template]");
    if (tpl) {
      const t = TEMPLATES[tpl.dataset.aeTemplate];
      Object.assign(ctx.draft.zone, t.zone);
      ctx.draft.languages = [...t.languages];
      ctx.draft.copticFont = t.copticFont;
      ctx.draft.freeNote = t.freeNote;
      build();
      return;
    }
    const act = e.target.closest("[data-ae-act]");
    if (!act) return;
    if (act.dataset.aeAct === "reset") { ctx.draft = defaultsFor(ctx.product); build(); return; }
    if (act.dataset.aeAct === "apply") apply();
    if (act.dataset.aeAct === "measure") measure();
  }

  function syncConfirm() { const c = ctx.section.querySelector('[data-ae="confirmed"]'); if (c) c.checked = ctx.draft.zone.confirmed === true; }
  const MISSING_LABEL = { previewImage: "صورة المعاينة", photo: "تأكيد إن صورة المعاينة مناسبة", color: "لون الكتابة", zone: "مراجعة مكان الكتابة" };
  function missingOf(s) {
    const m = [];
    if (!s.previewImage) m.push("previewImage");
    if (!s.photoConfirmed) m.push("photo");
    if (!s.zone.color) m.push("color");
    if (!s.zone.confirmed) m.push("zone");
    return m;
  }
  function cleanDraft() {
    const s = E.normalizeSettings(ctx.draft);
    s.enabled = ctx.draft.enabled === true; delete s.requested; delete s.missing;
    s.previewImage = ctx.draft.previewImage;
    if (!s.languages.length) s.languages = ["ar"];
    return s;
  }
  function same(a, b) { const strip = (s) => JSON.stringify({ ...s, version: 0 }); return strip(a) === strip(b); }
  function isDirty() { return !same(cleanDraft(), defaultsFor(ctx.product)) || (ctx.draft.enabled && !ctx.product.engraving); }
  function changed() { status(); draw(); }
  function status() {
    const node = ctx.section.querySelector("[data-ae-status]");
    if (!node) return;
    const dirty = isDirty();
    node.className = `ae-status ${dirty ? "is-dirty" : "is-clean"}`;
    const missing = missingOf(cleanDraft()).map((k) => MISSING_LABEL[k]);
    const need = ctx.draft.enabled && missing.length ? ` لسه ناقص: ${missing.join("، ")}.` : "";
    node.textContent = (dirty ? "فيه تعديلات لسه ما اتعتمدتش." : (ctx.product.engraving ? `الإعدادات المعتمدة (إصدار ${ctx.product.engraving.version || 1}). بعد الاعتماد اضغط «حفظ ونشر» عشان تظهر على الموقع.` : "الكتابة غير مفعلة لهذا المنتج.")) + need;
  }
  function apply() {
    const next = cleanDraft();
    const missing = missingOf(next);
    if (next.enabled && missing.length) { alertStatus(`مينفعش تفعيل الكتابة قبل تحديد: ${missing.map((k) => MISSING_LABEL[k]).join("، ")}.`); return; }
    if (next.zone.fontMin > next.zone.fontMax) { alertStatus("أصغر حجم للخط لازم يكون أقل من أكبر حجم."); return; }
    const prev = ctx.product.engraving ? E.normalizeSettings(ctx.product.engraving) : null;
    next.version = prev ? (same(next, prev) ? prev.version : prev.version + 1) : 1;
    ctx.product.engraving = next;
    ctx.draft = defaultsFor(ctx.product);
    ctx.markDirty?.();
    status();
  }
  async function measure() {
    const note = ctx.section.querySelector("[data-ae-measure]");
    if (!ctx.draft.previewImage) { note.textContent = "اختار صورة المعاينة الأول."; return; }
    note.textContent = "جاري القياس…";
    const zone = cleanDraft().zone;
    const legacy = ctx.draft.copticFont === "athanasius";
    const found = {};
    for (const lang of ctx.draft.languages) {
      await E.loadFont(lang, { legacy }).catch(() => {});
      try { found[lang] = await E.measureMaxChars({ imageSrc: ctx.assetUrl(ctx.draft.previewImage), zone, lang, legacy }); }
      catch (error) { note.textContent = `تعذر القياس: ${error?.message || error}`; return; }
      if (found[lang] > 0) {
        ctx.draft.zone.maxChars[lang] = found[lang];
        const input = ctx.section.querySelector(`[data-ae-max="${lang}"]`); if (input) input.value = found[lang];
      }
    }
    note.textContent = `نتيجة القياس: ${Object.entries(found).map(([l, n]) => `${LANG_LABEL[l]} ${n || "المساحة صغيرة جدًا"}`).join(" · ")}. تقدر تعدّلها يدويًا.`;
    note.dataset.measured = JSON.stringify(found);
    changed();
  }

  // Engraving-only preview photo: converted to WebP in the browser and stored through the same
  // upload the product photos use, as a new file. It is not added to the product's photos.
  async function uploadPreview(file) {
    const note = ctx.section.querySelector("[data-ae-upload-status]");
    if (!file || !file.type.startsWith("image/")) { note.textContent = "اختار ملف صورة."; return; }
    try {
      note.textContent = "جاري تجهيز الصورة…";
      const bitmap = await createImageBitmap(file);
      let base64 = "";
      for (const [side, quality] of [[1600, 0.9], [1400, 0.85], [1200, 0.8]]) {
        const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
        const c = document.createElement("canvas"); c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
        c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
        base64 = c.toDataURL("image/webp", quality).split(",")[1] || "";
        if (base64.length * 0.75 < 1.9 * 1024 * 1024) break;
      }
      note.textContent = "جاري الرفع…";
      const res = await fetch("/admin/api/upload-product-image", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: `engraving-preview-${file.name}`, productId: `engraving-${ctx.product.id}`, imageBase64: base64 }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.path) throw new Error(out.error || `HTTP ${res.status}`);
      ctx.uploaded = [...(ctx.uploaded || []), out.path];
      ctx.draft.previewImage = out.path;
      ctx.draft.photoConfirmed = false;
      ctx.draft.zone.confirmed = false;
      build();
      ctx.section.querySelector("[data-ae-upload-status]").textContent = "اترفعت. حدد مكان الكتابة عليها، وأكّد إنها مناسبة.";
    } catch (error) {
      note.textContent = `تعذر رفع الصورة: ${error.message}`;
    }
  }

  function alertStatus(msg) { const node = ctx.section.querySelector("[data-ae-status]"); node.className = "ae-status is-dirty"; node.textContent = msg; }

  async function draw() {
    if (!ctx || !ctx.section.open || !ctx.draft.previewImage) return;
    const my = ++ticket;
    const src = ctx.assetUrl(ctx.draft.previewImage);
    const zone = cleanDraft().zone;
    try {
      const legacy = ctx.draft.copticFont === "athanasius";
      const base = await E.render({ imageSrc: src, zone, text: ctx.tests.ar && ctx.draft.languages.includes("ar") ? ctx.tests.ar : "", lang: "ar" });
      if (my !== ticket) return;
      const full = ctx.section.querySelector("[data-ae-full]");
      full.getContext("2d").clearRect(0, 0, full.width, full.height);
      E.drawFull(full, base, { outline: true });
      for (const l of ["ar", "en", "cop"]) {
        await E.loadFont(l, { legacy }).catch(() => {});
        const text = ctx.tests[l] || "";
        const v = E.validateName(text, l, zone);
        const r = await E.render({ imageSrc: src, zone, text: v.ok || v.code === "length" ? v.name : "", lang: l, legacy });
        if (l === "cop") {
          const note = ctx.section.querySelector("[data-ae-coptic-note]");
          if (note) note.textContent = !legacy ? "" : (E.legacyReady.cop ? "المعاينة بخط CS New Athanasius." : "ملف CS New Athanasius المرخّص لسه مش مضاف للموقع، فالمعاينة والعملاء بيشوفوا Noto Sans Coptic لحد ما يتضاف.");
        }
        if (my !== ticket) return;
        E.drawZoom(ctx.section.querySelector(`[data-ae-strip="${l}"]`), r, { outline: true });
        const cap = ctx.section.querySelector(`[data-ae-fit="${l}"]`);
        if (!text) cap.textContent = "";
        else if (!v.ok) { cap.className = "ae-bad"; cap.textContent = v.message; }
        else if (r.fit && !r.fit.fits) { cap.className = "ae-bad"; cap.textContent = "أطول من المساحة"; }
        else { cap.className = "ae-ok"; cap.textContent = `مناسب · حجم الخط ${Math.round((r.fit?.ratio || 0) * 100)}%`; }
      }
    } catch (error) {
      const node = ctx.section.querySelector("[data-ae-status]");
      if (node) node.textContent = "تعذر تحميل صورة المعاينة.";
    }
  }

  document.addEventListener("admin:product-editor-render", onRender);
})();
