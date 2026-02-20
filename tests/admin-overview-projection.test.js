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
  const routeLayer = layer.route.stack[layer.route.stack.length - 1];
  return routeLayer.handle;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-admin-overview-"));
  process.chdir(tmpDir);

  const debateId = "20260220-120000-demo-debate";
  const simpleId = "20260220-120500-simple-chat";
  await fs.mkdir(path.join(tmpDir, "data", "debates", debateId), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "data", "simple-chats", simpleId), { recursive: true });

  await fs.writeFile(
    path.join(tmpDir, "data", "debates", debateId, "session.json"),
    JSON.stringify(
      {
        debateId,
        conversationMode: "debate",
        topic: "Demo topic",
        context: "Demo context",
        settings: { rounds: 2, model: "gpt-4.1-mini" },
        personas: [{ id: "p1", displayName: "Persona One" }],
        status: "completed",
        createdAt: "2026-02-20T12:00:00.000Z",
        completedAt: "2026-02-20T12:05:00.000Z",
        turns: [{ type: "persona", round: 1, speakerId: "p1", displayName: "Persona One", text: "Hello", createdAt: "2026-02-20T12:01:00.000Z" }]
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(path.join(tmpDir, "data", "debates", debateId, "transcript.md"), "# Transcript\n\nDemo", "utf8");
  await fs.writeFile(
    path.join(tmpDir, "data", "debates", debateId, "messages.jsonl"),
    `${JSON.stringify({
      ts: "2026-02-20T12:01:00.000Z",
      type: "response",
      response: { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }
    })}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(tmpDir, "data", "debates", debateId, "chat.jsonl"), "", "utf8");

  await fs.writeFile(
    path.join(tmpDir, "data", "simple-chats", simpleId, "session.json"),
    JSON.stringify(
      {
        chatId: simpleId,
        conversationMode: "simple",
        title: "Simple Chat",
        context: "Demo",
        settings: { model: "gpt-4.1-mini" },
        createdAt: "2026-02-20T12:05:00.000Z",
        updatedAt: "2026-02-20T12:06:00.000Z"
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmpDir, "data", "simple-chats", simpleId, "messages.jsonl"),
    `${JSON.stringify({ ts: "2026-02-20T12:05:30.000Z", role: "user", content: "hi" })}\n${JSON.stringify({
      ts: "2026-02-20T12:05:40.000Z",
      role: "assistant",
      content: "hello",
      usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 }
    })}\n`,
    "utf8"
  );
});

test.after(async () => {
  process.chdir(projectRoot);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

test("/api/admin/overview includes unified projected conversations", async () => {
  const adminRouterModule = await import(pathToFileURL(path.join(projectRoot, "server", "routes", "admin.js")).href + `?t=${Date.now()}`);
  const handler = getRouteHandler(adminRouterModule.default, "/overview", "get");
  const req = { query: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  const data = res.body?.data || {};
  assert.ok(Array.isArray(data.conversations));
  assert.ok(data.conversations.length >= 2);

  const debateRow = data.conversations.find((row) => row.conversationType === "debate");
  assert.ok(debateRow);
  assert.equal(debateRow.transcriptCapable, true);

  const simpleRow = data.conversations.find((row) => row.conversationType === "simple-chat");
  assert.ok(simpleRow);
  assert.equal(simpleRow.transcriptCapable, false);
});
