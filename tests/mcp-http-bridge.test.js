import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import http from "http";
import os from "os";
import path from "path";
import { listResolvedMcpServers } from "../lib/mcpStatus.js";
import { runResolvedMcpTool } from "../lib/mcpRuntime.js";
import { runTool, listTools } from "../lib/agenticTools.js";

async function withTempMcpSettings(settings, fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-http-"));
  const settingsPath = path.join(tempDir, "mcp.json");
  const original = process.env.MCP_SETTINGS_PATH;
  process.env.MCP_SETTINGS_PATH = settingsPath;
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.MCP_SETTINGS_PATH;
    else process.env.MCP_SETTINGS_PATH = original;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function createMcpStubServer() {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    calls.push(body.method);
    res.setHeader("content-type", "application/json");
    res.setHeader("mcp-session-id", "session-test");
    if (body.method === "initialize") {
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }));
      return;
    }
    if (body.method === "notifications/initialized") {
      res.end(JSON.stringify({ jsonrpc: "2.0", result: {} }));
      return;
    }
    if (body.method === "tools/list") {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "echo",
                description: "Echo input.",
                inputSchema: { type: "object" }
              }
            ]
          }
        })
      );
      return;
    }
    if (body.method === "tools/call") {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: `echo:${body.params?.arguments?.message || ""}` }]
          }
        })
      );
      return;
    }
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "not found" } }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        endpoint: `http://127.0.0.1:${address.port}/mcp`,
        calls,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

test("configured local HTTP MCP server can list and call tools", async () => {
  const stub = await createMcpStubServer();
  try {
    await withTempMcpSettings(
      {
        enabled: true,
        servers: [
          {
            id: "other-local",
            name: "Other Local MCP",
            transport: "http",
            endpoint: stub.endpoint,
            trust_state: "trusted",
            allow_tools: ["*"]
          }
        ]
      },
      async () => {
        const servers = await listResolvedMcpServers({ includeTools: true });
        const external = servers.find((server) => server.id === "other-local");
        assert.ok(external);
        assert.equal(external.toolCount, 1);
        assert.equal(external.tools[0].name, "echo");

        const direct = await runResolvedMcpTool("other-local", "echo", { message: "direct" });
        assert.equal(direct.content[0].text, "echo:direct");

        assert.ok(listTools().some((tool) => tool.id === "mcp.call"));
        const generic = await runTool("mcp.call", {
          serverId: "other-local",
          tool: "echo",
          input: { message: "generic" }
        });
        assert.equal(generic.content[0].text, "echo:generic");
      }
    );
  } finally {
    await stub.close();
  }
});

test("configured stdio MCP server can list and call tools", async () => {
  await withTempMcpSettings(
    {
      enabled: true,
      servers: [
        {
          id: "fixture-stdio",
          name: "Fixture Stdio MCP",
          transport: "stdio",
          command: process.execPath,
          args: [path.join(process.cwd(), "tests/fixtures/mcp-stdio-server.mjs")],
          trust_state: "trusted",
          allow_tools: ["fixture.echo"]
        }
      ]
    },
    async () => {
      const servers = await listResolvedMcpServers({ includeTools: true });
      const external = servers.find((server) => server.id === "fixture-stdio");
      assert.ok(external);
      assert.equal(external.toolCount, 1);
      assert.equal(external.tools[0].name, "fixture.echo");

      const direct = await runResolvedMcpTool("fixture-stdio", "fixture.echo", { message: "direct" });
      assert.equal(direct.content[0].text, "echo:direct");
    }
  );
});

test("MCP runtime reports available tools for unknown configured tool names", async () => {
  await withTempMcpSettings(
    {
      enabled: true,
      servers: [
        {
          id: "fixture-stdio",
          name: "Fixture Stdio MCP",
          transport: "stdio",
          command: process.execPath,
          args: [path.join(process.cwd(), "tests/fixtures/mcp-stdio-server.mjs")],
          trust_state: "trusted",
          allow_tools: ["fixture.echo"]
        }
      ]
    },
    async () => {
      await assert.rejects(
        () => runResolvedMcpTool("fixture-stdio", "made_up_tool", {}),
        /Available tools: fixture\.echo/
      );
    }
  );
});
