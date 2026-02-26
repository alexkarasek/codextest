import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const projectRoot = process.cwd();
let tmpDir = "";

function getRouteHandler(router, routePath, method) {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === routePath && entry.route.methods[String(method || "").toLowerCase()]
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-runs-events-"));
  await fs.mkdir(path.join(tmpDir, "data", "events"), { recursive: true });
  const runId = "run_abc123";
  const lines = [
    {
      timestamp: "2026-02-25T10:00:00.000Z",
      level: "info",
      eventType: "RunStarted",
      requestId: "req_x",
      runId,
      component: "debate-engine",
      latencyMs: null,
      error: null,
      data: { kind: "debate", debateId: runId }
    },
    {
      timestamp: "2026-02-25T10:00:01.000Z",
      level: "info",
      eventType: "LLMCallFinished",
      requestId: "req_x",
      runId,
      component: "llm.chatCompletion",
      latencyMs: 400,
      error: null,
      data: { model: "gpt-5-mini", usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 } }
    },
    {
      timestamp: "2026-02-25T10:00:02.000Z",
      level: "info",
      eventType: "RunFinished",
      requestId: "req_x",
      runId,
      component: "debate-engine",
      latencyMs: null,
      error: null,
      data: { status: "completed", kind: "debate", debateId: runId }
    }
  ];
  await fs.writeFile(path.join(tmpDir, "data", "events", "events.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`, "utf8");
  process.chdir(tmpDir);
});

test.after(async () => {
  process.chdir(projectRoot);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

test("GET /runs returns run summaries", async () => {
  const mod = await import(pathToFileURL(path.join(projectRoot, "server", "routes", "runs.js")).href + `?t=${Date.now()}`);
  const handler = getRouteHandler(mod.default, "/", "get");
  const req = { query: { limit: "10" } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(Array.isArray(res.body?.data?.runs));
  assert.ok(res.body.data.runs.length >= 1);
  const first = res.body.data.runs[0];
  assert.equal(first.runId, "run_abc123");
  assert.equal(first.status, "completed");
  assert.equal(first.tokens.totalTokens, 140);
});

test("GET /runs/:runId returns events for run", async () => {
  const mod = await import(pathToFileURL(path.join(projectRoot, "server", "routes", "runs.js")).href + `?t=${Date.now()}`);
  const handler = getRouteHandler(mod.default, "/:runId", "get");
  const req = { params: { runId: "run_abc123" } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.data?.summary?.runId, "run_abc123");
  assert.ok(Array.isArray(res.body?.data?.events));
  assert.equal(res.body.data.events.length, 3);
});
