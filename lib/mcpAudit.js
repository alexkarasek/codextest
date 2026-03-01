import fs from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";

let appendQueue = Promise.resolve();

function getMcpAuditPath() {
  return process.env.MCP_AUDIT_PATH || path.join(SETTINGS_DIR, "mcp-audit.jsonl");
}

function secretLikeKey(key) {
  return /(key|token|secret|password|authorization)/i.test(String(key || ""));
}

function redactString(value, parentKey = "") {
  const raw = String(value || "");
  if (secretLikeKey(parentKey)) return "[REDACTED]";
  if (/^sk-[a-z0-9]/i.test(raw)) return "[REDACTED]";
  if (/^Bearer\s+/i.test(raw)) return "[REDACTED]";
  if (/api[_-]?key/i.test(raw)) return "[REDACTED]";
  return raw;
}

export function sanitizeAuditValue(value, parentKey = "", depth = 0) {
  if (depth > 6) return "[TRUNCATED]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return redactString(value, parentKey);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, parentKey, depth + 1));
  }
  if (typeof value === "object") {
    const next = {};
    for (const [key, child] of Object.entries(value)) {
      next[key] = secretLikeKey(key) ? "[REDACTED]" : sanitizeAuditValue(child, key, depth + 1);
    }
    return next;
  }
  return String(value);
}

function sanitizeServerSnapshot(server = {}) {
  return {
    server_id: String(server?.id || server?.server_id || "").trim(),
    trust_state: String(server?.trust_state || "untrusted").trim() || "untrusted",
    risk_tier: String(server?.risk_tier || "medium").trim() || "medium",
    owner: String(server?.owner || "unknown").trim() || "unknown",
    allow_tools: Array.isArray(server?.allow_tools) ? [...server.allow_tools] : [],
    deny_tools: Array.isArray(server?.deny_tools) ? [...server.deny_tools] : []
  };
}

export function createMcpAuditRecord({
  correlationId,
  startedAt,
  completedAt,
  notExecutedAt,
  actorId,
  server,
  toolName,
  input,
  output,
  error,
  decision,
  status,
  approvalId = null,
  note = ""
}) {
  const started = new Date(String(startedAt || new Date().toISOString()));
  const endedSource = completedAt || notExecutedAt || new Date().toISOString();
  const ended = new Date(String(endedSource));
  const safeStarted = Number.isNaN(started.getTime()) ? new Date() : started;
  const safeEnded = Number.isNaN(ended.getTime()) ? new Date() : ended;
  return {
    correlation_id: String(correlationId || "").trim() || "unknown",
    started_at: safeStarted.toISOString(),
    completed_at: completedAt ? safeEnded.toISOString() : null,
    not_executed_at: notExecutedAt ? safeEnded.toISOString() : null,
    latency_ms: Math.max(0, safeEnded.getTime() - safeStarted.getTime()),
    actor_id: String(actorId || "").trim() || "unknown",
    server: sanitizeServerSnapshot(server),
    tool_name: String(toolName || "").trim(),
    input: sanitizeAuditValue(input),
    output: output === undefined ? null : sanitizeAuditValue(output),
    error: error
      ? {
          code: String(error?.code || "").trim() || "ERROR",
          message: redactString(error?.message || "Unknown error")
        }
      : null,
    decision: String(decision || "").trim() || "denied",
    status: String(status || "").trim() || "not_executed",
    approval_id: approvalId ? String(approvalId) : null,
    note: String(note || "")
  };
}

export async function appendMcpAuditRecord(record) {
  const payload = `${JSON.stringify(record)}\n`;
  appendQueue = appendQueue
    .then(async () => {
      await fs.mkdir(SETTINGS_DIR, { recursive: true });
      await fs.appendFile(getMcpAuditPath(), payload, "utf8");
    })
    .catch((error) => {
      console.warn(`[mcp-audit] Failed to append audit record: ${error.message}`);
    });
  await appendQueue;
}

export async function listMcpAuditRecords({ limit = 100, serverId = "", decision = "" } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
  let raw = "";
  try {
    raw = await fs.readFile(getMcpAuditPath(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const serverFilter = String(serverId || "").trim();
  const decisionFilter = String(decision || "").trim();
  const rows = [];
  const lines = raw.split("\n");
  for (let idx = lines.length - 1; idx >= 0 && rows.length < safeLimit; idx -= 1) {
    const line = lines[idx].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (serverFilter && String(parsed?.server?.server_id || "").trim() !== serverFilter) continue;
      if (decisionFilter && String(parsed?.decision || "").trim() !== decisionFilter) continue;
      rows.push(parsed);
    } catch {
      continue;
    }
  }
  return rows;
}
