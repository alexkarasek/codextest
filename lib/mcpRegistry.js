import { listKnowledgePacks, getKnowledgePack, listPersonas } from "./storage.js";
import { listTaskEvents, listToolUsage } from "./agenticStorage.js";
import { getOrchestrationMcpServerDefinition } from "./orchestrationTools.js";
import fs from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";

const serverRegistry = new Map();
const DEFAULT_REMOTE_MCP_TIMEOUT_MS = 15000;

function getMcpSettingsPath() {
  return process.env.MCP_SETTINGS_PATH || path.join(SETTINGS_DIR, "mcp.json");
}

async function loadConfiguredRemoteServer(serverId) {
  try {
    const raw = await fs.readFile(getMcpSettingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    const servers = Array.isArray(parsed?.servers) ? parsed.servers : [];
    const row = servers.find((item) => String(item?.id || "").trim() === String(serverId || "").trim());
    if (!row) return null;
    const endpoint = String(row.endpoint || row.url || "").trim();
    if (!endpoint) return null;
    return {
      id: String(row.id).trim(),
      name: String(row.name || row.id),
      endpoint,
      timeoutMs: Number.isFinite(Number(row.timeoutMs))
        ? Math.max(1000, Math.min(120000, Number(row.timeoutMs)))
        : DEFAULT_REMOTE_MCP_TIMEOUT_MS,
      apiKeyEnv: String(row.apiKeyEnv || "").trim()
    };
  } catch {
    return null;
  }
}

async function callRemoteMcpTool(server, toolName, input, context = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), server.timeoutMs || DEFAULT_REMOTE_MCP_TIMEOUT_MS);
  const headers = {
    "content-type": "application/json"
  };
  if (server.apiKeyEnv) {
    const token = String(process.env[server.apiKeyEnv] || "").trim();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  try {
    const callId = Math.floor(Date.now() / 1000);
    const response = await fetch(server.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: callId,
        method: "tools/call",
        params: {
          name: String(toolName || ""),
          arguments: input && typeof input === "object" ? input : {}
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const err = new Error(`Remote MCP call failed (${response.status}): ${body || response.statusText}`);
      err.code = "MCP_REMOTE_CALL_FAILED";
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    if (data && typeof data === "object" && data.jsonrpc === "2.0") {
      if (data.error) {
        const err = new Error(String(data.error?.message || "Remote MCP JSON-RPC error"));
        err.code = "MCP_REMOTE_JSONRPC_ERROR";
        err.rpcError = data.error;
        throw err;
      }
      const result = data.result;
      if (result && typeof result === "object") {
        if (Object.prototype.hasOwnProperty.call(result, "structuredContent")) return result.structuredContent;
        if (Array.isArray(result.content)) {
          const jsonItem = result.content.find(
            (item) => item && typeof item === "object" && (item.type === "json" || item.type === "application/json")
          );
          if (jsonItem && typeof jsonItem === "object" && Object.prototype.hasOwnProperty.call(jsonItem, "json")) {
            return jsonItem.json;
          }
          const text = result.content
            .filter((item) => item && typeof item === "object" && item.type === "text")
            .map((item) => String(item.text || ""))
            .join("\n")
            .trim();
          if (text) {
            try {
              return JSON.parse(text);
            } catch {
              return { text };
            }
          }
        }
      }
      return result;
    }
    // Backward-compatible fallback for non-JSON-RPC wrappers.
    if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "output")) {
      return data.output;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const err = new Error("Remote MCP call timed out.");
      err.code = "MCP_REMOTE_TIMEOUT";
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeTool(tool) {
  if (!tool || typeof tool !== "object") {
    throw new Error("Invalid MCP tool definition.");
  }
  if (!tool.name) {
    throw new Error("MCP tool name is required.");
  }
  return {
    name: String(tool.name),
    description: String(tool.description || ""),
    inputSchema: tool.inputSchema || {},
    run: tool.run
  };
}

export function registerMcpServer(server) {
  if (!server || typeof server !== "object") {
    throw new Error("Invalid MCP server definition.");
  }
  if (!server.id) {
    throw new Error("MCP server id is required.");
  }
  const tools = Array.isArray(server.tools) ? server.tools.map(normalizeTool) : [];
  serverRegistry.set(String(server.id), {
    id: String(server.id),
    name: String(server.name || server.id),
    description: String(server.description || ""),
    transport: String(server.transport || "local"),
    source: String(server.source || "embedded"),
    tools
  });
}

export function listMcpServers({ includeTools = false } = {}) {
  return [...serverRegistry.values()].map((server) => ({
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transport,
    source: server.source,
    toolCount: server.tools.length,
    tools: includeTools
      ? server.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema || {}
        }))
      : undefined
  }));
}

export function listMcpTools(serverId) {
  const server = serverRegistry.get(String(serverId));
  if (!server) return [];
  return server.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema || {}
  }));
}

export async function runMcpTool(serverId, toolName, input, context = {}) {
  const server = serverRegistry.get(String(serverId));
  if (!server) {
    const remoteServer = await loadConfiguredRemoteServer(serverId);
    if (remoteServer) {
      return callRemoteMcpTool(remoteServer, toolName, input, context);
    }
    const err = new Error(`Unknown MCP server '${serverId}'.`);
    err.code = "MCP_SERVER_NOT_FOUND";
    throw err;
  }
  const tool = server.tools.find((t) => t.name === String(toolName));
  if (!tool) {
    const err = new Error(`Unknown MCP tool '${toolName}'.`);
    err.code = "MCP_TOOL_NOT_FOUND";
    throw err;
  }
  if (typeof tool.run !== "function") {
    const err = new Error(`MCP tool '${toolName}' is not executable.`);
    err.code = "MCP_TOOL_NOT_RUNNABLE";
    throw err;
  }
  return tool.run(input || {}, context);
}

registerMcpServer({
  id: "platform",
  name: "Platform Core",
  description: "Embedded MCP server exposing platform data and observability.",
  transport: "local",
  source: "embedded",
  tools: [
    {
      name: "knowledge.list",
      description: "List available knowledge packs.",
      inputSchema: {
        includeHidden: "boolean (optional, default false)"
      },
      run: async (input) => {
        const includeHidden = Boolean(input?.includeHidden);
        return listKnowledgePacks({ includeHidden });
      }
    },
    {
      name: "knowledge.get",
      description: "Fetch a single knowledge pack by id.",
      inputSchema: {
        id: "string"
      },
      run: async (input) => {
        const id = String(input?.id || "").trim();
        if (!id) {
          const err = new Error("id is required");
          err.code = "MCP_TOOL_VALIDATION_ERROR";
          throw err;
        }
        const pack = await getKnowledgePack(id);
        if (pack?.isHidden) {
          const err = new Error(`Knowledge pack '${id}' not found.`);
          err.code = "MCP_TOOL_NOT_FOUND";
          throw err;
        }
        return { pack };
      }
    },
    {
      name: "personas.list",
      description: "List available personas (non-hidden).",
      inputSchema: {
        includeHidden: "boolean (optional, default false)"
      },
      run: async (input) => {
        const includeHidden = Boolean(input?.includeHidden);
        const data = await listPersonas({ includeHidden });
        return {
          personas: (data.personas || []).map((persona) => ({
            id: persona.id,
            displayName: persona.displayName,
            role: persona.role || "",
            expertiseTags: persona.expertiseTags || []
          })),
          errors: data.errors || []
        };
      }
    },
    {
      name: "agentic.events.tail",
      description: "Read recent agentic task/tool events.",
      inputSchema: {
        type: "string (task|tool, default task)",
        limit: "number (optional, default 200)"
      },
      run: async (input) => {
        const type = String(input?.type || "task");
        const limit = Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 200;
        if (type === "tool") {
          return { type: "tool", events: await listToolUsage(limit) };
        }
        return { type: "task", events: await listTaskEvents(limit) };
      }
    }
  ]
});

registerMcpServer(getOrchestrationMcpServerDefinition());
