import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import YAML from "yaml";
import docsRouter from "../src/docs/docsRouter.js";
import supportRouter from "../server/routes/support.js";
import { requireAuth } from "../server/authMiddleware.js";

function getRouteHandler(router, routePath, method) {
  const layer = router.stack.find(
    (entry) => entry.route && entry.route.path === routePath && entry.route.methods[String(method || "").toLowerCase()]
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  const routeLayer = layer.route.stack[layer.route.stack.length - 1];
  return routeLayer.handle;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    sent: undefined,
    filePath: undefined,
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
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
    sendFile(filePath) {
      this.filePath = filePath;
      return this;
    }
  };
  return res;
}

test("/docs/api handler returns HTML response", async () => {
  const handler = getRouteHandler(docsRouter, "/api", "get");
  const req = { method: "GET", path: "/docs/api", headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-type"] || ""), /text\/html/i);
  assert.match(String(res.sent || ""), /swagger-ui/i);
});

test("/docs/openapi.yaml points to valid yaml file", async () => {
  const handler = getRouteHandler(docsRouter, "/openapi.yaml", "get");
  const req = { method: "GET", path: "/docs/openapi.yaml", headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.ok(res.filePath, "Expected sendFile path to be set");
  const raw = await fs.readFile(res.filePath, "utf8");
  const parsed = YAML.parse(raw);
  assert.equal(parsed.openapi, "3.0.3");
  assert.ok(parsed.paths["/api/support/messages"]);
  assert.ok(parsed.paths["/api/agentic/workflows"]);
  assert.ok(parsed.paths["/api/settings/models"]);
  assert.ok(parsed.paths["/runs/compare/{runA}/{runB}"]);
});

test("requireAuth rejects unauthenticated request with 401", async () => {
  const req = { auth: { user: null, method: null } };
  const res = createMockRes();
  let calledNext = false;

  await requireAuth(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.ok, false);
});

test("/api/support/messages handler returns citations for docs files", async () => {
  const handler = getRouteHandler(supportRouter, "/messages", "post");
  const req = {
    method: "POST",
    path: "/api/support/messages",
    headers: { "content-type": "application/json" },
    body: { message: "How do I create a persona chat?" },
    auth: { user: { id: "usr_test", username: "tester" }, method: "session", apiKey: null }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(Array.isArray(res.body?.data?.citations));
  assert.ok(res.body.data.citations.length > 0);
  for (const citation of res.body.data.citations) {
    assert.ok(citation.file === "README.md" || String(citation.file).startsWith("docs/"));
    assert.ok(String(citation.heading || "").length > 0);
    assert.ok(String(citation.excerpt || "").length > 0);
  }
});
