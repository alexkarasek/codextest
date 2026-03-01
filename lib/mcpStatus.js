import fs from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";
import { listMcpServers as listEmbeddedServers } from "./mcpRegistry.js";

function getMcpSettingsPath() {
  return process.env.MCP_SETTINGS_PATH || path.join(SETTINGS_DIR, "mcp.json");
}

const DEFAULT_MCP_SETTINGS = {
  enabled: true,
  transport: "local",
  servers: [],
  notes: "Embedded MCP server enabled. Add external MCP servers in a future milestone."
};

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeTrustState(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["trusted", "blocked", "untrusted"].includes(normalized) ? normalized : "untrusted";
}

function normalizeRiskTier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : "medium";
}

function normalizeTimestamp(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return new Date().toISOString();
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function wildcardToRegex(pattern) {
  const escaped = String(pattern || "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function toolMatchesPattern(toolName, pattern) {
  const tool = String(toolName || "").trim();
  const rule = String(pattern || "").trim();
  if (!tool || !rule) return false;
  if (!rule.includes("*")) {
    return tool.toLowerCase() === rule.toLowerCase();
  }
  return wildcardToRegex(rule).test(tool);
}

function buildGovernanceMetadata(server = {}, now = new Date().toISOString()) {
  return {
    trust_state: normalizeTrustState(server.trust_state),
    risk_tier: normalizeRiskTier(server.risk_tier),
    allow_tools: normalizeStringArray(server.allow_tools),
    deny_tools: normalizeStringArray(server.deny_tools),
    owner: String(server.owner || "local").trim() || "local",
    notes: typeof server.notes === "string" ? server.notes : "",
    created_at: normalizeTimestamp(server.created_at || now),
    updated_at: normalizeTimestamp(server.updated_at || server.created_at || now)
  };
}

function createValidationError(message) {
  const err = new Error(message);
  err.code = "VALIDATION_ERROR";
  return err;
}

function normalizeConfiguredServer(server) {
  if (!server || typeof server !== "object") return null;
  const id = String(server.id || "").trim();
  if (!id) return null;
  const now = new Date().toISOString();
  return {
    id,
    name: String(server.name || id),
    description: String(server.description || ""),
    transport: String(server.transport || "remote"),
    source: "configured",
    toolCount: 0,
    tools: [],
    ...buildGovernanceMetadata(server, now)
  };
}

export async function getMcpSettings() {
  try {
    const raw = await fs.readFile(getMcpSettingsPath(), "utf8");
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

export async function saveMcpSettings(settings) {
  const payload = {
    ...DEFAULT_MCP_SETTINGS,
    ...(settings && typeof settings === "object" ? settings : {}),
    servers: Array.isArray(settings?.servers) ? settings.servers : []
  };
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(getMcpSettingsPath(), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export function validateMcpGovernanceUpdate(existing = {}, patch = {}, serverId = "") {
  const safePatch = patch && typeof patch === "object" ? patch : {};
  const allowedKeys = new Set(["trust_state", "risk_tier", "allow_tools", "deny_tools", "notes"]);
  const immutableKeys = ["owner", "created_at", "updated_at", "id", "serverId"];

  const attemptedImmutable = immutableKeys.filter((key) => Object.prototype.hasOwnProperty.call(safePatch, key));
  if (attemptedImmutable.length) {
    throw createValidationError(`Immutable MCP server fields cannot be updated: ${attemptedImmutable.join(", ")}`);
  }

  const unexpected = Object.keys(safePatch).filter((key) => !allowedKeys.has(key));
  if (unexpected.length) {
    throw createValidationError(`Unsupported MCP server fields: ${unexpected.join(", ")}`);
  }

  if (Object.prototype.hasOwnProperty.call(safePatch, "trust_state")) {
    const nextTrust = String(safePatch.trust_state || "").trim();
    if (!["untrusted", "trusted", "blocked"].includes(nextTrust)) {
      throw createValidationError("trust_state must be untrusted, trusted, or blocked.");
    }
    const currentTrust = normalizeTrustState(existing?.trust_state);
    if (currentTrust === "blocked" && nextTrust === "trusted") {
      throw createValidationError("blocked -> trusted is not allowed directly. Move through untrusted first.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(safePatch, "risk_tier")) {
    const nextRisk = String(safePatch.risk_tier || "").trim();
    if (!["low", "medium", "high"].includes(nextRisk)) {
      throw createValidationError("risk_tier must be low, medium, or high.");
    }
  }

  for (const key of ["allow_tools", "deny_tools"]) {
    if (!Object.prototype.hasOwnProperty.call(safePatch, key)) continue;
    if (!Array.isArray(safePatch[key])) {
      throw createValidationError(`${key} must be an array of strings.`);
    }
    const invalid = safePatch[key].some((value) => typeof value !== "string" || !String(value).trim());
    if (invalid) {
      throw createValidationError(`${key} must be an array of non-empty strings.`);
    }
  }

  return {
    trust_state: Object.prototype.hasOwnProperty.call(safePatch, "trust_state")
      ? String(safePatch.trust_state).trim()
      : undefined,
    risk_tier: Object.prototype.hasOwnProperty.call(safePatch, "risk_tier")
      ? String(safePatch.risk_tier).trim()
      : undefined,
    allow_tools: Object.prototype.hasOwnProperty.call(safePatch, "allow_tools")
      ? normalizeStringArray(safePatch.allow_tools)
      : undefined,
    deny_tools: Object.prototype.hasOwnProperty.call(safePatch, "deny_tools")
      ? normalizeStringArray(safePatch.deny_tools)
      : undefined,
    notes: Object.prototype.hasOwnProperty.call(safePatch, "notes")
      ? String(safePatch.notes || "")
      : undefined
  };
}

export async function updateMcpServerGovernance(serverId, patch = {}) {
  const id = String(serverId || "").trim();
  if (!id) {
    throw createValidationError("MCP server id is required.");
  }
  const settings = await getMcpSettings();
  const now = new Date().toISOString();
  const existingIndex = (settings.servers || []).findIndex((row) => String(row?.id || "").trim() === id);
  const existing = existingIndex >= 0 ? settings.servers[existingIndex] : { id };
  const validatedPatch = validateMcpGovernanceUpdate(existing, patch, id);
  const next = {
    ...existing,
    id,
    ...buildGovernanceMetadata(
      {
        ...existing,
        ...validatedPatch,
        created_at: existing.created_at || now,
        updated_at: now
      },
      now
    )
  };
  const nextServers = [...(settings.servers || [])];
  if (existingIndex >= 0) nextServers[existingIndex] = next;
  else nextServers.push(next);
  const saved = await saveMcpSettings({
    ...settings,
    servers: nextServers
  });
  return normalizeConfiguredServer(saved.servers.find((row) => String(row?.id || "").trim() === id));
}

function mergeServerRecord(base, override) {
  if (!base && !override) return null;
  const now = new Date().toISOString();
  return {
    ...(base || {}),
    ...(override || {}),
    id: String(base?.id || override?.id || "").trim(),
    name: String(base?.name || override?.name || base?.id || override?.id || "").trim(),
    description: String(base?.description || override?.description || ""),
    transport: String(base?.transport || override?.transport || "local"),
    source: String(base?.source || override?.source || "embedded"),
    toolCount: Number(base?.toolCount ?? override?.toolCount ?? 0),
    tools: Array.isArray(base?.tools) ? base.tools : Array.isArray(override?.tools) ? override.tools : [],
    ...buildGovernanceMetadata(
      {
        ...base,
        ...override,
        created_at: override?.created_at || base?.created_at || now,
        updated_at: override?.updated_at || base?.updated_at || now
      },
      now
    )
  };
}

// Intended to remain side-effect free: resolve from explicit inputs only.
export function resolveMcpToolPolicy(server, toolName) {
  const tool = String(toolName || "").trim();
  const trustState = normalizeTrustState(server?.trust_state);
  const denyTools = normalizeStringArray(server?.deny_tools);
  const allowTools = normalizeStringArray(server?.allow_tools);

  if (trustState === "blocked") {
    return {
      allowed: false,
      reason: "Server is blocked by trust policy."
    };
  }
  const deniedBy = denyTools.find((pattern) => toolMatchesPattern(tool, pattern));
  if (deniedBy) {
    return {
      allowed: false,
      reason: `Tool '${tool}' denied by policy rule '${deniedBy}'.`
    };
  }
  if (allowTools.length) {
    const allowedBy = allowTools.find((pattern) => toolMatchesPattern(tool, pattern));
    if (!allowedBy) {
      return {
        allowed: false,
        reason: `Tool '${tool}' is not in the allow list.`
      };
    }
  }
  return {
    allowed: true,
    reason: "Allowed by trust policy."
  };
}

export async function getMcpReadinessStatus() {
  const settings = await getMcpSettings();
  const enabled = Boolean(settings.enabled);
  const embedded = listEmbeddedServers({ includeTools: false });
  const configured = (settings.servers || [])
    .map(normalizeConfiguredServer)
    .filter(Boolean);
  const configuredById = new Map(configured.map((server) => [server.id, server]));
  const merged = embedded.map((server) => mergeServerRecord(server, configuredById.get(server.id)));
  const configuredOnly = configured.filter((server) => !embedded.some((row) => row.id === server.id));
  const servers = enabled ? [...merged, ...configuredOnly] : [];
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
  const configuredById = new Map(configured.map((server) => [server.id, server]));
  const merged = embedded.map((server) => mergeServerRecord(server, configuredById.get(server.id)));
  const configuredOnly = configured.filter((server) => !embedded.some((row) => row.id === server.id));
  return [...merged, ...configuredOnly];
}
