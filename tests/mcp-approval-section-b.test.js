import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import agenticRouter from "../server/routes/agentic.js";

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

async function withTempMcpEnv(overrides, fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-approval-"));
  const settingsPath = path.join(tempDir, "mcp.json");
  const approvalsPath = path.join(tempDir, "mcp-approvals.json");
  const original = {
    MCP_SETTINGS_PATH: process.env.MCP_SETTINGS_PATH,
    MCP_APPROVALS_PATH: process.env.MCP_APPROVALS_PATH,
    MCP_APPROVAL_MODE: process.env.MCP_APPROVAL_MODE
  };
  process.env.MCP_SETTINGS_PATH = settingsPath;
  process.env.MCP_APPROVALS_PATH = approvalsPath;
  if (Object.prototype.hasOwnProperty.call(overrides || {}, "MCP_APPROVAL_MODE")) {
    process.env.MCP_APPROVAL_MODE = String(overrides.MCP_APPROVAL_MODE);
  } else {
    delete process.env.MCP_APPROVAL_MODE;
  }
  try {
    return await fn({ settingsPath, approvalsPath });
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("mode=off executes MCP tool call directly", async () => {
  await withTempMcpEnv({ MCP_APPROVAL_MODE: "off" }, async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: {} },
        auth: { user: { id: "u1", username: "tester" } }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.ok, true);
    assert.ok(Object.prototype.hasOwnProperty.call(res.body?.data || {}, "output"));
  });
});

test("mode=untrusted_only returns approval_required for untrusted server and does not execute", async () => {
  await withTempMcpEnv({ MCP_APPROVAL_MODE: "untrusted_only" }, async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.get", input: {} }
      },
      res
    );

    assert.equal(res.statusCode, 202);
    assert.equal(res.body?.ok, true);
    assert.equal(res.body?.data?.approval_required, true);
    assert.equal(typeof res.body?.data?.approval_id, "string");
    assert.equal(res.body?.data?.tool_name, "knowledge.get");
  });
});

test("approve endpoint executes pending approved request", async () => {
  await withTempMcpEnv({ MCP_APPROVAL_MODE: "untrusted_only" }, async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const approveHandler = getRouteHandler(agenticRouter, "/mcp/approve", "post");

    const callRes = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: {} }
      },
      callRes
    );
    const approvalId = callRes.body?.data?.approval_id;
    assert.equal(callRes.statusCode, 202);
    assert.ok(approvalId);

    const approveRes = createMockRes();
    await approveHandler(
      {
        method: "POST",
        path: "/mcp/approve",
        body: { approval_id: approvalId }
      },
      approveRes
    );

    assert.equal(approveRes.statusCode, 200);
    assert.equal(approveRes.body?.ok, true);
    assert.ok(Object.prototype.hasOwnProperty.call(approveRes.body?.data || {}, "output"));
  });
});

test("approval cannot be replayed", async () => {
  await withTempMcpEnv({ MCP_APPROVAL_MODE: "untrusted_only" }, async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const approveHandler = getRouteHandler(agenticRouter, "/mcp/approve", "post");

    const callRes = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: {} }
      },
      callRes
    );
    const approvalId = callRes.body?.data?.approval_id;

    await approveHandler(
      {
        method: "POST",
        path: "/mcp/approve",
        body: { approval_id: approvalId }
      },
      createMockRes()
    );

    const replayRes = createMockRes();
    await approveHandler(
      {
        method: "POST",
        path: "/mcp/approve",
        body: { approval_id: approvalId }
      },
      replayRes
    );

    assert.equal(replayRes.statusCode, 409);
    assert.equal(replayRes.body?.ok, false);
    assert.equal(replayRes.body?.error?.code, "MCP_APPROVAL_CONSUMED");
  });
});

test("approve endpoint revalidates Section A policy before execution", async () => {
  await withTempMcpEnv({ MCP_APPROVAL_MODE: "untrusted_only" }, async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const patchHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId", "patch");
    const approveHandler = getRouteHandler(agenticRouter, "/mcp/approve", "post");

    const callRes = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: {} }
      },
      callRes
    );
    const approvalId = callRes.body?.data?.approval_id;
    assert.equal(callRes.statusCode, 202);

    await patchHandler(
      {
        method: "PATCH",
        path: "/mcp/servers/platform",
        params: { serverId: "platform" },
        body: { trust_state: "blocked" }
      },
      createMockRes()
    );

    const approveRes = createMockRes();
    await approveHandler(
      {
        method: "POST",
        path: "/mcp/approve",
        body: { approval_id: approvalId }
      },
      approveRes
    );

    assert.equal(approveRes.statusCode, 403);
    assert.equal(approveRes.body?.ok, false);
    assert.equal(approveRes.body?.error?.code, "MCP_POLICY_DENIED");
  });
});

test("expired approval fails safely and does not execute", async () => {
  await withTempMcpEnv({ MCP_APPROVAL_MODE: "untrusted_only" }, async ({ approvalsPath }) => {
    const approveHandler = getRouteHandler(agenticRouter, "/mcp/approve", "post");
    await fs.writeFile(
      approvalsPath,
      JSON.stringify(
        [
          {
            approval_id: "expired-1",
            server_id: "platform",
            tool_name: "knowledge.list",
            input: {},
            reason: "Approval required.",
            requested_at: new Date(Date.now() - 60_000).toISOString(),
            expires_at: new Date(Date.now() - 1_000).toISOString(),
            consumed_at: null
          }
        ],
        null,
        2
      ),
      "utf8"
    );

    const res = createMockRes();
    await approveHandler(
      {
        method: "POST",
        path: "/mcp/approve",
        body: { approval_id: "expired-1" }
      },
      res
    );

    assert.equal(res.statusCode, 410);
    assert.equal(res.body?.ok, false);
    assert.equal(res.body?.error?.code, "MCP_APPROVAL_EXPIRED");
  });
});
