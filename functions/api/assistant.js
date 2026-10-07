import { ASSISTANT_SYSTEM_PROMPT } from "../_assistant-prompt.js";
import { ASSISTANT_TOOLS, validToolInput } from "../_assistant-tools.js";

const encoder = new TextEncoder();
const unavailable = "المساعد غير متاح حاليًا. تقدر تتواصل مع المكتبة من صفحة التواصل.";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
const fail = (status, message) => Object.assign(new Error(message), { status });
const bounded = (value, fallback, max) => Number.isInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), max) : fallback;
export const redactAssistantMessage = value => value
  .replace(/(?:https?:\/\/[^\s/]+)?\/order\/[a-f0-9]{64}\b/gi, "[رابط طلب خاص محذوف]")
  .replace(/\b[a-f0-9]{64}\b/gi, "[رمز خاص محذوف]")
  .replace(/(?:\+?20)?\b01[0125]\d{8}\b/g, "[رقم هاتف محذوف]")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[بريد إلكتروني محذوف]");

export function assistantConfigured(env) {
  return env.ASSISTANT_ENABLED === "1" && Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL && env.ANALYTICS_DB &&
    String(env.ASSISTANT_SESSION_SECRET || "").length >= 32 && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
}
export function assistantConfigResponse(request, env) {
  if (request.method !== "GET") return json({ message: "طريقة الطلب غير مسموحة." }, 405);
  return json({ enabled: assistantConfigured(env), siteKey: assistantConfigured(env) ? env.TURNSTILE_SITE_KEY : "" });
}
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function signingKey(secret) { return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }

export async function signHistory(messages, secret, now = Date.now()) {
  const kept = messages.slice(-6);
  let bytes = encoder.encode(JSON.stringify({ exp: now + 1800000, messages: kept }));
  while (bytes.length > 16000 && kept.length > 2) {
    kept.splice(0, 2);
    bytes = encoder.encode(JSON.stringify({ exp: now + 1800000, messages: kept }));
  }
  const payload = b64(bytes);
  return payload + "." + b64(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload))));
}
export async function readHistory(token, secret, now = Date.now()) {
  if (!token) return [];
  try {
    if (typeof token !== "string" || token.length > 24000) throw new Error();
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra || !await crypto.subtle.verify("HMAC", await signingKey(secret), unb64(signature), encoder.encode(payload))) throw new Error();
    const data = JSON.parse(new TextDecoder().decode(unb64(payload)));
    if (!Number.isFinite(data.exp) || data.exp <= now || data.exp > now + 1800000 || !Array.isArray(data.messages) || data.messages.length > 6 ||
      !data.messages.every(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 2000)) throw new Error();
    return data.messages;
  } catch { throw fail(400, "انتهت جلسة المحادثة. ابدأ محادثة جديدة."); }
}

async function readBody(request) {
  if (Number(request.headers.get("Content-Length")) > 30000) throw fail(413, "الرسالة طويلة جدًا.");
  const reader = request.body?.getReader();
  if (!reader) throw fail(400, "اكتب سؤالك أولًا.");
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 30000) { await reader.cancel(); throw fail(413, "الرسالة طويلة جدًا."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw fail(400, "طلب غير صالح."); }
}

async function reserve(db, key, limit) {
  const result = await db.prepare("INSERT INTO assistant_usage (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count")
    .bind(key, Date.now() + 172800000, limit).first();
  if (!result) throw fail(429, "المساعد مشغول حاليًا. حاول لاحقًا أو تواصل مع المكتبة.");
}
async function admission(request, env, body, signal) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) throw fail(503, unavailable);
  const digest = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(ip + ":" + env.ASSISTANT_SESSION_SECRET))));
  await reserve(env.ANALYTICS_DB, `ip:${Math.floor(Date.now() / 600000)}:${digest}`, 12);
  const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken, remoteip: ip })
  });
  if (!verification.ok) throw fail(503, unavailable);
  const result = await verification.json();
  if (!result.success || result.hostname !== new URL(request.url).hostname || result.action !== "library-assistant") throw fail(403, "أكمل التحقق وحاول تاني.");
  // One reservation covers the entire bounded model/tool loop. D1 makes the daily cap global.
  await reserve(env.ANALYTICS_DB, `day:${new Date().toISOString().slice(0, 10)}`, bounded(env.ASSISTANT_DAILY_REQUEST_LIMIT, 50, 1000));
  await env.ANALYTICS_DB.prepare("DELETE FROM assistant_usage WHERE expires < ?").bind(Date.now()).run();
}

export async function assistantChatResponse({ request, env }, executeTool) {
  if (request.method !== "POST") return json({ message: "طريقة الطلب غير مسموحة." }, 405);
  if (!assistantConfigured(env)) return json({ message: unavailable }, 503);
  if (request.headers.get("Origin") !== new URL(request.url).origin || !request.headers.get("Content-Type")?.startsWith("application/json")) return json({ message: "طلب غير مسموح." }, 403);
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["message", "conversationToken", "turnstileToken"].includes(k)) ||
      typeof body.message !== "string" || !body.message.trim() || body.message.length > 1000 || typeof body.turnstileToken !== "string" || body.turnstileToken.length > 2048 || !body.turnstileToken) throw fail(400, "اكتب سؤالًا قصيرًا وأكمل التحقق.");
    const history = await readHistory(body.conversationToken, env.ASSISTANT_SESSION_SECRET);
    // All external requests share a deadline, including anti-abuse verification.
    const signal = AbortSignal.timeout(45000);
    await admission(request, env, body, signal);
    const message = redactAssistantMessage(body.message.trim());
    const messages = [...history, { role: "user", content: message }];
    const cards = new Map(); const links = new Map();
    let reply = "";
    for (let round = 0; round < 3; round += 1) {
      const payload = JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: 700, system: ASSISTANT_SYSTEM_PROMPT, tools: ASSISTANT_TOOLS, ...(round === 2 ? { tool_choice: { type: "none" } } : {}), messages });
      if (encoder.encode(payload).length > 90000) throw fail(503, "جرّب سؤالًا أكثر تحديدًا أو تواصل مع المكتبة.");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal, headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: payload
      });
      if (!response.ok) throw fail(503, unavailable);
      const data = await response.json();
      if (!Array.isArray(data.content) || data.content.length > 20) throw fail(503, unavailable);
      const calls = data.content.filter(c => c.type === "tool_use");
      if (!calls.length) {
        if (data.stop_reason !== "end_turn") throw fail(503, "تعذر إكمال الرد. جرّب سؤالًا أكثر تحديدًا.");
        reply = data.content.filter(c => c.type === "text" && typeof c.text === "string").map(c => c.text).join("\n").slice(0, 2000);
        break;
      }
      if (calls.length > 4 || round === 2) throw fail(503, "جرّب سؤالًا أكثر تحديدًا أو تواصل مع المكتبة.");
      messages.push({ role: "assistant", content: data.content });
      const results = [];
      for (const call of calls) {
        let result;
        try { result = validToolInput(call.name, call.input) ? await executeTool(call.name, call.input, signal) : { error: "invalid_tool_input" }; }
        catch { result = { error: "source_unavailable", message: "تعذر التأكد من البيانات الحالية. يرجى التواصل مع المكتبة." }; }
        for (const product of result.products || []) { if (cards.size < 6 || cards.has(product.id)) cards.set(product.id, product); }
        if (result.url) links.set(result.url, { url: result.url, label: call.name === "get_order_status" ? "متابعة الطلب" : call.name === "handoff_to_human" ? "التواصل مع المكتبة" : "السياسة كاملة" });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result), ...(result.error ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
    if (!reply) throw fail(503, unavailable);
    // Signed text history only. Tool results and private order capabilities never come from the browser.
    const conversationToken = await signHistory([...history, { role: "user", content: message }, { role: "assistant", content: reply }], env.ASSISTANT_SESSION_SECRET);
    return json({ reply, products: [...cards.values()], links: [...links.values()], conversationToken });
  } catch (error) {
    // Never expose provider bodies, prompts, chat content, credentials, or database errors.
    return json({ message: error.status ? error.message : unavailable }, error.status || 503);
  }
}
