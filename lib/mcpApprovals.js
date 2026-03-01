import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { SETTINGS_DIR } from "./storage.js";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function getMcpApprovalsPath() {
  return process.env.MCP_APPROVALS_PATH || path.join(SETTINGS_DIR, "mcp-approvals.json");
}

async function readApprovalStore() {
  try {
    const raw = await fs.readFile(getMcpApprovalsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    return [];
  }
}

async function writeApprovalStore(rows) {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.writeFile(getMcpApprovalsPath(), JSON.stringify(Array.isArray(rows) ? rows : [], null, 2), "utf8");
}

function createError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isExpired(record) {
  const expiresAt = new Date(String(record?.expires_at || "")).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export async function createMcpApprovalRequest({
  serverId,
  toolName,
  input,
  reason,
  actor = null,
  ttlMs = DEFAULT_TTL_MS
}) {
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(1, Number(ttlMs) || DEFAULT_TTL_MS));
  const row = {
    approval_id: crypto.randomUUID(),
    server_id: String(serverId || "").trim(),
    tool_name: String(toolName || "").trim(),
    input: input && typeof input === "object" ? input : {},
    reason: String(reason || "").trim() || "Approval required by MCP policy.",
    requested_at: now.toISOString(),
    expires_at: expires.toISOString(),
    actor: actor
      ? {
          id: actor.id || null,
          username: actor.username || null,
          role: actor.role || null
        }
      : null,
    consumed_at: null
  };
  const rows = await readApprovalStore();
  rows.push(row);
  await writeApprovalStore(rows);
  return row;
}

export async function getMcpApprovalRequest(approvalId) {
  const id = String(approvalId || "").trim();
  if (!id) throw createError("VALIDATION_ERROR", "approval_id is required.");
  const rows = await readApprovalStore();
  return rows.find((row) => String(row?.approval_id || "").trim() === id) || null;
}

export async function consumeMcpApprovalRequest(approvalId) {
  const id = String(approvalId || "").trim();
  if (!id) throw createError("VALIDATION_ERROR", "approval_id is required.");
  const rows = await readApprovalStore();
  const index = rows.findIndex((row) => String(row?.approval_id || "").trim() === id);
  if (index < 0) {
    throw createError("MCP_APPROVAL_NOT_FOUND", `Approval '${id}' not found.`);
  }
  const current = rows[index];
  if (current?.consumed_at) {
    throw createError("MCP_APPROVAL_CONSUMED", `Approval '${id}' was already used.`);
  }
  if (isExpired(current)) {
    throw createError("MCP_APPROVAL_EXPIRED", `Approval '${id}' has expired.`);
  }
  const next = {
    ...current,
    consumed_at: new Date().toISOString()
  };
  rows[index] = next;
  await writeApprovalStore(rows);
  return next;
}
