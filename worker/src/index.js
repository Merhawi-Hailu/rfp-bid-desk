// RFP Bid Desk API, a Cloudflare Worker.
//
// Routes:
//   POST /api/login    { password }            -> { token, expiresAt }
//   POST /api/analyze  { task, ...data }        -> { result }   (needs Authorization: Bearer <token>)
//   GET  /api/health                            -> { ok: true }
//
// Secrets (set with `npx wrangler secret put NAME`, never in code):
//   ANTHROPIC_API_KEY  Claude API key
//   DEMO_PASSWORD      the shared demo password
//   SESSION_SECRET     a long random string used to sign login tokens
//
// Plain settings (wrangler.toml [vars]):
//   ALLOWED_ORIGINS    comma separated list of web origins allowed to call the API
//   MODEL              Claude model id
//   SESSION_HOURS      how long a login lasts (default 8)

import { SYSTEM, TASKS, parseJson } from "./prompts.js";

const MAX_BODY_BYTES = 600_000;
const enc = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? corsHeaders(origin) : null;

    if (request.method === "OPTIONS") {
      return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, configured: isConfigured(env) }, 200, cors);
    }
    // Browsers always send Origin on cross-site POST. Anything else is refused.
    if (!cors) return json({ error: "origin_not_allowed" }, 403, null);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
    if (!isConfigured(env)) return json({ error: "server_not_configured" }, 503, cors);

    try {
      if (url.pathname === "/api/login") return await login(request, env, cors);
      if (url.pathname === "/api/analyze") return await analyze(request, env, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      const code = err && err.code ? err.code : "server_error";
      const status = { bad_request: 400, too_large: 413, unauthorized: 401 }[code] || 500;
      if (status === 500) console.error("server_error", err && err.message);
      return json({ error: code }, status, cors);
    }
  },
};

/* ---------------- routes ---------------- */

async function login(request, env, cors) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await allow(env.LOGIN_LIMITER, "login:" + ip))) return json({ error: "rate_limited" }, 429, cors);

  const body = await readJson(request, 10_000);
  const given = typeof body.password === "string" ? body.password : "";
  if (!(await safeEqual(given, env.DEMO_PASSWORD, env.SESSION_SECRET))) {
    return json({ error: "wrong_password" }, 401, cors);
  }
  const hours = Math.min(24, Math.max(1, Number(env.SESSION_HOURS) || 8));
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const token = await signToken({ exp, jti: crypto.randomUUID() }, env.SESSION_SECRET);
  return json({ token, expiresAt: exp * 1000 }, 200, cors);
}

async function analyze(request, env, cors) {
  const session = await verifyToken(bearer(request), env.SESSION_SECRET);
  if (!session) return json({ error: "unauthorized" }, 401, cors);
  if (!(await allow(env.API_LIMITER, "api:" + session.jti))) return json({ error: "rate_limited" }, 429, cors);

  const body = await readJson(request, MAX_BODY_BYTES);
  const task = TASKS[body.task];
  if (!task) return json({ error: "bad_request" }, 400, cors);
  const prompt = task.build(body);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.MODEL || "claude-sonnet-5-5",
      max_tokens: task.maxTokens,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    // Log the status only. Never log tender or CV content.
    console.error("anthropic_error", res.status);
    const code = res.status === 429 || res.status === 529 ? "busy" : res.status === 401 ? "server_not_configured" : "upstream_error";
    return json({ error: code }, 502, cors);
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const result = parseJson(text);
  if (!result || typeof result !== "object") return json({ error: "invalid_json" }, 502, cors);
  return json({ result, truncated: data.stop_reason === "max_tokens" }, 200, cors);
}

/* ---------------- security helpers ---------------- */

function isConfigured(env) {
  return Boolean(env.ANTHROPIC_API_KEY && env.DEMO_PASSWORD && env.SESSION_SECRET && String(env.SESSION_SECRET).length >= 32);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(cors || {}),
    },
  });
}

async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw Object.assign(new Error("too_large"), { code: "too_large" });
  const text = await request.text();
  if (enc.encode(text).length > maxBytes) throw Object.assign(new Error("too_large"), { code: "too_large" });
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw Object.assign(new Error("bad_json"), { code: "bad_request" });
  }
}

/** Uses a Cloudflare rate limiting binding when one is configured. */
async function allow(limiter, key) {
  if (!limiter || typeof limiter.limit !== "function") return true;
  try { const { success } = await limiter.limit({ key }); return success; } catch { return true; }
}

function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return body + "." + b64url(sig);
}

export async function verifyToken(token, secret) {
  if (!token || token.length > 2000 || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Compares two strings in constant time by comparing their HMACs. */
export async function safeEqual(a, b, secret) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const key = await hmacKey(secret);
  const [x, y] = await Promise.all([crypto.subtle.sign("HMAC", key, enc.encode(a)), crypto.subtle.sign("HMAC", key, enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
