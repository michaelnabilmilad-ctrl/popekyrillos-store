// Product page: "write the priest's name on the cross" section.
// Loaded only for products whose admin settings have engraving.enabled = true.
// product-page.js mounts it and asks it for the cart details when "add to cart" is pressed.
(function () {
  "use strict";
  const E = window.CrossEngraving;
  if (!E) return;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LANG_LABEL = { ar: "العربية", en: "English", cop: "القبطية" };
  const PLACEHOLDER = { ar: "مثال: القمص يوحنا مرقس", en: "e.g. Fr. John Mark", cop: "ⲒⲰⲀⲚⲚⲎⲤ" };
  // Return terms follow the customer's choice (policies page, "الاسترجاع والاستبدال"):
  // made to order but not personalised = the normal 14 days; a written name = made to the
  // customer's own specification, so no change-of-mind return, while defects, a writing
  // mistake or a wrong item keep the customer's full rights.
  const RETURNS_LINK = `<a href="/policies#returns" target="_blank" rel="noopener">سياسة الاسترجاع</a>`;
  const RETURNS_NOTE = {
    none: `↩️ <b>بدون كتابة:</b> استرجاع أو استبدال خلال 14 يوم من الاستلام حسب ${RETURNS_LINK}.`,
    name: `↩️ <b>مع كتابة الاسم:</b> الصليب بيتعمل بالاسم اللي انت حددته، فمش بيترجع أو يتبدل لتغيير الرأي. لو فيه عيب تصنيع أو غلط في الكتابة أو وصلك مختلف عن طلبك، من حقك الاستبدال أو الاسترجاع. ${RETURNS_LINK}.`
  };
  const COPTIC_KEYS = ["Ⲁ","Ⲃ","Ⲅ","Ⲇ","Ⲉ","Ⲍ","Ⲏ","Ⲑ","Ⲓ","Ⲕ","Ⲗ","Ⲙ","Ⲛ","Ⲝ","Ⲟ","Ⲡ","Ⲣ","Ⲥ","Ⲧ","Ⲩ","Ⲫ","Ⲭ","Ⲯ","Ⲱ","Ϣ","Ϥ","Ϧ","Ϩ","Ϫ","Ϭ","Ϯ"];

  let host = null, settings = null, imageSrc = "", state = null, last = null, ticket = 0, idSeq = 0;

  function mount(slot, product, { assetUrl = (v) => v } = {}) {
    if (!slot) return false;
    settings = E.normalizeSettings(product?.engraving);
    // Only the watermarked copy made in admin is ever loaded for the preview (never a clean photo).
    const chosen = settings.previewImage;
    if (!settings.enabled || !E.isProtectedPreview(chosen)) { slot.remove(); return false; }
    imageSrc = assetUrl(chosen);
    host = slot;
    const uid = `pe${++idSeq}`;
    state = { mode: "none", lang: settings.languages[0] };
    const langs = settings.languages;
    host.className = "pe";
    host.innerHTML = `
      <div class="pe-head"><h2 id="${uid}-t">✍️ اكتب اسم أبونا على الصليب</h2>${settings.freeNote ? `<span class="pe-free">الكتابة مجانية</span>` : ""}</div>
      <p class="pe-made"><span aria-hidden="true">🛠️</span> يُصنع عند الطلب</p>
      <p class="pe-lead">نكتب الاسم على يد صليب اليد، وتشوف شكله على صورة نفس الصليب قبل ما تطلب.</p>
      <div class="pe-choice" role="radiogroup" aria-labelledby="${uid}-t">
        <label><input type="radio" name="${uid}-mode" value="none" checked><b>بدون كتابة</b><small>الصليب كما في الصور</small></label>
        <label><input type="radio" name="${uid}-mode" value="name"><b>أضف اسم الكاهن</b><small>مع معاينة مباشرة</small></label>
      </div>
      <p class="pe-returns" data-pe-returns aria-live="polite">${RETURNS_NOTE.none}</p>
      <div class="pe-body" data-pe-body hidden>
        ${langs.length > 1 ? `<fieldset class="pe-langs"><legend>لغة الكتابة</legend><div class="pe-pills">${langs.map((l, i) => `<label><input type="radio" name="${uid}-lang" value="${l}" ${i === 0 ? "checked" : ""}>${LANG_LABEL[l]}</label>`).join("")}</div></fieldset>` : ""}
        <div>
          <label class="pe-label" for="${uid}-name">اسم الكاهن كما سيُكتب بالظبط</label>
          <div class="pe-name"><input id="${uid}-name" data-pe-input autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60" enterkeyhint="done"><output data-pe-count></output></div>
        </div>
        <div data-pe-keys hidden><div class="pe-keys">${COPTIC_KEYS.map((c) => `<button type="button" data-pe-key="${c}">${c}</button>`).join("")}<button type="button" class="wide" data-pe-key=" ">مسافة</button><button type="button" class="wide" data-pe-key="&#x305;">خط علوي</button><button type="button" class="wide" data-pe-key="back">⌫ مسح</button></div></div>
        <p class="pe-err" data-pe-err role="alert"></p>
        <div class="pe-view" role="tablist" aria-label="طريقة العرض">
          <button type="button" role="tab" aria-selected="true" data-pe-view="zoom">تكبير مكان الكتابة</button>
          <button type="button" role="tab" aria-selected="false" data-pe-view="full">الصليب كامل</button>
        </div>
        <figure class="pe-figure" data-pe-figure="zoom"><canvas data-pe-zoom width="900" height="300" aria-label="معاينة الاسم على يد الصليب"></canvas></figure>
        <figure class="pe-figure" data-pe-figure="full" hidden><canvas data-pe-full width="900" height="900" aria-label="معاينة الاسم على الصليب كاملًا"></canvas></figure>
        <p class="pe-note">المعاينة تقريبية لتوضيح شكل الاسم ومكانه. الكتابة بتتنفذ يدويًا في المكتبة، وممكن يختلف حجم الخط ومكانه قليلًا حسب الصليب.</p>
        <p class="pe-summary" data-pe-summary></p>
        <label class="pe-confirm"><input type="checkbox" data-pe-confirm> راجعت الاسم وتهجئته، وموافق إنه يتكتب كما هو بالظبط، وعارف إن الصليب المكتوب عليه اسم مش بيترجع لتغيير الرأي.</label>
      </div>`;
    host.addEventListener("change", onChange);
    host.addEventListener("input", (e) => { if (e.target.matches("[data-pe-input]")) onName(); });
    host.addEventListener("click", onClick);
    syncLang();
    prefillFromLink(langs);
    return true;
  }

  // "#engrave=ar:<name>" (the admin's "show preview" link for an order) opens the preview
  // with that name filled in. The customer still has to confirm before anything is added.
  function prefillFromLink(langs) {
    let raw = "";
    try { raw = new URLSearchParams(String(location.hash || "").slice(1)).get("engrave") || ""; } catch { return; }
    const sep = raw.indexOf(":");
    if (sep < 0) return;
    const lang = raw.slice(0, sep), name = raw.slice(sep + 1);
    if (!name) return;
    if (langs.includes(lang)) { state.lang = lang; host.querySelectorAll('input[name$="-lang"]').forEach((i) => { i.checked = i.value === lang; }); syncLang(); }
    const radio = host.querySelector('input[name$="-mode"][value="name"]');
    radio.checked = true;
    state.mode = "name";
    $("[data-pe-body]").hidden = false;
    $("[data-pe-returns]").innerHTML = RETURNS_NOTE.name;
    $("[data-pe-input]").value = name;
    E.loadFont(state.lang, fontOpts()).then(onName, onName);
  }

  const $ = (s) => host.querySelector(s);
  const fontOpts = () => ({ legacy: settings.copticFont === "athanasius" });
  function onChange(e) {
    const t = e.target;
    if (t.name?.endsWith("-mode")) { state.mode = t.value; $("[data-pe-body]").hidden = state.mode !== "name"; $("[data-pe-returns]").innerHTML = RETURNS_NOTE[state.mode === "name" ? "name" : "none"]; if (state.mode === "name") { E.loadFont(state.lang, fontOpts()).then(draw, draw); setTimeout(() => $("[data-pe-input]").focus({ preventScroll: true }), 30); } }
    if (t.name?.endsWith("-lang")) { state.lang = t.value; syncLang(); unconfirm(); onName(); }
    if (t.matches("[data-pe-confirm]")) clearError();
  }
  function onClick(e) {
    const key = e.target.closest("[data-pe-key]");
    if (key) {
      const input = $("[data-pe-input]");
      const k = key.dataset.peKey;
      if (k === "back") { const c = [...input.value]; c.pop(); input.value = c.join(""); } else input.value += k;
      onName();
      return;
    }
    const view = e.target.closest("[data-pe-view]");
    if (view) {
      host.querySelectorAll("[data-pe-view]").forEach((b) => b.setAttribute("aria-selected", String(b === view)));
      host.querySelectorAll("[data-pe-figure]").forEach((f) => { f.hidden = f.dataset.peFigure !== view.dataset.peView; });
      draw();
    }
  }
  function syncLang() {
    const input = $("[data-pe-input]");
    const def = E.LANGS[state.lang];
    input.dir = def.dir;
    input.lang = state.lang;
    input.placeholder = PLACEHOLDER[state.lang];
    input.classList.toggle("is-coptic", state.lang === "cop");
    $("[data-pe-keys]").hidden = state.lang !== "cop";
    // Fonts load only once the customer chooses to add a name (no cost for everyone else).
    if (state.mode === "name") E.loadFont(state.lang, fontOpts()).then(draw, draw);
  }
  function unconfirm() { const c = $("[data-pe-confirm]"); if (c) c.checked = false; }
  function clearError() { const n = $("[data-pe-err]"); if (n && n.dataset.kind === "submit") { n.textContent = ""; n.dataset.kind = ""; } }
  function validation() { return E.validateName($("[data-pe-input]").value, state.lang, settings.zone, fontOpts()); }
  function onName() {
    unconfirm();
    const v = validation();
    const shown = v.count ?? [...E.cleanName($("[data-pe-input]").value)].length;
    $("[data-pe-count]").textContent = `${shown} / ${settings.zone.maxChars[state.lang]}`;
    draw();
  }

  async function draw() {
    if (!host || state.mode !== "name") return;
    const my = ++ticket;
    const v = validation();
    const text = v.ok || v.code === "length" ? v.name : "";
    let result;
    try { result = await E.render({ imageSrc, zone: settings.zone, text, lang: state.lang, legacy: settings.copticFont === "athanasius" }); } catch { if (my === ticket) $("[data-pe-err]").textContent = "تعذر تحميل صورة المعاينة. حدّث الصفحة وحاول تاني."; return; }
    if (my !== ticket) return;
    last = { result, v, text };
    const full = $("[data-pe-full]");
    if (!$("[data-pe-figure=full]").hidden) { full.getContext("2d").clearRect(0, 0, full.width, full.height); E.drawFull(full, result, { outline: !text }); }
    E.drawZoom($("[data-pe-zoom]"), result, { outline: !text });
    let err = "";
    if (E.cleanName($("[data-pe-input]").value)) {
      if (!v.ok) err = v.message;
      else if (result.fit && !result.fit.fits) err = "الاسم أطول من مساحة الكتابة على الصليب ده، ومش هنصغّره أكتر من كده عشان يفضل مقروء. جرّب اختصاره (مثلًا «ق.» بدل «القمص»).";
    }
    const errNode = $("[data-pe-err]");
    errNode.textContent = err; errNode.dataset.kind = err ? "live" : "";
    $("[data-pe-summary]").innerHTML = v.ok && !err ? `هيتكتب: <bdi>«${esc(v.name)}»</bdi> باللغة ${LANG_LABEL[state.lang]}` : "";
  }

  // Called by product-page.js when "add to cart" is pressed.
  // null = no engraving; { error } = block and show it; otherwise the cart line details.
  function cartDetails() {
    if (!host || !state || state.mode !== "name") return null;
    const v = validation();
    const fail = (message) => { const n = $("[data-pe-err]"); n.textContent = message; n.dataset.kind = "submit"; $("[data-pe-input]").focus({ preventScroll: false }); return { error: message }; };
    if (!v.ok) return fail(v.message);
    if (!last || last.text !== v.name || !last.result?.fit) return fail("استنى ثانية لحد ما المعاينة تجهز، وبعدين اضغط تاني.");
    if (!last.result.fit.fits) return fail("الاسم أطول من مساحة الكتابة. اختصره الأول.");
    if (!$("[data-pe-confirm]").checked) { $("[data-pe-confirm]").focus(); const n = $("[data-pe-err]"); n.textContent = "أكّد إنك راجعت الاسم قبل الإضافة للسلة."; n.dataset.kind = "submit"; return { error: n.textContent }; }
    const key = E.lineKey(state.lang, v.name);
    let thumbnail = "";
    try { thumbnail = E.thumbnail(last.result, 240); } catch {} // small: it travels with the cart (also the account cart)
    return {
      lineKey: key,
      thumbnail,
      engraving: { enabled: true, name: v.name, lang: state.lang, langLabel: LANG_LABEL[state.lang], finish: settings.zone.finish, zoneVersion: settings.version, customizationId: key }
    };
  }

  window.ProductEngraving = { mount, cartDetails, LANG_LABEL };
})();
