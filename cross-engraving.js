// Cross engraving: live preview of a priest's name on a hand cross (Canvas 2D, no libraries).
// Used by the product page (product-engraving.js), the admin product editor (admin-engraving.js)
// and the admin order view. Fonts: Noto Sans Arabic, Cinzel, Noto Sans Coptic (all SIL OFL 1.1,
// licences in assets/fonts/engraving/). Calibrated on the shop's real ivory-cross sample.
// Unicode Coptic → "CS New Athanasius" legacy (ASCII-slot) encoding, for DISPLAY ONLY.
// The customer types and the order stores real Unicode Coptic; this string is only ever
// handed to a canvas/element whose font is CS New Athanasius.
// Mapping source: NEW_ATHANASIUS table of github.com/StMarkus/coptic_font_unicode_converter
// (fontMatrix.json, built from all2Unicode_v3.xlsx). Jinkim in that font is the ";" glyph
// placed BEFORE its letter (the library's COMBINE_WITH_CHAR_AFTER mode); overlined letters
// exist only as 9 precomposed glyphs on the digit keys.
(function (global) {
  "use strict";
  const LEGACY_TO_UNICODE = {"1":"ⲁ̅","2":"ⲃ̅","3":"ⲅ̅","4":"ⲇ̅","5":"ⲉ̅","6":"ⲋ","7":"ϣ̅","8":"ⲏ̅","9":"ⲯ̅","A":"Ⲁ","a":"ⲁ","B":"Ⲃ","b":"ⲃ","G":"Ⲅ","g":"ⲅ","D":"Ⲇ","d":"ⲇ","E":"Ⲉ","e":"ⲉ","Z":"Ⲍ","z":"ⲍ","?":"Ⲏ","/":"ⲏ","Y":"Ⲑ","y":"ⲑ","I":"Ⲓ","i":"ⲓ","K":"Ⲕ","k":"ⲕ","L":"Ⲗ","l":"ⲗ","M":"Ⲙ","m":"ⲙ","N":"Ⲛ","n":"ⲛ","X":"Ⲝ","x":"ⲝ","O":"Ⲟ","o":"ⲟ","P":"Ⲡ","p":"ⲡ","R":"Ⲣ","r":"ⲣ","C":"Ⲥ","c":"ⲥ","T":"Ⲧ","t":"ⲧ","U":"Ⲩ","u":"ⲩ","V":"Ⲫ","v":"ⲫ","<":"Ⲭ",",":"ⲭ","\"":"Ⲯ","'":"ⲯ","W":"Ⲱ","w":"ⲱ","S":"Ϣ","s":"ϣ","F":"Ϥ","f":"ϥ","Q":"Ϧ","q":"ϧ","H":"Ϩ","h":"ϩ","J":"Ϫ","j":"ϫ","{":"Ϭ","[":"ϭ","}":"Ϯ","]":"ϯ"};
  const JINKIM = "̀", OVERLINE = "̅";
  const UNICODE_TO_LEGACY = new Map();
  for (const [ascii, uni] of Object.entries(LEGACY_TO_UNICODE)) UNICODE_TO_LEGACY.set(uni, ascii);

  // Returns { text, ok, unsupported[] }. ok=false means the font cannot show something
  // exactly (e.g. an overline on a letter that has no overlined glyph) — the caller then
  // falls back to the Unicode font so the customer never sees a wrong letter.
  function toNewAthanasius(unicodeText) {
    const chars = [...String(unicodeText).normalize("NFD").replace(/⳯/g, JINKIM)];
    const out = [], unsupported = [];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === " " || c === "." || c === ":" || c === "-") { out.push(c === "-" ? " " : c); continue; }
      const marks = [];
      while (i + 1 < chars.length && /\p{M}/u.test(chars[i + 1])) marks.push(chars[++i]);
      let base = c, jinkim = false, over = false;
      for (const m of marks) {
        if (m === JINKIM) jinkim = true;
        else if (m === OVERLINE) over = true;
        else unsupported.push(c + m);
      }
      let key = over
        ? UNICODE_TO_LEGACY.get(base + OVERLINE) ?? UNICODE_TO_LEGACY.get(lower(base) + OVERLINE)
        : UNICODE_TO_LEGACY.get(base);
      if (key === undefined) {
        if (over && UNICODE_TO_LEGACY.has(base)) { unsupported.push(base + OVERLINE); key = UNICODE_TO_LEGACY.get(base); }
        else { unsupported.push(base); continue; }
      }
      if (jinkim) out.push(";");
      out.push(key);
    }
    return { text: out.join(""), ok: unsupported.length === 0, unsupported };
  }

  // Coptic capitals and small letters alternate code points (U+2C80 capital, U+2C81 small;
  // U+03E2 capital, U+03E3 small).
  function lower(ch) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x2C80 && cp <= 0x2CB1) || (cp >= 0x03E2 && cp <= 0x03EF)) return cp % 2 === 0 ? String.fromCodePoint(cp + 1) : ch;
    return ch;
  }

  // Reverse direction (used only by tests to prove the round trip).
  function fromNewAthanasius(legacy) {
    const out = [];
    for (let i = 0; i < legacy.length; i++) {
      const c = legacy[i];
      if (c === ";") { const next = LEGACY_TO_UNICODE[legacy[i + 1]]; if (next) { out.push(next + JINKIM); i++; } continue; }
      out.push(LEGACY_TO_UNICODE[c] ?? c);
    }
    return out.join("").normalize("NFC");
  }

  global.CopticLegacy = { toNewAthanasius, fromNewAthanasius, LEGACY_TO_UNICODE };
  if (typeof module !== "undefined" && module.exports) module.exports.CopticLegacy = global.CopticLegacy;
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  "use strict";

  const FONT_BASE = (global.CROSS_ENGRAVING_FONT_BASE || "/assets/fonts/engraving/");
  // CS New Athanasius is NOT shipped with the site (licence unconfirmed). A local test page may
  // point this at a local copy; without it the Coptic preview uses Noto Sans Coptic (OFL).
  const COPTIC_LEGACY_URL = global.CROSS_ENGRAVING_COPTIC_LEGACY_FONT_URL || "";
  const LANGS = {
    ar: { label: "العربية", dir: "rtl", family: "EngraveArabic", weight: "800", faceWeight: "100 900", file: "noto-sans-arabic-arabic-wdth-normal.woff2", sample: "القمص يوحنا مرقس", tracking: 0, condense: 0.74 },
    en: { label: "English", dir: "ltr", family: "EngraveLatin", weight: "700", file: "cinzel-latin-700-normal.woff2", sample: "Fr. John Mark", tracking: 0.05, condense: 1 },
    cop: {
      label: "القبطية", dir: "ltr", family: "EngraveCoptic", weight: "400", file: "noto-sans-coptic-coptic-400-normal.woff2", sample: "ⲒⲰⲀⲚⲚⲎⲤ ⲘⲀⲢⲔⲞⲤ", tracking: 0.05,
      legacy: COPTIC_LEGACY_URL ? { family: "CSNewAthanasius", file: COPTIC_LEGACY_URL, format: "truetype", encode: (t) => global.CopticLegacy.toNewAthanasius(t) } : null
    }
  };

  const ALLOWED = {
    ar: /^[ء-غف-يً-ْٰـ٠-٩ .\-()]+$/u,
    en: /^[A-Za-z .'\-()]+$/u,
    cop: /^[Ⲁ-ⲱϢ-ϯ̀́̄̅̇̈̿⳯-⳱ .\-]+$/u
  };
  const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/gu;

  function cleanName(raw) {
    return String(raw || "").normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  }
  function graphemes(value) {
    if (global.Intl && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
    return [...value].length;
  }
  function validateName(raw, lang, zone) {
    const name = cleanName(raw);
    const max = Number(zone?.maxChars?.[lang]) || 24;
    if (!name) return { ok: false, name, code: "empty", message: "اكتب اسم الكاهن." };
    if (!ALLOWED[lang]) return { ok: false, name, code: "lang", message: "لغة غير مدعومة." };
    if (!ALLOWED[lang].test(name)) {
      const hint = lang === "ar" ? "استخدم حروفًا عربية فقط." : lang === "en" ? "Use English letters only." : "استخدم الحروف القبطية من لوحة الحروف.";
      return { ok: false, name, code: "chars", message: `توجد حروف غير مناسبة للغة المختارة. ${hint}` };
    }
    const count = graphemes(name);
    if (count > max) return { ok: false, name, count, max, code: "length", message: `الاسم أطول من مساحة الكتابة (${count} من ${max} حرفًا).` };
    return { ok: true, name, count, max };
  }

  const fontPromises = {};
  const legacyReady = { cop: false };
  function loadFace(family, file, weight, format = "woff2") {
    const src = /^(?:\/|https?:|blob:|data:)/.test(file) ? file : FONT_BASE + file;
    const face = new FontFace(family, `url(${src}) format("${format}")`, { weight, display: "block" });
    return face.load().then((loaded) => { document.fonts.add(loaded); return loaded; });
  }
  function loadFont(lang) {
    const def = LANGS[lang];
    if (!def) return Promise.resolve();
    if (!fontPromises[lang]) {
      const main = loadFace(def.family, def.file, def.faceWeight || def.weight);
      const legacy = def.legacy
        ? loadFace(def.legacy.family, def.legacy.file, "400", def.legacy.format).then(() => { legacyReady[lang] = true; }, () => { legacyReady[lang] = false; })
        : Promise.resolve();
      fontPromises[lang] = Promise.all([main, legacy]);
    }
    return fontPromises[lang];
  }
  // What actually gets drawn: family + the string in that family's encoding.
  function drawSpec(text, lang, opts = {}) {
    const def = LANGS[lang];
    if (def.legacy && legacyReady[lang] && opts.legacy !== false) {
      const enc = def.legacy.encode(text);
      if (enc.ok) return { family: def.legacy.family, weight: "400", text: enc.text, legacy: true, condense: 1 };
    }
    return { family: def.family, weight: def.weight, text, legacy: false, condense: def.condense || 1 };
  }

  const imageCache = new Map();
  function loadImage(src) {
    if (!imageCache.has(src)) {
      imageCache.set(src, new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      }));
    }
    return imageCache.get(src);
  }

  // How the shop actually executes the name on each product (set per product in admin).
  // The colour is never assumed: each product carries its own zone.color, chosen in admin.
  const FINISHES = {
    ink: { label: "كتابة على سطح الصليب (حبر/طباعة)", kind: "ink" },
    filled: { label: "حفر مملوء باللون المختار", kind: "filled" },
    laser: { label: "حفر ليزر بدون تعبئة", kind: "filled" }
  };
  // Older drafts used the colour name as the finish.
  const LEGACY_FINISH = { ivory: "filled", gold: "filled" };
  const COLOR_PRESETS = [
    { value: "#18130e", label: "أسود (المعتمد للصلبان العاجية)" },
    { value: "#c9a14f", label: "ذهبي" },
    { value: "#f2ede2", label: "أبيض عاجي" },
    { value: "#b9bcc0", label: "فضي" }
  ];
  const isHexColor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
    return `rgb(${ch.join(",")})`;
  }
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  function finishFor(zone) {
    const base = FINISHES[zone.finish] || FINISHES.ink;
    // No colour chosen yet (admin draft only): neutral grey, so no colour is implied.
    const color = isHexColor(zone.color) ? zone.color : "#8a8a8a";
    if (base.kind === "ink") return { kind: "ink", color, dark: luminance(color) < 0.5 };
    const laser = zone.finish === "laser";
    return { kind: "filled", top: shade(color, laser ? -0.05 : 0.12), bottom: shade(color, laser ? -0.2 : -0.14), color };
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function zonePx(zone, img) {
    const W = img.naturalWidth, H = img.naturalHeight;
    return { cx: zone.x * W, cy: zone.y * H, L: zone.len * W, S: zone.thick * W, rot: (zone.angle || 0) * Math.PI / 180 };
  }

  function setFont(ctx, spec, px, trackingEm) {
    ctx.font = `${spec.weight} ${px}px "${spec.family}"`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${(trackingEm * px).toFixed(2)}px`;
  }
  function measure(ctx, text) {
    const m = ctx.measureText(text);
    return {
      m,
      width: (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width),
      asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent,
      left: m.actualBoundingBoxLeft || 0, right: m.actualBoundingBoxRight || m.width
    };
  }

  // Largest size that fits; letter spacing is reduced first, the size second, and the size
  // never goes under fontMin (then the name is reported as too long instead of shrinking).
  function fitText(ctx, spec, lang, L, S, zone) {
    const def = LANGS[lang];
    const maxRatio = zone.fontMax ?? 0.52, minRatio = zone.fontMin ?? 0.38;
    // ink finish: the font's own weight only (matches the real sample); filled finishes may add a little
    const weight = zone.weight ?? 0.015;
    const pad = (zone.padding ?? 0.08) * L;
    const cx = spec.condense || 1;
    const baseTracking = spec.legacy ? 0.03 : (zone.tracking ?? def.tracking);
    for (let ratio = maxRatio; ratio >= minRatio - 1e-6; ratio -= 0.01) {
      const px = S * ratio, stroke = px * weight;
      for (const tr of [baseTracking, baseTracking / 2, 0]) {
        setFont(ctx, spec, px, tr);
        const r = measure(ctx, spec.text);
        r.width *= cx; r.left *= cx;
        if (r.width + stroke <= L - pad * 2 && r.asc + r.desc + stroke <= S * 0.86) return { fits: true, px, ratio, tracking: tr, stroke, ...r };
        if (!tr) break;
      }
    }
    const px = S * minRatio;
    setFont(ctx, spec, px, 0);
    const r = measure(ctx, spec.text); r.width *= cx; r.left *= cx;
    return { fits: false, px, ratio: minRatio, tracking: 0, stroke: px * weight, ...r };
  }

  function textMask(spec, lang, w, h, zone) {
    const def = LANGS[lang];
    const mask = makeCanvas(w, h);
    const ctx = mask.getContext("2d");
    const fit = fitText(ctx, spec, lang, w, h, zone);
    setFont(ctx, spec, fit.px, fit.tracking);
    ctx.direction = spec.legacy ? "ltr" : def.dir;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // centre the real ink box (not the advance box) in the zone
    const cx = spec.condense || 1;
    const x = (w - fit.width) / 2 + fit.left;
    const y = h / 2 + (fit.asc - fit.desc) / 2 + (zone.offset || 0) * h;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#fff";
    ctx.lineJoin = "round"; ctx.lineWidth = fit.stroke;
    ctx.save(); ctx.translate(x, 0); ctx.scale(cx, 1);
    ctx.fillText(spec.text, 0, y);
    if (fit.stroke > 0.2) ctx.strokeText(spec.text, 0, y);
    ctx.restore();
    return { mask, fit };
  }

  function wrapCylinder(mask, w, h, curve) {
    const out = makeCanvas(w, h);
    const ctx = out.getContext("2d");
    const sinA = Math.sin(curve);
    for (let r = 0; r < h; r++) {
      const u = (r + 0.5) / h * 2 - 1;
      const theta = Math.asin(Math.max(-1, Math.min(1, u * sinA)));
      const s = (theta / curve + 1) / 2 * h;
      ctx.drawImage(mask, 0, Math.max(0, Math.min(h - 1, s)), w, 1, 0, r, w, 1);
    }
    return out;
  }

  function finishLayer(shaped, w, h, fit, finish, lightDir, curve) {
    const out = makeCanvas(w, h);
    const o = out.getContext("2d");
    o.drawImage(shaped, 0, 0);
    o.globalCompositeOperation = "source-in";
    if (finish.kind === "ink") {
      o.fillStyle = finish.color; o.fillRect(0, 0, w, h);
    } else {
      const g = o.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, finish.top); g.addColorStop(1, finish.bottom);
      o.fillStyle = g; o.fillRect(0, 0, w, h);
      // one quiet groove edge only (no glow, no heavy shadow)
      const d = Math.max(1, fit.px * 0.03);
      const e = makeCanvas(w, h), ectx = e.getContext("2d");
      ectx.drawImage(shaped, 0, 0);
      ectx.globalCompositeOperation = "destination-out";
      ectx.drawImage(shaped, lightDir.x * d, lightDir.y * d);
      ectx.globalCompositeOperation = "source-in";
      ectx.fillStyle = "rgba(0,0,0,0.28)"; ectx.fillRect(0, 0, w, h);
      o.globalCompositeOperation = "source-atop";
      o.drawImage(e, 0, 0);
    }
    if (curve) {
      const shade = o.createLinearGradient(0, 0, 0, h);
      const edge = finish.kind === "ink" ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.40)";
      shade.addColorStop(0, edge); shade.addColorStop(0.28, "rgba(0,0,0,0)");
      shade.addColorStop(0.72, "rgba(0,0,0,0)"); shade.addColorStop(1, edge);
      o.globalCompositeOperation = "source-atop";
      o.fillStyle = shade; o.fillRect(0, 0, w, h);
    }
    return out;
  }

  async function render({ imageSrc, zone, text, lang, legacy }) {
    const img = await loadImage(imageSrc);
    if (text) await loadFont(lang);
    const W = img.naturalWidth, H = img.naturalHeight;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const z = zonePx(zone, img);
    let fit = null, spec = null;
    if (text) {
      spec = drawSpec(text, lang, { legacy });
      const scale = 3;
      const w = z.L * scale, h = z.S * scale;
      const { mask, fit: f } = textMask(spec, lang, w, h, zone);
      fit = f;
      const curve = zone.surface === "round" ? Math.min(1.35, Math.max(0.05, zone.curve || 0.9)) : 0;
      const shaped = curve ? wrapCylinder(mask, w, h, curve) : mask;
      const finish = finishFor(zone);
      const lightDir = { x: Math.sin(z.rot), y: Math.cos(z.rot) };
      const layer = finishLayer(shaped, w, h, fit, finish, lightDir, curve);
      ctx.save();
      ctx.translate(z.cx, z.cy);
      ctx.rotate(z.rot);
      ctx.beginPath(); ctx.rect(-z.L / 2, -z.S / 2, z.L, z.S); ctx.clip();
      ctx.imageSmoothingQuality = "high";
      if (finish.kind === "ink") {
        // ink sits on the surface: a dark ink multiplies (keeps the photo's own light and texture);
        // a light ink on a dark cross is painted normally, since multiply would hide it.
        ctx.globalCompositeOperation = finish.dark ? "multiply" : "source-over";
        ctx.globalAlpha = 0.97;
        ctx.filter = `blur(${Math.max(0.3, fit.px / scale * 0.012).toFixed(2)}px)`;
      }
      ctx.drawImage(layer, -z.L / 2, -z.S / 2, z.L, z.S);
      ctx.restore();
    }
    return { canvas, fit, z, img, spec };
  }

  function drawZoom(target, result, { margin = 0.3, outline = false } = {}) {
    const { canvas, z } = result;
    const tctx = target.getContext("2d");
    const tw = target.width, th = target.height;
    const L = z.L * (1 + margin), S = Math.max(z.S * (1 + margin * 2.2), L * th / tw);
    const k = Math.min(tw / L, th / S);
    tctx.save();
    tctx.fillStyle = "#f4efe4"; tctx.fillRect(0, 0, tw, th);
    tctx.translate(tw / 2, th / 2);
    tctx.scale(k, k);
    tctx.rotate(-z.rot);
    tctx.translate(-z.cx, -z.cy);
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(canvas, 0, 0);
    if (outline) {
      tctx.translate(z.cx, z.cy); tctx.rotate(z.rot);
      tctx.setLineDash([6 / k, 5 / k]); tctx.lineWidth = 2 / k; tctx.strokeStyle = "#c69245";
      tctx.strokeRect(-z.L / 2, -z.S / 2, z.L, z.S);
    }
    tctx.restore();
  }

  function drawFull(target, result, { outline = false } = {}) {
    const { canvas, z } = result;
    // keep the photo's own proportions (test frames can be 16:9, shop photos are square)
    const wantH = Math.round(target.width * canvas.height / canvas.width);
    if (target.height !== wantH) target.height = wantH;
    const tctx = target.getContext("2d");
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(canvas, 0, 0, target.width, target.height);
    if (outline) {
      const k = target.width / canvas.width;
      tctx.save(); tctx.scale(k, k); tctx.translate(z.cx, z.cy); tctx.rotate(z.rot);
      tctx.setLineDash([10 / k, 8 / k]); tctx.lineWidth = 3 / k; tctx.strokeStyle = "#c69245";
      tctx.strokeRect(-z.L / 2, -z.S / 2, z.L, z.S);
      tctx.restore();
    }
  }

  function thumbnail(result, size = 360) {
    const t = makeCanvas(size, size / 3);
    drawZoom(t, result, { margin: 0.12 });
    return t.toDataURL("image/jpeg", 0.72);
  }


  // ---- shared settings helpers (product page, admin editor, admin order view) ----
  const ZONE_DEFAULTS = { x: 0.5, y: 0.65, len: 0.3, thick: 0.06, angle: 90, surface: "flat", curve: 0, fontMax: 0.52, fontMin: 0.38, weight: 0.03, padding: 0.08, tracking: undefined, offset: 0, finish: "ink", color: "", confirmed: false, maxChars: { ar: 24, en: 24, cop: 20 } };
  const LIMITS = { x: [0, 1], y: [0, 1], len: [0.02, 0.95], thick: [0.005, 0.4], angle: [-180, 180], curve: [0, 1.3], fontMax: [0.2, 0.95], fontMin: [0.15, 0.9], weight: [0, 0.12], padding: [0, 0.3], tracking: [0, 0.2], offset: [-0.4, 0.4] };
  const clampNum = (v, [lo, hi], d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  function normalizeSettings(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const z = src.zone && typeof src.zone === "object" ? src.zone : {};
    const zone = { ...ZONE_DEFAULTS };
    for (const k of Object.keys(LIMITS)) {
      if (k === "tracking" && (z.tracking === undefined || z.tracking === null || z.tracking === "")) { delete zone.tracking; continue; }
      zone[k] = clampNum(z[k], LIMITS[k], ZONE_DEFAULTS[k]);
    }
    if (zone.fontMin > zone.fontMax) zone.fontMin = zone.fontMax;
    zone.surface = z.surface === "round" ? "round" : "flat";
    zone.finish = FINISHES[z.finish] ? z.finish : (LEGACY_FINISH[z.finish] || "ink");
    zone.color = isHexColor(z.color) ? z.color.toLowerCase() : "";
    zone.confirmed = z.confirmed === true;
    zone.maxChars = {};
    for (const l of ["ar", "en", "cop"]) zone.maxChars[l] = Math.round(clampNum(z.maxChars?.[l], [1, 60], ZONE_DEFAULTS.maxChars[l]));
    const languages = (Array.isArray(src.languages) ? src.languages : ["ar", "en", "cop"]).filter((l) => LANGS[l]);
    const previewImage = typeof src.previewImage === "string" ? src.previewImage : "";
    // Customers only see engraving once the shop set the photo, the writing colour and
    // checked the writing area (missing = what is still needed, shown in admin).
    const missing = [];
    if (!previewImage) missing.push("previewImage");
    if (!zone.color) missing.push("color");
    if (!zone.confirmed) missing.push("zone");
    return {
      enabled: src.enabled === true && missing.length === 0,
      requested: src.enabled === true,
      missing,
      previewImage,
      zone,
      languages: languages.length ? [...new Set(languages)] : ["ar"],
      fee: 0, // optional fee stays off until the shop approves it
      version: Math.max(1, Math.floor(Number(src.version) || 1))
    };
  }
  // Stable short key per (language, name): two names on the same cross = two cart lines.
  function lineKey(lang, name) {
    const value = `${lang}\u0000${cleanName(name)}`;
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return `eng-${h1.toString(36)}${h2.toString(36)}`;
  }

  global.CrossEngraving = { LANGS, FINISHES, cleanName, validateName, loadFont, drawSpec, legacyReady, render, drawZoom, drawFull, thumbnail, normalizeSettings, lineKey, ZONE_DEFAULTS, COLOR_PRESETS, isHexColor };
  if (typeof module !== "undefined" && module.exports) module.exports.CrossEngraving = global.CrossEngraving;
})(typeof window !== "undefined" ? window : globalThis);
