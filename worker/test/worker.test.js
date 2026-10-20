// Run with: npm test   (Node 20 or newer)
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { verifyToken } from "../src/index.js";
import { parseJson } from "../src/prompts.js";

const ORIGIN = "https://hailu187.github.io";
const env = {
  ALLOWED_ORIGINS: ORIGIN,
  ANTHROPIC_API_KEY: "test-key",
  DEMO_PASSWORD: "correct horse battery",
  SESSION_SECRET: "x".repeat(40),
  MODEL: "test-model",
};
const post = (path, body, headers = {}) =>
  new Request("https://api.example.workers.dev" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const TENDER = "Northvale tender. ".repeat(30);

test("refuses unknown origins", async () => {
  const r = await worker.fetch(post("/api/login", { password: "x" }, { Origin: "https://evil.example" }), env);
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
});

test("refuses a wrong password", async () => {
  const r = await worker.fetch(post("/api/login", { password: "nope" }), env);
  assert.equal(r.status, 401);
});

test("reports when secrets are missing", async () => {
  const r = await worker.fetch(post("/api/login", { password: "x" }), { ALLOWED_ORIGINS: ORIGIN });
  assert.equal(r.status, 503);
});

test("refuses analysis without a token", async () => {
  const r = await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER }), env);
  assert.equal(r.status, 401);
});

test("refuses a forged token", async () => {
  const r = await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER }, { Authorization: "Bearer eyJleHAiOjk5OTk5OTk5OTl9.AAAA" }), env);
  assert.equal(r.status, 401);
});

test("logs in, then analyses with the key held on the server", async () => {
  const lr = await worker.fetch(post("/api/login", { password: env.DEMO_PASSWORD }), env);
  assert.equal(lr.status, 200);
  const { token } = await lr.json();
  assert.ok(await verifyToken(token, env.SESSION_SECRET));

  let sent;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent = { url, init };
    return new Response(JSON.stringify({ content: [{ type: "text", text: '```json\n{"client":"Northvale"}\n```' }], stop_reason: "end_turn" }), { status: 200 });
  };
  try {
    const r = await worker.fetch(post("/api/analyze", { task: "extract", tender: TENDER, tenderName: "t.pdf" }, { Authorization: "Bearer " + token }), env);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).result, { client: "Northvale" });
    assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
    assert.equal(sent.init.headers["x-api-key"], "test-key");
    const body = JSON.parse(sent.init.body);
    assert.equal(body.model, "test-model");
    assert.match(body.messages[0].content, /<TENDER/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("refuses unknown tasks and oversized bodies", async () => {
  const { token } = await (await worker.fetch(post("/api/login", { password: env.DEMO_PASSWORD }), env)).json();
  const auth = { Authorization: "Bearer " + token };
  assert.equal((await worker.fetch(post("/api/analyze", { task: "chat", prompt: "hi" }, auth), env)).status, 400);
  assert.equal((await worker.fetch(post("/api/analyze", { task: "extract", tender: "a".repeat(700_000) }, auth), env)).status, 413);
});

test("parses JSON wrapped in text", () => {
  assert.deepEqual(parseJson('Here you go: {"a":1} done'), { a: 1 });
  assert.equal(parseJson("no json here"), null);
});
