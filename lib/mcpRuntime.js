import { callHttpMcpTool, isHttpMcpServer } from "./mcpHttpClient.js";
import { runMcpTool as runEmbeddedMcpTool } from "./mcpRegistry.js";
import { listResolvedMcpServers } from "./mcpStatus.js";
import { callStdioMcpTool, isStdioMcpServer } from "./mcpStdioClient.js";

function normalizeToolAlias(name) {
  const value = String(name || "").trim();
  const normalized = value.toLowerCase();
  const aliases = {
    model_inventory: "governance.query_current_model_posture",
    current_model_posture: "governance.query_current_model_posture",
    query_current_model_posture: "governance.query_current_model_posture",
    score_use_cases: "pilot_to_scale.score_use_cases",
    pilot_to_scale: "pilot_to_scale.score_use_cases"
  };
  return aliases[normalized] || value;
}

export async function runResolvedMcpTool(serverId, toolName, input = {}, context = {}) {
  const servers = await listResolvedMcpServers({ includeTools: true });
  const server = servers.find((item) => item.id === String(serverId || ""));
  if (!server) {
    const err = new Error(`Unknown MCP server '${serverId}'.`);
    err.code = "MCP_SERVER_NOT_FOUND";
    throw err;
  }
  const resolvedToolName = normalizeToolAlias(toolName);
  const knownTools = Array.isArray(server.tools) ? server.tools.map((tool) => String(tool.name || "")).filter(Boolean) : [];
  if (knownTools.length && !knownTools.includes(resolvedToolName)) {
    const err = new Error(`Unknown MCP tool '${toolName}' on server '${serverId}'. Available tools: ${knownTools.join(", ")}`);
    err.code = "MCP_TOOL_NOT_FOUND";
    throw err;
  }
  if (isHttpMcpServer(server)) {
    return callHttpMcpTool(server, resolvedToolName, input, context);
  }
  if (isStdioMcpServer(server)) {
    return callStdioMcpTool(server, resolvedToolName, input, context);
  }
  return runEmbeddedMcpTool(serverId, resolvedToolName, input, context);
}
