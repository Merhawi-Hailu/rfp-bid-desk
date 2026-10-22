// RFP Bid Desk API, a Cloudflare Worker.
//
// Routes:
//   POST /api/login    { password }            -> { token, expiresAt }
//   POST /api/analyze  { task, ...data }        -> { result }   (needs Authorization: Bearer <token>)
//   GET  /api/health                            -> { ok: true }
//
// Secrets (set with `npx wrangler secret put NAME`, never in code):
//   DEMO_PASSWORD      the shared demo password
//   SESSION_SECRET     a long random string used to sign login tokens
//   ANTHROPIC_API_KEY  only needed when AI_PROVIDER is "anthropic"
//
// Plain settings (wrangler.toml [vars]):
//   ALLOWED_ORIGINS    comma separated list of web origins allowed to call the API
//   AI_PROVIDER        "workers-ai" (free, default) or "anthropic" (Claude, paid)
//   WORKERS_AI_MODEL   Cloudflare Workers AI model id
//   CLAUDE_MODEL       Claude model id
//   SESSION_HOURS      how long a login lasts (default 8)
//
// Binding (wrangler.toml [ai]):
//   AI                 Cloudflare Workers AI. Needs no API key.

import { SYSTEM, TASKS, parseJson } from "./prompts.js";
import { listBids, saveBid, deleteBid, clearExamples, STATUSES, REASONS } from "./bids.js";

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
      if (url.pathname.startsWith("/api/bids/")) return await bids(url.pathname.slice(10), request, env, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      const code = err && err.code ? err.code : "server_error";
      const status = { bad_request: 400, too_large: 413, unauthorized: 401, tracker_full: 409 }[code] || 500;
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
  const provider = providerOf(env);
  const prompt = task.build(body, PROMPT_BYTES[provider]);

  const out = provider === "anthropic"
    ? await runClaude(env, prompt, task.maxTokens)
    : await runWorkersAi(env, prompt, task.maxTokens);
  if (out.error) return json({ error: out.error }, out.error === "daily_limit" ? 429 : 502, cors);

  const result = out.value && typeof out.value === "object" ? out.value : parseJson(out.text);
  if (!result || typeof result !== "object") return json({ error: "invalid_json" }, 502, cors);
  return json({ result, truncated: Boolean(out.truncated), provider }, 200, cors);
}

/* ---------------- bid tracker ---------------- */

async function bids(action, request, env, cors) {
  const session = await verifyToken(bearer(request), env.SESSION_SECRET);
  if (!session) return json({ error: "unauthorized" }, 401, cors);
  if (!env.BIDS || typeof env.BIDS.get !== "function") return json({ error: "tracker_not_configured" }, 503, cors);
  if (!(await allow(env.BIDS_LIMITER, "bids:" + session.jti))) return json({ error: "rate_limited" }, 429, cors);
  const body = await readJson(request, 20_000);
  if (action === "list") return json({ bids: await listBids(env.BIDS), statuses: STATUSES, reasons: REASONS }, 200, cors);
  if (action === "save") return json({ bid: await saveBid(env.BIDS, body.bid) }, 200, cors);
  if (action === "delete") { await deleteBid(env.BIDS, body.id); return json({ ok: true }, 200, cors); }
  if (action === "clear-examples") return json({ removed: await clearExamples(env.BIDS) }, 200, cors);
  return json({ error: "not_found" }, 404, cors);
}

/* ---------------- AI providers ---------------- */

// How much text each provider is given per request. Workers AI is kept smaller
// so the free daily allowance covers more demo runs.
const PROMPT_BYTES = { "workers-ai": 120_000, anthropic: 250_000 };

function providerOf(env) {
  return String(env.AI_PROVIDER || "workers-ai").toLowerCase() === "anthropic" ? "anthropic" : "workers-ai";
}

async function runWorkersAi(env, prompt, maxTokens) {
  try {
    const r = await env.AI.run(env.WORKERS_AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
    });
    const resp = r && r.response;
    return typeof resp === "string" ? { text: resp } : { value: resp };
  } catch (err) {
    const msg = String((err && err.message) || err);
    // Log a short reason only. Never log tender or CV content.
    console.error("workers_ai_error", msg.slice(0, 200));
    if (/4006|neuron|daily free allocation/i.test(msg)) return { error: "daily_limit" };
    if (/3040|capacity|overloaded|too many/i.test(msg)) return { error: "busy" };
    return { error: "upstream_error" };
  }
}

async function runClaude(env, prompt, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    // Log the status only. Never log tender or CV content.
    console.error("anthropic_error", res.status);
    return { error: res.status === 429 || res.status === 529 ? "busy" : res.status === 401 ? "server_not_configured" : "upstream_error" };
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return { text, truncated: data.stop_reason === "max_tokens" };
}

/* ---------------- security helpers ---------------- */

function isConfigured(env) {
  const base = Boolean(env.DEMO_PASSWORD && env.SESSION_SECRET && String(env.SESSION_SECRET).length >= 32);
  const ai = providerOf(env) === "anthropic" ? Boolean(env.ANTHROPIC_API_KEY) : Boolean(env.AI && typeof env.AI.run === "function");
  return base && ai;
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
