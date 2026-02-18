import { listKnowledgePacks, getKnowledgePack, listPersonas } from "./storage.js";
import { listTaskEvents, listToolUsage } from "./agenticStorage.js";

const serverRegistry = new Map();

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
