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

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function withTempMcpAuditEnv(overrides, fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-audit-"));
  const settingsPath = path.join(tempDir, "mcp.json");
  const approvalsPath = path.join(tempDir, "mcp-approvals.json");
  const auditPath = path.join(tempDir, "mcp-audit.jsonl");
  const original = {
    MCP_SETTINGS_PATH: process.env.MCP_SETTINGS_PATH,
    MCP_APPROVALS_PATH: process.env.MCP_APPROVALS_PATH,
    MCP_APPROVAL_MODE: process.env.MCP_APPROVAL_MODE,
    MCP_AUDIT_PATH: process.env.MCP_AUDIT_PATH
  };
  process.env.MCP_SETTINGS_PATH = settingsPath;
  process.env.MCP_APPROVALS_PATH = approvalsPath;
  process.env.MCP_AUDIT_PATH = auditPath;
  if (Object.prototype.hasOwnProperty.call(overrides || {}, "MCP_APPROVAL_MODE")) {
    process.env.MCP_APPROVAL_MODE = String(overrides.MCP_APPROVAL_MODE);
  } else {
    delete process.env.MCP_APPROVAL_MODE;
  }
  try {
    return await fn({ settingsPath, approvalsPath, auditPath });
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("denied call produces an audit record with decision=denied and status=not_executed", async () => {
  await withTempMcpAuditEnv({ MCP_APPROVAL_MODE: "off" }, async ({ auditPath }) => {
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

    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: { apiKey: "secret-value" } }
      },
      res
    );

    assert.equal(res.statusCode, 403);
    const records = await readJsonl(auditPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].decision, "denied");
    assert.equal(records[0].status, "not_executed");
    assert.equal(records[0].server.server_id, "platform");
    assert.equal(records[0].input.apiKey, "[REDACTED]");
  });
});

test("approval_required produces an audit record with decision=approval_required and status=not_executed", async () => {
  await withTempMcpAuditEnv({ MCP_APPROVAL_MODE: "untrusted_only" }, async ({ auditPath }) => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: {} },
        auth: { user: { username: "akadmin" } }
      },
      res
    );

    assert.equal(res.statusCode, 202);
    const records = await readJsonl(auditPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].decision, "approval_required");
    assert.equal(records[0].status, "not_executed");
    assert.equal(records[0].actor_id, "akadmin");
    assert.equal(typeof records[0].approval_id, "string");
  });
});

test("successful execution produces an audit record with decision=allowed and status=success", async () => {
  await withTempMcpAuditEnv({ MCP_APPROVAL_MODE: "off" }, async ({ auditPath }) => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: { token: "abc123" } }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    const records = await readJsonl(auditPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].decision, "allowed");
    assert.equal(records[0].status, "success");
    assert.equal(records[0].input.token, "[REDACTED]");
    assert.ok(records[0].completed_at);
    assert.equal(typeof records[0].latency_ms, "number");
  });
});

test("approve flow produces audit records and includes correlation_id", async () => {
  await withTempMcpAuditEnv({ MCP_APPROVAL_MODE: "untrusted_only" }, async ({ auditPath }) => {
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

    const approveRes = createMockRes();
    await approveHandler(
      {
        method: "POST",
        path: "/mcp/approve",
        body: { approval_id: callRes.body?.data?.approval_id },
        auth: { user: { id: "u9" } }
      },
      approveRes
    );

    assert.equal(approveRes.statusCode, 200);
    const records = await readJsonl(auditPath);
    assert.ok(records.length >= 3);
    const success = records.find((row) => row.status === "success" && row.approval_id);
    assert.ok(success);
    assert.equal(typeof success.correlation_id, "string");
    assert.ok(success.correlation_id);
  });
});

test("GET /mcp/audit returns records and respects limit", async () => {
  await withTempMcpAuditEnv({ MCP_APPROVAL_MODE: "off" }, async ({ auditPath }) => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const auditHandler = getRouteHandler(agenticRouter, "/mcp/audit", "get");

    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: {} }
      },
      createMockRes()
    );
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/platform/call",
        params: { serverId: "platform" },
        body: { tool: "knowledge.list", input: {} }
      },
      createMockRes()
    );
    await fs.appendFile(auditPath, "not-json\n", "utf8");

    const res = createMockRes();
    await auditHandler(
      {
        method: "GET",
        path: "/mcp/audit",
        query: { limit: "1", server_id: "platform", decision: "allowed" }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.ok, true);
    assert.equal(res.body?.data?.records?.length, 1);
    assert.equal(res.body?.data?.records?.[0]?.server?.server_id, "platform");
    assert.equal(res.body?.data?.records?.[0]?.decision, "allowed");
  });
});
