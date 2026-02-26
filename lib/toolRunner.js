import path from "path";
import { getSettings } from "./config.js";
import { getWebPolicy, isDomainAllowed } from "./webPolicy.js";

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowMs() {
  return Date.now();
}

function parseHostname(urlValue) {
  try {
    return new URL(String(urlValue || "").trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getToolPolicy() {
  const settings = getSettings();
  const policy = settings?.toolPolicy && typeof settings.toolPolicy === "object" ? settings.toolPolicy : {};
  return {
    timeoutMs: Math.max(1000, toNumber(policy.timeoutMs, 45000)),
    fileAllowlist: Array.isArray(policy.fileAllowlist) ? policy.fileAllowlist.map((p) => String(p || "").trim()).filter(Boolean) : []
  };
}

function assertFilesystemPathAllowed(filePath, policy) {
  const list = policy.fileAllowlist || [];
  if (!list.length) return;
  const root = process.cwd();
  const normalized = path.resolve(root, String(filePath || ""));
  const allowed = list.some((entry) => {
    const base = path.resolve(root, entry);
    return normalized === base || normalized.startsWith(`${base}${path.sep}`);
  });
  if (!allowed) {
    const err = new Error("Filesystem path is outside configured tool allowlist.");
    err.code = "TOOL_PATH_NOT_ALLOWED";
    throw err;
  }
}

async function assertNetworkAllowed(urlValue) {
  const hostname = parseHostname(urlValue);
  if (!hostname) {
    const err = new Error("A valid URL is required.");
    err.code = "TOOL_VALIDATION_ERROR";
    throw err;
  }
  const webPolicy = await getWebPolicy();
  const verdict = isDomainAllowed(hostname, webPolicy);
  if (!verdict.allowed) {
    const err = new Error(`Domain '${hostname}' blocked by web policy (${verdict.reason}).`);
    err.code = "TOOL_DOMAIN_BLOCKED";
    throw err;
  }
}

function withTimeout(promise, timeoutMs, label) {
  const start = nowMs();
  let timer = null;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.code = "TOOL_TIMEOUT";
      err.latencyMs = nowMs() - start;
      reject(err);
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timer));
  });
}

function sanitizeInputForAudit(toolId, input) {
  const payload = input && typeof input === "object" ? { ...input } : {};
  if (payload.headers && typeof payload.headers === "object") {
    const nextHeaders = {};
    for (const [k, v] of Object.entries(payload.headers)) {
      const key = String(k || "").toLowerCase();
      if (["authorization", "api-key", "x-api-key", "cookie", "set-cookie"].includes(key)) {
        nextHeaders[k] = "***";
      } else {
        nextHeaders[k] = String(v);
      }
    }
    payload.headers = nextHeaders;
  }
  if (toolId === "http.request" && payload.body && typeof payload.body !== "string") {
    payload.body = "[object]";
  }
  return payload;
}

export async function executeToolWithBoundary({ toolId, input, context = {}, execute }) {
  const policy = getToolPolicy();
  const sanitizedInput = sanitizeInputForAudit(toolId, input || {});

  if (["http.request", "web.fetch", "knowledge.ingest_url"].includes(toolId)) {
    await assertNetworkAllowed(input?.url);
  }
  if (["filesystem.read_text", "filesystem.write_text"].includes(toolId)) {
    assertFilesystemPathAllowed(input?.path, policy);
  }

  const timeoutMs = Math.max(50, toNumber(input?.timeoutMs, policy.timeoutMs));
  const result = await withTimeout(execute(), timeoutMs, `Tool '${toolId}'`);
  return {
    result,
    timeoutMs,
    sanitizedInput
  };
}
