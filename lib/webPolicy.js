import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";
import { safeJsonParse } from "./utils.js";
import { webPolicySchema } from "./validators.js";

const POLICY_PATH = path.join(SETTINGS_DIR, "web-policy.json");

const DEFAULT_POLICY = {
  allowlist: [],
  denylist: []
};

function normalizePolicy(candidate) {
  const parsed = webPolicySchema.safeParse(candidate);
  if (!parsed.success) return structuredClone(DEFAULT_POLICY);
  return parsed.data;
}

export async function getWebPolicy() {
  try {
    const raw = await fsp.readFile(POLICY_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return structuredClone(DEFAULT_POLICY);
    return normalizePolicy(parsed.value);
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(DEFAULT_POLICY);
    throw error;
  }
}

export function getWebPolicySync() {
  try {
    if (!fs.existsSync(POLICY_PATH)) return structuredClone(DEFAULT_POLICY);
    const raw = fs.readFileSync(POLICY_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return structuredClone(DEFAULT_POLICY);
    return normalizePolicy(parsed.value);
  } catch {
    return structuredClone(DEFAULT_POLICY);
  }
}

export async function saveWebPolicy(policy) {
  const normalized = normalizePolicy(policy);
  await fsp.mkdir(SETTINGS_DIR, { recursive: true });
  await fsp.writeFile(POLICY_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function normalizeDomainEntry(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("://")) {
    try {
      const url = new URL(raw);
      return url.hostname.toLowerCase();
    } catch {
      return raw.replace(/\/.*$/, "");
    }
  }
  return raw.replace(/\/.*$/, "");
}

function matchesEntry(hostname, entry) {
  const host = String(hostname || "").toLowerCase();
  const normalized = normalizeDomainEntry(entry);
  if (!normalized) return false;
  if (normalized.startsWith("*.")) {
    const base = normalized.slice(2);
    if (!base) return false;
    return host === base || host.endsWith(`.${base}`);
  }
  return host === normalized || host.endsWith(`.${normalized}`);
}

export function isDomainAllowed(hostname, policy) {
  const active = normalizePolicy(policy || getWebPolicySync());
  const allowlist = active.allowlist || [];
  const denylist = active.denylist || [];
  if (denylist.some((entry) => matchesEntry(hostname, entry))) {
    return { allowed: false, reason: "denylist" };
  }
  if (!allowlist.length) {
    return { allowed: true, reason: "allowlist-empty" };
  }
  const allowed = allowlist.some((entry) => matchesEntry(hostname, entry));
  return { allowed, reason: allowed ? "allowlist" : "not-allowlisted" };
}
