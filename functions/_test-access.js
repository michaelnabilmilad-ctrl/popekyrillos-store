// Access gate for the separate Meta TEST Worker (wrangler.meta-test.toml) on workers.dev.
// A secret link is not enough: every request needs a signed, HttpOnly cookie that is only
// issued after typing the access key (Cloudflare secret META_TEST_ACCESS_KEY) on
// /__test-access. Without the secret the Worker refuses everything (fails closed).
// It only runs when META_CAPI_PREVIEW is "1", so the production Worker never uses it.
// Meta Test Events is not affected: Meta never calls this Worker; the Worker calls Meta.

const COOKIE = "pk_test_access";
const LOGIN_PATH = "/__test-access";
const SESSION_SECONDS = 8 * 3600;
const MIN_KEY_LENGTH = 32;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const failures = new Map();

const baseHeaders = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY"
};

export function resetTestAccessFailures() {
  failures.clear();
}

async function hmacHex(key, text) {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(text));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(a, b) {
  const left = String(a);
  const right = String(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

// Cookie value: "<expiry seconds>.<HMAC(key, expiry)>". It holds no secret and expires.
async function validSession(request, key, nowMs) {
  const [expiry, signature] = readCookie(request, COOKIE).split(".");
  if (!/^\d{10}$/.test(expiry || "") || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
  if (Number(expiry) * 1000 <= nowMs) return false;
  return sameText(signature, await hmacHex(key, `pk-test-access:${expiry}`));
}

function tooManyFailures(ip, nowMs) {
  const entry = failures.get(ip);
  if (!entry || nowMs - entry.start > FAILURE_WINDOW_MS) return false;
  return entry.count >= MAX_FAILURES;
}

function noteFailure(ip, nowMs) {
  const entry = failures.get(ip);
  if (!entry || nowMs - entry.start > FAILURE_WINDOW_MS) failures.set(ip, { start: nowMs, count: 1 });
  else entry.count += 1;
}

function loginPage(status = 200, message = "") {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>نسخة اختبار مقفولة</title></head><body style="font-family:sans-serif;max-width:420px;margin:15vh auto;padding:0 16px"><h1 style="font-size:20px">نسخة اختبار مقفولة</h1>${message ? `<p>${message}</p>` : ""}<form method="post" action="${LOGIN_PATH}"><label>مفتاح الدخول<br><input name="key" type="password" autocomplete="off" required style="width:100%;padding:8px;margin:8px 0"></label><button type="submit" style="padding:8px 16px">دخول</button></form></body></html>`;
  // "same-origin" (not "no-referrer") so the browser sends the real Origin on the form POST;
  // with "no-referrer" it sends "Origin: null" and the cross-site check below refuses the login.
  return new Response(html, { status, headers: { ...baseHeaders, "Referrer-Policy": "same-origin", "Content-Type": "text/html; charset=utf-8" } });
}

// Returns a Response to send instead of the page, or null when the request may continue.
export async function testAccessGate(request, env, nowMs = Date.now()) {
  if (env.META_CAPI_PREVIEW !== "1") return null;
  const key = String(env.META_TEST_ACCESS_KEY || "");
  if (key.length < MIN_KEY_LENGTH) {
    return new Response("Test Worker locked: access key is not configured.", { status: 503, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const url = new URL(request.url);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  if (url.pathname === LOGIN_PATH) {
    if (request.method === "GET" || request.method === "HEAD") return loginPage();
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: baseHeaders });
    if (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return new Response("Forbidden", { status: 403, headers: baseHeaders });
    if (tooManyFailures(ip, nowMs)) return loginPage(429, "محاولات كثيرة. حاول بعد 10 دقائق.");
    let typed = "";
    try {
      const text = await request.text();
      if (text.length <= 1024) typed = new URLSearchParams(text).get("key") || "";
    } catch {}
    if (!sameText(await hmacHex(key, typed), await hmacHex(key, key))) {
      noteFailure(ip, nowMs);
      return loginPage(401, "المفتاح غير صحيح.");
    }
    failures.delete(ip);
    const expiry = Math.floor(nowMs / 1000) + SESSION_SECONDS;
    const value = `${expiry}.${await hmacHex(key, `pk-test-access:${expiry}`)}`;
    return new Response(null, {
      status: 303,
      headers: { ...baseHeaders, Location: "/", "Set-Cookie": `${COOKIE}=${value}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict` }
    });
  }

  if (await validSession(request, key, nowMs)) return null;
  if (request.method === "GET" && (request.headers.get("Accept") || "").includes("text/html")) {
    return new Response(null, { status: 303, headers: { ...baseHeaders, Location: LOGIN_PATH } });
  }
  return new Response("Unauthorized", { status: 401, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}
