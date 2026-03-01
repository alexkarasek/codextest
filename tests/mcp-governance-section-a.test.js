import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import agenticRouter from "../server/routes/agentic.js";
import {
  listResolvedMcpServers,
  resolveMcpToolPolicy,
  updateMcpServerGovernance
} from "../lib/mcpStatus.js";

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

async function withTempMcpSettings(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-settings-"));
  const settingsPath = path.join(tempDir, "mcp.json");
  const original = process.env.MCP_SETTINGS_PATH;
  process.env.MCP_SETTINGS_PATH = settingsPath;
  try {
    return await fn(settingsPath);
  } finally {
    if (original === undefined) delete process.env.MCP_SETTINGS_PATH;
    else process.env.MCP_SETTINGS_PATH = original;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("resolveMcpToolPolicy supports exact and wildcard trust rules", async () => {
  const blocked = resolveMcpToolPolicy({ trust_state: "blocked" }, "knowledge.list");
  assert.equal(blocked.allowed, false);

  const denied = resolveMcpToolPolicy(
    { trust_state: "trusted", deny_tools: ["knowledge.*"] },
    "knowledge.get"
  );
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /denied by policy rule/i);

  const allowed = resolveMcpToolPolicy(
    { trust_state: "trusted", allow_tools: ["personas.*"] },
    "personas.list"
  );
  assert.equal(allowed.allowed, true);

  const notAllowed = resolveMcpToolPolicy(
    { trust_state: "trusted", allow_tools: ["personas.*"] },
    "knowledge.list"
  );
  assert.equal(notAllowed.allowed, false);
  assert.match(notAllowed.reason, /allow list/i);

  const defaultAllow = resolveMcpToolPolicy(
    { trust_state: "trusted", allow_tools: [], deny_tools: ["personas.list"] },
    "knowledge.list"
  );
  assert.equal(defaultAllow.allowed, true);
});

test("resolveMcpToolPolicy is deterministic and side-effect free for same input", async () => {
  const server = {
    trust_state: "trusted",
    risk_tier: "medium",
    allow_tools: ["knowledge.*"],
    deny_tools: ["knowledge.get"]
  };
  const before = JSON.stringify(server);
  const first = resolveMcpToolPolicy(server, "knowledge.list");
  const second = resolveMcpToolPolicy(server, "knowledge.list");
  const after = JSON.stringify(server);

  assert.deepEqual(first, second);
  assert.equal(before, after);
});

test("resolved MCP servers expose default governance metadata", async () => {
  await withTempMcpSettings(async () => {
    const servers = await listResolvedMcpServers({ includeTools: false });
    const platform = servers.find((row) => row.id === "platform");
    assert.ok(platform);
    assert.equal(platform.trust_state, "untrusted");
    assert.equal(platform.risk_tier, "medium");
    assert.deepEqual(platform.allow_tools, []);
    assert.deepEqual(platform.deny_tools, []);
    assert.equal(platform.owner, "local");
    assert.equal(typeof platform.created_at, "string");
    assert.equal(typeof platform.updated_at, "string");
  });
});

test("PATCH /mcp/servers/:serverId persists governance metadata and GET tools returns it", async () => {
  await withTempMcpSettings(async () => {
    const patchHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId", "patch");
    const toolsHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/tools", "get");

    const patchReq = {
      method: "PATCH",
      path: "/mcp/servers/platform",
      params: { serverId: "platform" },
      body: {
        trust_state: "trusted",
        risk_tier: "low",
        allow_tools: ["knowledge.*"],
        deny_tools: ["knowledge.get"],
        notes: "Trusted but narrowed to list operations."
      }
    };
    const patchRes = createMockRes();
    await patchHandler(patchReq, patchRes);

    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.body?.ok, true);
    assert.equal(patchRes.body?.data?.server?.trust_state, "trusted");
    assert.equal(patchRes.body?.data?.server?.risk_tier, "low");

    const toolsReq = {
      method: "GET",
      path: "/mcp/servers/platform/tools",
      params: { serverId: "platform" },
      query: {}
    };
    const toolsRes = createMockRes();
    await toolsHandler(toolsReq, toolsRes);

    assert.equal(toolsRes.statusCode, 200);
    assert.equal(toolsRes.body?.ok, true);
    assert.equal(toolsRes.body?.data?.server?.trust_state, "trusted");
    assert.deepEqual(toolsRes.body?.data?.server?.allow_tools, ["knowledge.*"]);
    assert.deepEqual(toolsRes.body?.data?.server?.deny_tools, ["knowledge.get"]);
    assert.ok(Array.isArray(toolsRes.body?.data?.tools));
  });
});

test("PATCH /mcp/servers/:serverId rejects invalid enum values", async () => {
  await withTempMcpSettings(async () => {
    const patchHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId", "patch");
    const res = createMockRes();
    await patchHandler(
      {
        method: "PATCH",
        path: "/mcp/servers/platform",
        params: { serverId: "platform" },
        body: { trust_state: "unsafe" }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.equal(res.body?.error?.code, "VALIDATION_ERROR");
    assert.match(String(res.body?.error?.message || ""), /trust_state/i);
  });
});

test("PATCH /mcp/servers/:serverId rejects immutable fields", async () => {
  await withTempMcpSettings(async () => {
    const patchHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId", "patch");
    const res = createMockRes();
    await patchHandler(
      {
        method: "PATCH",
        path: "/mcp/servers/platform",
        params: { serverId: "platform" },
        body: { owner: "admin" }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.match(String(res.body?.error?.message || ""), /immutable/i);
  });
});

test("PATCH /mcp/servers/:serverId rejects blocked to trusted direct transition", async () => {
  await withTempMcpSettings(async () => {
    await updateMcpServerGovernance("platform", { trust_state: "blocked" });
    const patchHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId", "patch");
    const res = createMockRes();
    await patchHandler(
      {
        method: "PATCH",
        path: "/mcp/servers/platform",
        params: { serverId: "platform" },
        body: { trust_state: "trusted" }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.match(String(res.body?.error?.message || ""), /blocked -> trusted/i);
  });
});

test("PATCH /mcp/servers/:serverId requires allow/deny arrays to be string arrays", async () => {
  await withTempMcpSettings(async () => {
    const patchHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId", "patch");
    const res = createMockRes();
    await patchHandler(
      {
        method: "PATCH",
        path: "/mcp/servers/platform",
        params: { serverId: "platform" },
        body: { allow_tools: ["knowledge.list", null] }
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.ok, false);
    assert.match(String(res.body?.error?.message || ""), /allow_tools/i);
  });
});

test("POST /mcp/servers/:serverId/call denies tool execution when trust policy blocks it", async () => {
  await withTempMcpSettings(async () => {
    const patchHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId", "patch");
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");

    await patchHandler(
      {
        method: "PATCH",
        path: "/mcp/servers/platform",
        params: { serverId: "platform" },
        body: { trust_state: "blocked" }
      },
      createMockRes()
    );

    const callReq = {
      method: "POST",
      path: "/mcp/servers/platform/call",
      params: { serverId: "platform" },
      body: {
        tool: "knowledge.list",
        input: {}
      }
    };
    const callRes = createMockRes();
    await callHandler(callReq, callRes);

    assert.equal(callRes.statusCode, 403);
    assert.equal(callRes.body?.ok, false);
    assert.equal(callRes.body?.error?.code, "MCP_POLICY_DENIED");
  });
});
