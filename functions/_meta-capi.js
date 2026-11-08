// Meta Conversions API relay (server side only). No Meta script runs in the browser.
//
// The browser sends a small event to /api/meta-events, only after the visitor accepted
// marketing cookies. This module rebuilds every field Meta receives, so the browser
// cannot choose what reaches Meta:
//  - only six standard events, no custom events (Religion category + Core Setup);
//  - no customer data, no product names or ids, no search terms, no page URLs
//    (event_source_url is the site origin only);
//  - user_data is limited to the User-Agent (required by Meta for website events),
//    the click id cookie _fbc when the visitor came from an ad and consented, and the IP
//    only if META_CAPI_SEND_IP is "true" (off by default);
//  - Purchase is never trusted from the browser: it needs the order's private tracking
//    token, the order must exist on the server (customer_order_access), its value comes
//    from the server-side order snapshot (products only, no shipping), and each order
//    is sent at most once (meta_capi_events).
// Nothing is sent unless META_CAPI_ENABLED is "true" and META_CAPI_TOKEN is set.

const DEFAULT_DATASET_ID = "1182812737752728";
const DEFAULT_GRAPH_VERSION = "v23.0";
const SITE_ORIGIN = "https://popekyrillos.store";
const CONSENT_COOKIE = "pk_mkt_consent";
const MAX_BODY_BYTES = 2048;
const MAX_VALUE_EGP = 500000;
const MAX_ITEMS = 200;
const PURCHASE_MAX_AGE_HOURS = 48;
const BROWSER_EVENTS = new Set(["PageView", "ViewContent", "Search", "AddToCart", "InitiateCheckout"]);
const ALL_EVENTS = new Set([...BROWSER_EVENTS, "Purchase"]);
const FBC_PATTERN = /^fb\.1\.\d{10,16}\.[A-Za-z0-9_-]{10,500}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

// In-isolate limits (per Worker instance, so best effort, not global): per IP, a stricter
// per-IP limit for Purchase, and a per-instance ceiling that caps outbound calls to Meta.
// They never write to D1, so a flood cannot use up the D1 quota the order system shares.
// The global first line is a Cloudflare WAF rate-limiting rule on /api/meta-events,
// to be added in the dashboard only with Michael's approval (see the report).
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_EVENTS = 120;
const PURCHASE_RATE_MAX = 10;
const GLOBAL_WINDOW_MS = 60 * 1000;
const GLOBAL_MAX_EVENTS = 600;
const rateBuckets = new Map();
let globalBucket = { start: 0, count: 0 };

function noContent(status = 204) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" } });
}

export function metaCapiEnabled(env) {
  return String(env?.META_CAPI_ENABLED || "").trim() === "true" && Boolean(String(env?.META_CAPI_TOKEN || "").trim());
}

function cookieValue(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return "";
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request) {
  return String(request.headers.get("CF-Connecting-IP") || "").trim().slice(0, 64);
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  // The isolated Meta test Worker runs on its own workers.dev address; only there is its
  // own origin accepted as well.
  const ownTestOrigin = env?.META_CAPI_PREVIEW === "1" && env?.PREVIEW_MODE === "1" ? new URL(request.url).origin : "";
  if (origin && origin !== SITE_ORIGIN && origin !== "https://www.popekyrillos.store" && origin !== ownTestOrigin) return false;
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return false;
  return Boolean(origin) || site === "same-origin";
}

export function underRateLimit(key, max = RATE_MAX_EVENTS, now = Date.now()) {
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    if (rateBuckets.size > 5000) rateBuckets.clear();
    rateBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

function underGlobalLimit(now = Date.now()) {
  if (now - globalBucket.start > GLOBAL_WINDOW_MS) globalBucket = { start: now, count: 0 };
  globalBucket.count += 1;
  return globalBucket.count <= GLOBAL_MAX_EVENTS;
}

export function resetMetaRateLimits() { rateBuckets.clear(); globalBucket = { start: 0, count: 0 }; }

function boundedNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function money(value) {
  const number = boundedNumber(value, 0, MAX_VALUE_EGP);
  return number === null ? null : Math.round(number * 100) / 100;
}

// Validates the browser body and returns only the fields each event may carry.
export function validateBrowserEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid_body" };
  const allowedKeys = new Set(["event", "consent", "value", "numItems", "token"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return { error: "unexpected_field" };
  if (body.consent !== true) return { error: "consent_required" };
  const event = String(body.event || "");
  if (!ALL_EVENTS.has(event)) return { error: "invalid_event" };
  if (event === "Purchase") {
    if (!TOKEN_PATTERN.test(String(body.token || ""))) return { error: "invalid_token" };
    if (body.value !== undefined || body.numItems !== undefined) return { error: "unexpected_field" };
    return { event, token: body.token };
  }
  if (body.token !== undefined) return { error: "unexpected_field" };
  if (event === "PageView" || event === "Search") {
    if (body.value !== undefined || body.numItems !== undefined) return { error: "unexpected_field" };
    return { event };
  }
  const value = money(body.value);
  if (value === null) return { error: "invalid_value" };
  if (event === "ViewContent") {
    if (body.numItems !== undefined) return { error: "unexpected_field" };
    return { event, value };
  }
  const numItems = boundedNumber(body.numItems, 1, MAX_ITEMS);
  if (numItems === null || !Number.isInteger(numItems)) return { error: "invalid_num_items" };
  return { event, value, numItems };
}

async function initializeMetaTables(env) {
  await env.ANALYTICS_DB.prepare("CREATE TABLE IF NOT EXISTS meta_capi_events (event_key TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}

function parseSqlTime(value) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(" ", "T")}Z`);
}

// Reads the order by its private token (read only). Returns null unless it is a real,
// recent website order with a usable server-side snapshot.
export async function verifiedPurchase(env, token, now = Date.now()) {
  const row = await env.ANALYTICS_DB.prepare("SELECT order_id, scope, snapshot, created_at FROM customer_order_access WHERE token = ?").bind(token).first();
  if (!row || !row.snapshot) return null;
  const created = parseSqlTime(row.created_at);
  if (!Number.isFinite(created) || now - created > PURCHASE_MAX_AGE_HOURS * 3600 * 1000 || created - now > 5 * 60 * 1000) return null;
  let snapshot;
  try { snapshot = JSON.parse(row.snapshot); } catch { return null; }
  const value = money(snapshot?.total);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const numItems = items.reduce((sum, item) => sum + (Number.isInteger(Number(item?.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 0), 0);
  if (value === null || value <= 0 || numItems < 1) return null;
  return { eventKey: `purchase:${row.scope}:${row.order_id}`, value, numItems: Math.min(numItems, MAX_ITEMS) };
}

// Builds the exact object sent to Meta. Kept separate so tests can assert every field.
export function buildMetaEvent({ event, value, numItems, eventId, eventTime, userAgent, fbc, ip }) {
  const userData = { client_user_agent: String(userAgent || "").slice(0, 512) };
  if (fbc && FBC_PATTERN.test(fbc)) userData.fbc = fbc;
  if (ip) userData.client_ip_address = ip;
  const metaEvent = {
    event_name: event,
    event_time: eventTime,
    event_id: eventId,
    action_source: "website",
    event_source_url: `${SITE_ORIGIN}/`,
    user_data: userData
  };
  if (event === "ViewContent") metaEvent.custom_data = { currency: "EGP", value };
  if (["AddToCart", "InitiateCheckout", "Purchase"].includes(event)) metaEvent.custom_data = { currency: "EGP", value, num_items: numItems };
  return metaEvent;
}

async function sendToMeta(env, metaEvent) {
  const dataset = String(env.META_DATASET_ID || DEFAULT_DATASET_ID).trim();
  const version = String(env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION).trim();
  if (!/^\d{6,20}$/.test(dataset) || !/^v\d{1,3}\.\d$/.test(version)) throw new Error("Meta CAPI configuration is invalid");
  const body = { data: [metaEvent], access_token: String(env.META_CAPI_TOKEN).trim() };
  const testCode = String(env.META_TEST_EVENT_CODE || "").trim();
  if (/^[A-Za-z0-9]{3,40}$/.test(testCode)) body.test_event_code = testCode;
  const response = await fetch(`https://graph.facebook.com/${version}/${dataset}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    // Meta's error fields only (type/code/subcode/message); never the request body or token.
    let detail = "";
    try {
      const error = (await response.json())?.error || {};
      detail = ` ${error.type || ""} code=${error.code ?? ""} subcode=${error.error_subcode ?? ""}: ${error.error_user_msg || error.message || ""}`;
    } catch {}
    throw new Error(`Meta CAPI responded ${response.status}${detail}`);
  }
  return response;
}

export async function metaEventsResponse(request, env, ctx) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!allowedOrigin(request, env)) return json({ error: "origin_not_allowed" }, 403);
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return json({ error: "invalid_content_type" }, 415);
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  // Server-side consent check: the browser flag alone is not enough.
  if (cookieValue(request, CONSENT_COOKIE) !== "granted") return noContent(202);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }
  const valid = validateBrowserEvent(body);
  if (valid.error) return json({ error: valid.error }, 400);
  const ip = clientIp(request);
  const ipHash = (await sha256Hex(`meta-rate:${ip || "unknown"}`)).slice(0, 32);
  if (!underRateLimit(ipHash)) return json({ error: "rate_limited" }, 429);
  // Disabled (the default): accept and drop, so the browser behaves the same either way.
  if (!metaCapiEnabled(env)) return noContent(202);
  // A preview/test Worker may only send to Meta's Test Events, never as live data.
  if (env.PREVIEW_MODE === "1" && !/^[A-Za-z0-9]{3,40}$/.test(String(env.META_TEST_EVENT_CODE || "").trim())) return noContent(202);
  if (!underGlobalLimit()) return json({ error: "rate_limited" }, 429);

  let event = valid;
  let eventId = crypto.randomUUID();
  let purchaseKey = "";
  if (valid.event === "Purchase") {
    if (!env.ANALYTICS_DB) return noContent(202);
    if (!underRateLimit(`purchase:${ipHash}`, PURCHASE_RATE_MAX)) return json({ error: "rate_limited" }, 429);
    // Read only; the only write below happens for a real, recent order.
    const purchase = await verifiedPurchase(env, valid.token).catch(() => null);
    if (!purchase) return noContent(202);
    await initializeMetaTables(env);
    purchaseKey = purchase.eventKey;
    const claim = await env.ANALYTICS_DB.prepare("INSERT OR IGNORE INTO meta_capi_events (event_key, status) VALUES (?, 'sending')").bind(purchaseKey).run();
    if (!claim?.meta?.changes) return noContent(202);
    // Stable and not reversible to the order number; lets Meta drop a duplicate too.
    eventId = `p_${(await sha256Hex(`meta-purchase:${purchaseKey}`)).slice(0, 32)}`;
    event = { event: "Purchase", value: purchase.value, numItems: purchase.numItems };
  }

  const sendIp = String(env.META_CAPI_SEND_IP || "").trim() === "true";
  const metaEvent = buildMetaEvent({
    ...event,
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    userAgent: request.headers.get("User-Agent") || "",
    fbc: cookieValue(request, "_fbc"),
    ip: sendIp ? ip : ""
  });
  const work = sendToMeta(env, metaEvent).then(async () => {
    if (purchaseKey) await env.ANALYTICS_DB.prepare("UPDATE meta_capi_events SET status = 'sent' WHERE event_key = ?").bind(purchaseKey).run();
  }).catch(async (error) => {
    console.error("Meta CAPI send failed", { event: metaEvent.event_name, message: String(error?.message || error).slice(0, 200) });
    // A failed Purchase may be retried by a later visit to the confirmation page.
    if (purchaseKey) await env.ANALYTICS_DB.prepare("DELETE FROM meta_capi_events WHERE event_key = ? AND status = 'sending'").bind(purchaseKey).run().catch(() => {});
  });
  if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
  return noContent(202);
}
