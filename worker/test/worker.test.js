// Run with: npm test   (Node 20 or newer)
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { verifyToken } from "../src/index.js";
import { parseJson } from "../src/prompts.js";

const ORIGIN = "https://merhawi-hailu.github.io";
const TENDER = "Northvale tender. ".repeat(30);

/** A stand-in for the Cloudflare Workers AI binding. */
function fakeAi(reply) {
  const calls = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input });
      if (reply instanceof Error) throw reply;
      return { response: reply };
    },
  };
}
const baseEnv = (extra = {}) => ({
  ALLOWED_ORIGINS: ORIGIN,
  DEMO_PASSWORD: "correct horse battery",
  SESSION_SECRET: "x".repeat(40),
  WORKERS_AI_MODEL: "test-llama",
  AI: fakeAi('{"client":"Northvale"}'),
  ...extra,
});
const post = (path, body, headers = {}) =>
  new Request("https://api.example.workers.dev" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
async function login(env) {
  const r = await worker.fetch(post("/api/login", { password: env.DEMO_PASSWORD }), env);
  assert.equal(r.status, 200);
  return { Authorization: "Bearer " + (await r.json()).token };
}

test("refuses unknown origins", async () => {
  const r = await worker.fetch(post("/api/login", { password: "x" }, { Origin: "https://evil.example" }), baseEnv());
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
});

test("refuses a wrong password", async () => {
  const r = await worker.fetch(post("/api/login", { password: "nope" }), baseEnv());
  assert.equal(r.status, 401);
});

test("reports when secrets or the AI binding are missing", async () => {
  assert.equal((await worker.fetch(post("/api/login", { password: "x" }), { ALLOWED_ORIGINS: ORIGIN })).status, 503);
  assert.equal((await worker.fetch(post("/api/login", { password: "x" }), baseEnv({ AI: undefined }))).status, 503);
  assert.equal((await worker.fetch(post("/api/login", { password: "x" }), baseEnv({ AI_PROVIDER: "anthropic" }))).status, 503);
});

test("refuses analysis without a token, or with a forged one", async () => {
  const env = baseEnv();
  assert.equal((await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER }), env)).status, 401);
  const forged = { Authorization: "Bearer eyJleHAiOjk5OTk5OTk5OTl9.AAAA" };
  assert.equal((await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER }, forged), env)).status, 401);
});

test("free provider: logs in and analyses with Workers AI, no API key needed", async () => {
  const env = baseEnv();
  const auth = await login(env);
  const tok = auth.Authorization.slice(7);
  assert.ok(await verifyToken(tok, env.SESSION_SECRET));
  const r = await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER, tenderName: "t.pdf" }, auth), env);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j.result, { client: "Northvale" });
  assert.equal(j.provider, "workers-ai");
  assert.equal(env.AI.calls[0].model, "test-llama");
  assert.equal(env.AI.calls[0].input.messages[0].role, "system");
  assert.match(env.AI.calls[0].input.messages[1].content, /<TENDER/);
  assert.ok(env.AI.calls[0].input.max_tokens > 1000);
});

test("free provider: keeps prompts within the smaller budget", async () => {
  const env = baseEnv();
  const auth = await login(env);
  const r = await worker.fetch(post("/api/analyze", { task: "extract", tender: "a".repeat(220_000) }, auth), env);
  assert.equal(r.status, 200);
  assert.ok(new TextEncoder().encode(env.AI.calls[0].input.messages[1].content).length <= 120_000);
});

test("free provider: reports the daily allowance running out", async () => {
  const env = baseEnv({ AI: fakeAi(new Error("AiError: 4006: you have used up your daily free allocation of 10,000 neurons")) });
  const auth = await login(env);
  const r = await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER }, auth), env);
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, "daily_limit");
});

test("Claude provider: key stays on the server", async () => {
  const env = baseEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key", CLAUDE_MODEL: "test-claude" });
  const auth = await login(env);
  let sent;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent = { url, init };
    return new Response(JSON.stringify({ content: [{ type: "text", text: '```json\n{"client":"Northvale"}\n```' }], stop_reason: "end_turn" }), { status: 200 });
  };
  try {
    const r = await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER }, auth), env);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).result, { client: "Northvale" });
    assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
    assert.equal(sent.init.headers["x-api-key"], "test-key");
    assert.equal(JSON.parse(sent.init.body).model, "test-claude");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("matching steps fit when many documents are sent", async () => {
  const env = baseEnv({ AI: fakeAi('{"requirements":[]}') });
  const auth = await login(env);
  const docs = Array.from({ length: 30 }, (_, i) => ({ path: `p/${i}.pdf`, text: "project report ".repeat(1000) }));
  const r = await worker.fetch(post("/api/analyze", { task: "work", reqs: [{ id: "EXP-01", requirement: "3 similar projects" }], docs }, auth), env);
  assert.equal(r.status, 200);
});

test("refuses unknown tasks and oversized bodies", async () => {
  const env = baseEnv();
  const auth = await login(env);
  assert.equal((await worker.fetch(post("/api/analyze", { task: "chat", prompt: "hi" }, auth), env)).status, 400);
  assert.equal((await worker.fetch(post("/api/analyze", { task: "extract", tender: "a".repeat(700_000) }, auth), env)).status, 413);
});

test("evidence task: links certificates and compliance documents", async () => {
  const env = baseEnv({ AI: fakeAi('{"mandatory":[],"people":[]}') });
  const auth = await login(env);
  const body = {
    task: "evidence",
    mandatory: [{ id: "MAN-01", requirement: "CSD registration", evidence: "CSD summary report" }],
    people: [{ role: "Lead Data Engineer", name: "Thandi Mokoena", certifications: ["DP-700 or DP-203"] }],
    docs: [{ path: "Certificates/Thandi - DP-700 certificate.pdf", text: "Holder: Thandi Mokoena. DP-700. Expires: 3 November 2026" }],
  };
  const r = await worker.fetch(post("/api/analyze", body, auth), env);
  assert.equal(r.status, 200);
  const prompt = env.AI.calls[0].input.messages[1].content;
  assert.match(prompt, /MAN-01/);
  assert.match(prompt, /Thandi Mokoena/);
  assert.match(prompt, /DOCUMENT 001 \| Certificates\/Thandi - DP-700 certificate.pdf/);
  const empty = await worker.fetch(post("/api/analyze", { task: "evidence", mandatory: [], people: [], docs: [] }, auth), env);
  assert.equal(empty.status, 400);
});

test("certcheck task: reads each person's CV and folder files", async () => {
  const env = baseEnv({ AI: fakeAi('{"people":[]}') });
  const auth = await login(env);
  const body = { task: "certcheck", people: [{ name: "Sipho Dlamini", cvPath: "Consultants/Sipho Dlamini/CV.pdf", cvText: "Certifications: PRINCE2 Foundation (2020).",
    files: [{ path: "Consultants/Sipho Dlamini/PRINCE2 course attendance.pdf", text: "Certificate of attendance. Not an exam certificate." }] }] };
  const r = await worker.fetch(post("/api/analyze", body, auth), env);
  assert.equal(r.status, 200);
  const prompt = env.AI.calls[0].input.messages[1].content;
  assert.match(prompt, /PERSON 1: Sipho Dlamini/);
  assert.match(prompt, /FILE \| Consultants\/Sipho Dlamini\/PRINCE2 course attendance.pdf/);
  assert.match(prompt, /Proof does not match/);
  assert.equal((await worker.fetch(post("/api/analyze", { task: "certcheck", people: [] }, auth), env)).status, 400);
});

test("parses JSON wrapped in text", () => {
  assert.deepEqual(parseJson('Here you go: {"a":1} done'), { a: 1 });
  assert.equal(parseJson("no json here"), null);
});
