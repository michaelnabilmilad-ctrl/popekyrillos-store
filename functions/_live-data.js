// Live catalog files (products.json, category-taxonomy.js) from the products-data
// branch, kept in this isolate's memory and in the data center's edge cache so a
// page never waits for GitHub to send the whole file again.
//
// Each version is stored under its git blob SHA, which is also the ETag GitHub's
// contents API returns. Checking for a newer version is a conditional request
// (If-None-Match) that GitHub answers with a tiny 304 when nothing changed.
//
// Pages ("display"): a copy checked within FRESH_MS is used as is; an older copy is
// used at once while a background check runs; a copy older than REVALIDATE_MS waits
// up to BLOCKING_TIMEOUT_MS for the check, then falls back to the last good copy.
// Checkout ("strict"): always asks GitHub first and never answers from a copy GitHub
// did not just confirm; if GitHub cannot be reached it throws.

export const LIVE_DATA_POLICY = Object.freeze({
  freshMs: 30_000,
  revalidateMs: 3 * 60_000,
  blockingTimeoutMs: 1_500,
  // After an admin publish, GitHub may briefly still return the previous version.
  publishGuardMs: 5 * 60_000,
  edgeTtlSeconds: 30 * 24 * 60 * 60
});

const memory = new Map();
const inflight = new Map();

export function resetLiveDataMemory() {
  memory.clear();
  inflight.clear();
}

export function liveDataConfig(env = {}) {
  return {
    token: String(env.GITHUB_TOKEN || "").trim(),
    owner: String(env.GITHUB_OWNER || "michaelnabilmilad-ctrl").trim(),
    repo: String(env.GITHUB_REPO || "popekyrillos-store").trim(),
    branch: String(env.GITHUB_PRODUCTS_BRANCH || env.GITHUB_DATA_BRANCH || "products-data").trim()
  };
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The SHA git (and GitHub's ETag) gives a file with exactly this content.
export async function gitBlobSha(text) {
  const body = new TextEncoder().encode(text);
  const header = new TextEncoder().encode(`blob ${body.byteLength}\0`);
  const bytes = new Uint8Array(header.byteLength + body.byteLength);
  bytes.set(header, 0);
  bytes.set(body, header.byteLength);
  return hex(await crypto.subtle.digest("SHA-1", bytes));
}

function versionFromEtag(etag = "") {
  const value = String(etag).replace(/^W\//i, "").replace(/"/g, "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(value) ? value : "";
}

function edgeCache() {
  return globalThis.caches?.default || null;
}

function metaKey(origin, file) {
  return new Request(`${origin}/__live-data/v1/${encodeURIComponent(file)}/meta`, { method: "GET" });
}

function bodyKey(origin, file, version) {
  return new Request(`${origin}/__live-data/v1/${encodeURIComponent(file)}/body/${version}`, { method: "GET" });
}

async function readEdge(origin, file, known) {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const metaResponse = await cache.match(metaKey(origin, file));
    if (!metaResponse) return null;
    const meta = await metaResponse.json();
    if (!meta?.version) return null;
    if (known?.version === meta.version) return { ...known, ...meta, text: known.text };
    const bodyResponse = await cache.match(bodyKey(origin, file, meta.version));
    if (!bodyResponse) return null;
    return { ...meta, text: await bodyResponse.text() };
  } catch (error) {
    console.warn("Live data edge cache read failed", file, error?.message || error);
    return null;
  }
}

async function writeEdge(origin, file, entry, { body = true } = {}) {
  const cache = edgeCache();
  if (!cache) return;
  const headers = { "Cache-Control": `public, max-age=${LIVE_DATA_POLICY.edgeTtlSeconds}` };
  const { text, ...meta } = entry;
  try {
    if (body) await cache.put(bodyKey(origin, file, entry.version), new Response(text, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } }));
    await cache.put(metaKey(origin, file), new Response(JSON.stringify(meta), { headers: { ...headers, "Content-Type": "application/json" } }));
  } catch (error) {
    console.warn("Live data edge cache write failed", file, error?.message || error);
  }
}

function remember(file, entry) {
  const current = memory.get(file);
  if (!current || current.version !== entry.version || entry.checkedAt >= current.checkedAt) memory.set(file, entry);
  return memory.get(file);
}

async function currentEntry(origin, file) {
  const local = memory.get(file);
  if (local && Date.now() - local.checkedAt <= LIVE_DATA_POLICY.freshMs) return local;
  const edge = await readEdge(origin, file, local);
  if (edge && (!local || edge.checkedAt > local.checkedAt || edge.version !== local.version && (edge.publishedAt || 0) >= (local.publishedAt || 0))) {
    return remember(file, edge);
  }
  return local || null;
}

// One conditional request to the contents API. Returns the confirmed entry.
async function checkGitHub({ env, origin, file, entry, signal }) {
  const config = liveDataConfig(env);
  if (!config.token) throw Object.assign(new Error("GitHub token is not configured"), { code: "no_token" });
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${file}?ref=${encodeURIComponent(config.branch)}&v=${Date.now()}`;
  const headers = {
    Accept: "application/vnd.github.raw",
    Authorization: `Bearer ${config.token}`,
    "User-Agent": "popekyrillos-store",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (entry?.version) headers["If-None-Match"] = `"${entry.version}"`;
  const response = await fetch(url, { headers, signal });
  const checkedAt = Date.now();
  if (response.status === 304 && entry) {
    await response.body?.cancel?.();
    const confirmed = { ...entry, checkedAt };
    remember(file, confirmed);
    await writeEdge(origin, file, confirmed, { body: false });
    return confirmed;
  }
  if (!response.ok) {
    await response.body?.cancel?.();
    throw Object.assign(new Error(`GitHub ${file} check failed with ${response.status}`), { status: response.status });
  }
  const text = await response.text();
  const version = versionFromEtag(response.headers.get("ETag")) || await gitBlobSha(text);
  // Right after an admin publish GitHub may still answer with the version that
  // publish replaced; keep the published one instead of going back.
  if (entry?.publishedAt && checkedAt - entry.publishedAt < LIVE_DATA_POLICY.publishGuardMs && version === entry.previousVersion) {
    console.warn("GitHub returned the pre-publish version; keeping the published one", file);
    return entry;
  }
  const next = { version, text, checkedAt, source: "github" };
  remember(file, next);
  await writeEdge(origin, file, next);
  return next;
}

function sharedCheck(options) {
  const key = options.file;
  if (inflight.has(key)) return inflight.get(key);
  const promise = checkGitHub(options).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Live data check timed out"), { code: "timeout" })), ms); })
  ]).finally(() => clearTimeout(timer));
}

// Unauthenticated last resort for pages when no copy exists yet and the API failed.
async function fetchRawFallback({ env, origin, file, signal }) {
  const config = liveDataConfig(env);
  const response = await fetch(`https://raw.githubusercontent.com/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${file}`, {
    headers: { "User-Agent": "popekyrillos-store" }, signal
  });
  if (!response.ok) throw new Error(`GitHub raw ${file} failed with ${response.status}`);
  const text = await response.text();
  // raw.githubusercontent.com may lag a few minutes, so this copy is due for a real check soon.
  const entry = { version: await gitBlobSha(text), text, checkedAt: Date.now() - LIVE_DATA_POLICY.freshMs - 1, source: "raw" };
  remember(file, entry);
  await writeEdge(origin, file, entry);
  return entry;
}

export async function readLiveFile({ env, origin, file, strict = false, waitUntil, signal }) {
  const background = (promise) => {
    const quiet = promise.catch((error) => console.warn("Background live data check failed", file, error?.message || error));
    if (waitUntil) waitUntil(quiet);
  };
  const entry = await currentEntry(origin, file);

  if (strict) {
    // Its own request: a check that started before this one may predate a publish.
    return checkGitHub({ env, origin, file, entry, signal });
  }

  if (entry) {
    const age = Date.now() - entry.checkedAt;
    if (age <= LIVE_DATA_POLICY.freshMs) return entry;
    const check = sharedCheck({ env, origin, file, entry });
    background(check);
    if (age <= LIVE_DATA_POLICY.revalidateMs) return entry;
    try {
      return await withTimeout(check, LIVE_DATA_POLICY.blockingTimeoutMs);
    } catch {
      return memory.get(file) || entry;
    }
  }

  try {
    return await sharedCheck({ env, origin, file, entry: null, signal });
  } catch (error) {
    console.warn("Live data API unavailable with no cached copy; trying raw", file, error?.message || error);
    return fetchRawFallback({ env, origin, file, signal });
  }
}

// Called after the admin committed `text` as `file`: this data center serves it at
// once, and a later check confirms it with a 304 instead of downloading it again.
export async function recordPublishedFile({ origin, file, text }) {
  const previous = memory.get(file) || await readEdge(origin, file, null);
  const now = Date.now();
  const entry = { version: await gitBlobSha(text), text, checkedAt: now, publishedAt: now, previousVersion: previous?.version || "", source: "publish" };
  memory.set(file, entry);
  await writeEdge(origin, file, entry);
  return entry;
}
