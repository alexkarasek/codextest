import fs from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";

const MCP_SETTINGS_PATH = path.join(SETTINGS_DIR, "mcp.json");

const DEFAULT_MCP_SETTINGS = {
  enabled: false,
  transport: "stdio",
  servers: [],
  notes: "Scaffold only. Add MCP servers/providers in a future milestone."
};

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
  return {
    enabled: Boolean(settings.enabled),
    transport: settings.transport || "stdio",
    serverCount: (settings.servers || []).length,
    servers: settings.servers || [],
    phase: "planned",
    message:
      "MCP scaffold is present. Configure servers and execution policies in a future integration milestone."
  };
}
