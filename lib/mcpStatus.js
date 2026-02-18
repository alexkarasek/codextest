import fs from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";
import { listMcpServers as listEmbeddedServers } from "./mcpRegistry.js";

const MCP_SETTINGS_PATH = path.join(SETTINGS_DIR, "mcp.json");

const DEFAULT_MCP_SETTINGS = {
  enabled: true,
  transport: "local",
  servers: [],
  notes: "Embedded MCP server enabled. Add external MCP servers in a future milestone."
};

function normalizeConfiguredServer(server) {
  if (!server || typeof server !== "object") return null;
  const id = String(server.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(server.name || id),
    description: String(server.description || ""),
    transport: String(server.transport || "remote"),
    source: "configured",
    toolCount: 0,
    tools: []
  };
}

export async function getMcpSettings() {
  try {
    const raw = await fs.readFile(MCP_SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_MCP_SETTINGS };
    return {
      ...DEFAULT_MCP_SETTINGS,
      ...parsed,
      servers: Array.isArray(parsed.servers) ? parsed.servers : []
    };
  } catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULT_MCP_SETTINGS };
    return { ...DEFAULT_MCP_SETTINGS };
  }
}

export async function getMcpReadinessStatus() {
  const settings = await getMcpSettings();
  const enabled = Boolean(settings.enabled);
  const embedded = listEmbeddedServers({ includeTools: false });
  const configured = (settings.servers || [])
    .map(normalizeConfiguredServer)
    .filter(Boolean);
  const servers = enabled ? [...embedded, ...configured] : [];
  const serverCount = servers.length;
  const phase = enabled ? (serverCount ? "ready" : "configured") : "disabled";
  const message = enabled
    ? "Embedded MCP server available. Configure additional MCP servers as needed."
    : "MCP is disabled in settings.";

  return {
    enabled,
    transport: settings.transport || "local",
    serverCount,
    servers,
    phase,
    message
  };
}

export async function listResolvedMcpServers({ includeTools = false } = {}) {
  const settings = await getMcpSettings();
  if (!settings.enabled) return [];
  const embedded = listEmbeddedServers({ includeTools });
  const configured = (settings.servers || [])
    .map(normalizeConfiguredServer)
    .filter(Boolean);
  return [...embedded, ...configured];
}
