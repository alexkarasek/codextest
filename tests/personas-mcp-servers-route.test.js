import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import personasRouter from "../server/routes/personas.js";

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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-mcp-servers-"));
  const settingsPath = path.join(tempDir, "mcp.json");
  const original = process.env.MCP_SETTINGS_PATH;
  process.env.MCP_SETTINGS_PATH = settingsPath;
  await fs.writeFile(
    settingsPath,
    JSON.stringify({
      enabled: true,
      servers: [
        {
          id: "platform",
          trust_state: "trusted"
        }
      ]
    }),
    "utf8"
  );
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.MCP_SETTINGS_PATH;
    else process.env.MCP_SETTINGS_PATH = original;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("GET /mcp-servers exposes accessible MCP servers for persona configuration", async () => {
  await withTempMcpSettings(async () => {
    const handler = getRouteHandler(personasRouter, "/mcp-servers", "get");
    const res = createMockRes();
    await handler({ method: "GET", path: "/mcp-servers", query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.ok, true);
    const platform = res.body?.data?.servers?.find((server) => server.id === "platform");
    assert.ok(platform);
    assert.ok(platform.tools.some((tool) => tool.name === "knowledge.list"));
  });
});
