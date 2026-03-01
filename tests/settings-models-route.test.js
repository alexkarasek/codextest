import test from "node:test";
import assert from "node:assert/strict";
import settingsRouter from "../server/routes/settings.js";

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

test("/api/settings/models returns model catalog and image status", async () => {
  const handler = getRouteHandler(settingsRouter, "/models", "get");
  const req = { method: "GET", path: "/api/settings/models", headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(Array.isArray(res.body?.data?.models));
  assert.ok(res.body.data.models.length > 0);
  assert.ok(res.body.data.models.some((row) => row.id === "gpt-5-mini"));
  assert.equal(typeof res.body?.data?.imageGeneration?.available, "boolean");
});

test("/api/settings/agent-providers returns provider health and agent manifests", async () => {
  const handler = getRouteHandler(settingsRouter, "/agent-providers", "get");
  const req = { method: "GET", path: "/api/settings/agent-providers", headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(Array.isArray(res.body?.data?.providers));
  assert.ok(Array.isArray(res.body?.data?.agents));
  assert.ok(Array.isArray(res.body?.data?.targets));
  assert.equal(typeof res.body?.data?.routing?.configuredRouterAgentId, "string");
  assert.equal(typeof res.body?.data?.routing?.configuredRouterAgentName, "string");
  assert.equal(typeof res.body?.data?.routing?.configuredRouterAgentVersion, "string");
  assert.equal(typeof res.body?.data?.routing?.configuredRouterApplicationName, "string");
  assert.equal(typeof res.body?.data?.routing?.configuredRouterApplicationVersion, "string");
  assert.ok(res.body.data.providers.some((row) => row.id === "local"));
  assert.ok(res.body.data.agents.some((row) => row.id === "support-concierge"));
  assert.ok(res.body.data.targets.some((row) => row.type === "model"));
});
