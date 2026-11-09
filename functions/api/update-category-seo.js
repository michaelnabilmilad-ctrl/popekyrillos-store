// Admin save of one category's SEO content into category-seo.json on the data branch.
//
// Only the edited category changes. Two layers keep newer edits from being lost:
// 1. The admin sends the updatedAt it loaded for this category; if the category was
//    saved since, the save is refused (409) and the admin sees the newer text.
// 2. The file is written with GitHub's contents API and the blob SHA it was read at;
//    if another category was saved in between, GitHub refuses, and the save is
//    re-applied on top of the newer file (other categories' edits are kept).
// The file never touches products.json or category-taxonomy.js.

import { liveDataConfig } from "../_live-data.js";
import {
  CATEGORY_SEO_FILE,
  applyCategorySeoChange,
  emptyCategorySeoFile,
  parseCategorySeoFile,
  serializeCategorySeoFile,
  validateCategorySeoEntry
} from "../_category-seo.js";

const MAX_ATTEMPTS = 3;

function json(status, body) {
  return { status, body };
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function githubHeaders(config, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "User-Agent": "popekyrillos-store",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

// The file as it is on the data branch now, with the SHA to write against.
export async function readCategorySeoFromGitHub(env) {
  const config = liveDataConfig(env);
  if (!config.token) throw Object.assign(new Error("GitHub token is not configured"), { status: 500 });
  const response = await fetch(`${config.apiBase}/repos/${config.owner}/${config.repo}/contents/${CATEGORY_SEO_FILE}?ref=${encodeURIComponent(config.branch)}&v=${Date.now()}`, {
    headers: githubHeaders(config)
  });
  if (response.status === 404) {
    await response.body?.cancel?.();
    return { sha: "", file: emptyCategorySeoFile(), exists: false };
  }
  if (!response.ok) throw Object.assign(new Error(`GitHub read failed with ${response.status}`), { status: 502 });
  const data = await response.json();
  return { sha: data.sha, file: parseCategorySeoFile(fromBase64(data.content)), exists: true };
}

async function writeCategorySeoToGitHub(env, { text, sha, message }) {
  const config = liveDataConfig(env);
  const response = await fetch(`${config.apiBase}/repos/${config.owner}/${config.repo}/contents/${CATEGORY_SEO_FILE}`, {
    method: "PUT",
    headers: githubHeaders(config),
    body: JSON.stringify({ message, content: toBase64(text), branch: config.branch, ...(sha ? { sha } : {}) })
  });
  // 409: the file changed since it was read; 422: it was created meanwhile.
  if (response.status === 409 || response.status === 422) {
    await response.body?.cancel?.();
    return { conflict: true };
  }
  if (!response.ok) throw Object.assign(new Error(`GitHub write failed with ${response.status}`), { status: 502 });
  const data = await response.json();
  return { conflict: false, commitSha: data?.commit?.sha || "" };
}

function sameEntry(a, b) {
  const pick = (entry) => entry && JSON.stringify([entry.seoTitle, entry.seoDescription, entry.seoIntro, entry.seoRelated]);
  return pick(a) === pick(b);
}

// Returns { status, body, text } where text is the exact file committed (for the
// worker's live-data cache) when the save went through.
export async function updateCategorySeo({ request, env, keyExists, categoryExists, productExists, now = () => new Date().toISOString() }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "invalid_json", message: "بيانات غير صالحة." });
  }
  const key = String(payload?.key || "");
  const baseUpdatedAt = String(payload?.baseUpdatedAt ?? "");
  const validation = validateCategorySeoEntry(payload?.entry ?? null, { key, keyExists, categoryExists, productExists });
  if (!validation.ok) return json(400, { error: "invalid_category_seo", message: validation.errors[0].message, errors: validation.errors });

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const { sha, file } = await readCategorySeoFromGitHub(env);
      const current = file.categories[key] || null;
      if ((current?.updatedAt || "") !== baseUpdatedAt) {
        return json(409, {
          error: "category_seo_changed",
          message: "تم حفظ تعديل أحدث لهذا القسم بعد فتح النافذة. راجع النص الحالي ثم أعد الحفظ.",
          current,
          history: file.history[key] || []
        });
      }
      if (sameEntry(current, validation.entry) || (!current && !validation.entry)) {
        return json(200, { ok: true, unchanged: true, key, entry: current, history: file.history[key] || [], warnings: validation.warnings });
      }
      const next = applyCategorySeoChange(file, key, validation.entry, now());
      const text = serializeCategorySeoFile(next);
      const message = `${validation.entry ? "Update" : "Reset"} category SEO: ${key} (admin ${next.updatedAt})`;
      const result = await writeCategorySeoToGitHub(env, { text, sha, message });
      if (result.conflict) continue;
      return {
        ...json(200, { ok: true, key, entry: next.categories[key] || null, history: next.history[key], commitSha: result.commitSha, warnings: validation.warnings }),
        text
      };
    }
    return json(409, { error: "category_seo_busy", message: "الملف يتعدّل الآن من مكان آخر. حاول مرة أخرى بعد لحظات." });
  } catch (error) {
    console.error("Category SEO save failed", error?.message || error);
    return json(error?.status || 502, { error: "category_seo_save_failed", message: "تعذّر الحفظ الآن. لم يتغير أي شيء؛ حاول مرة أخرى." });
  }
}
