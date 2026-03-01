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

async function withTempMcpEnv(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-orch-"));
  const settingsPath = path.join(tempDir, "mcp.json");
  const approvalsPath = path.join(tempDir, "mcp-approvals.json");
  const auditPath = path.join(tempDir, "mcp-audit.jsonl");
  const original = {
    MCP_SETTINGS_PATH: process.env.MCP_SETTINGS_PATH,
    MCP_APPROVALS_PATH: process.env.MCP_APPROVALS_PATH,
    MCP_AUDIT_PATH: process.env.MCP_AUDIT_PATH,
    MCP_APPROVAL_MODE: process.env.MCP_APPROVAL_MODE
  };
  process.env.MCP_SETTINGS_PATH = settingsPath;
  process.env.MCP_APPROVALS_PATH = approvalsPath;
  process.env.MCP_AUDIT_PATH = auditPath;
  process.env.MCP_APPROVAL_MODE = "off";
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

test("orchestration tools appear in servers listing for orchestration-local", async () => {
  await withTempMcpEnv(async () => {
    const serversHandler = getRouteHandler(agenticRouter, "/mcp/servers", "get");
    const res = createMockRes();
    await serversHandler(
      {
        method: "GET",
        path: "/mcp/servers",
        query: { includeTools: "true" }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    const server = (res.body?.data?.servers || []).find((row) => row.id === "orchestration-local");
    assert.ok(server);
    const toolNames = (server.tools || []).map((tool) => tool.name).sort();
    assert.deepEqual(toolNames, ["evaluate_response", "orchestration_plan", "policy_gate"]);
  });
});

test("calling policy_gate via standard MCP /call returns deterministic schema", async () => {
  await withTempMcpEnv(async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const payload = {
      schema_version: "1.0",
      actor_id: "u1",
      server: { server_id: "platform", trust_state: "blocked", risk_tier: "high" },
      tool_name: "filesystem.write_text",
      input_preview: { apiKey: "secret-value" },
      context: { channel: "task" }
    };

    const first = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/orchestration-local/call",
        params: { serverId: "orchestration-local" },
        body: { tool: "policy_gate", input: payload }
      },
      first
    );

    const second = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/orchestration-local/call",
        params: { serverId: "orchestration-local" },
        body: { tool: "policy_gate", input: payload }
      },
      second
    );

    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.body?.data?.output, second.body?.data?.output);
    assert.equal(first.body?.data?.output?.schema_version, "1.0");
    assert.equal(first.body?.data?.output?.decision, "deny");
    assert.ok(first.body?.data?.output?.risk_score >= 90);
    assert.ok(Array.isArray(first.body?.data?.output?.required_controls));
    assert.ok(first.body?.data?.output?.required_controls.includes("blocked_server"));
  });
});

test("calling evaluate_response with 2 candidates returns winner_id and stable scoring", async () => {
  await withTempMcpEnv(async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const input = {
      schema_version: "1.0",
      rubric: {
        criteria: [
          { name: "accuracy", weight: 0.25 },
          { name: "clarity", weight: 0.25 },
          { name: "completeness", weight: 0.25 },
          { name: "safety", weight: 0.25 }
        ]
      },
      candidates: [
        {
          id: "a",
          text: "Answer in one long dense sentence without structure and with a password=123 exposure."
        },
        {
          id: "b",
          text: "1. Check the logs.\n2. Verify the config.\n3. Retry the request with the safe setting."
        }
      ]
    };

    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/orchestration-local/call",
        params: { serverId: "orchestration-local" },
        body: { tool: "evaluate_response", input }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.data?.output?.schema_version, "1.0");
    assert.equal(res.body?.data?.output?.winner_id, "b");
    assert.equal(res.body?.data?.output?.scores?.length, 2);
    const totals = Object.fromEntries(res.body.data.output.scores.map((row) => [row.id, row.total]));
    assert.ok(totals.b > totals.a);
  });
});

test("calling orchestration_plan returns ordered steps and includes human_approval when required", async () => {
  await withTempMcpEnv(async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const input = {
      schema_version: "1.0",
      goal: "Respond to an enterprise support request",
      inputs: {
        user_query: "Investigate the deployment issue",
        available_models: ["gpt-5-mini"],
        available_agents: ["model-router"]
      },
      controls: {
        approval_mode: "always",
        governance_enabled: true
      }
    };

    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/orchestration-local/call",
        params: { serverId: "orchestration-local" },
        body: { tool: "orchestration_plan", input }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    const steps = res.body?.data?.output?.steps || [];
    assert.equal(res.body?.data?.output?.schema_version, "1.0");
    assert.equal(steps[0]?.type, "policy_gate");
    assert.equal(steps[steps.length - 1]?.type, "summarize");
    assert.ok(steps.some((step) => step.type === "evaluate_response"));
    assert.ok(steps.some((step) => step.type === "human_approval"));
  });
});

test("orchestration tools work through standard MCP /call endpoint", async () => {
  await withTempMcpEnv(async () => {
    const callHandler = getRouteHandler(agenticRouter, "/mcp/servers/:serverId/call", "post");
    const res = createMockRes();
    await callHandler(
      {
        method: "POST",
        path: "/mcp/servers/orchestration-local/call",
        params: { serverId: "orchestration-local" },
        body: {
          tool: "orchestration_plan",
          input: {
            schema_version: "1.0",
            goal: "Test route",
            inputs: { user_query: "Hello", available_models: [], available_agents: [] },
            controls: { approval_mode: "off", governance_enabled: false }
          }
        }
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.ok, true);
    assert.equal(res.body?.data?.output?.schema_version, "1.0");
  });
});
