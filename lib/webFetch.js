import { truncateText } from "./utils.js";
import { getWebPolicySync, isDomainAllowed } from "./webPolicy.js";

const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CHARS = 12000;

function ensureHttpUrl(raw) {
  const url = new URL(String(raw || "").trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    const err = new Error("Only http and https URLs are supported.");
    err.code = "UNSUPPORTED_URL_PROTOCOL";
    throw err;
  }
  return url;
}

function isBlockedHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local")) return true;
  return false;
}

function stripHtml(html) {
  let text = String(html || "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<\/(p|div|br|li|h\d|section|article)>/gi, "\n");
  text = text.replace(/<[^>]*>/g, " ");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, "\"");
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&#(\d+);/g, (_m, code) => {
    const num = Number(code);
    if (!Number.isFinite(num)) return "";
    return String.fromCharCode(num);
  });
  text = text.replace(/\s+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return String(match[1] || "").replace(/\s+/g, " ").trim();
}

export async function fetchWebDocument(rawUrl, { timeoutMs = 12000 } = {}) {
  const url = ensureHttpUrl(rawUrl);
  if (isBlockedHostname(url.hostname)) {
    const err = new Error("Blocked hostname.");
    err.code = "BLOCKED_HOSTNAME";
    throw err;
  }
  const policy = getWebPolicySync();
  const allowed = isDomainAllowed(url.hostname, policy);
  if (!allowed.allowed) {
    const err = new Error("Domain blocked by policy.");
    err.code = "BLOCKED_DOMAIN";
    err.details = { reason: allowed.reason };
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "persona-debate-local/1.0 (+mcp-web-ingest)"
      },
      signal: controller.signal
    });
    if (!res.ok) {
      const err = new Error(`Fetch failed with status ${res.status}`);
      err.code = "FETCH_FAILED";
      throw err;
    }
    const contentType = String(res.headers.get("content-type") || "");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_FETCH_BYTES) {
      const err = new Error("Response too large.");
      err.code = "FETCH_TOO_LARGE";
      throw err;
    }
    const rawText = buffer.toString("utf8");
    const isHtml = contentType.includes("text/html") || rawText.trim().startsWith("<");
    const title = isHtml ? extractTitle(rawText) : "";
    const text = isHtml ? stripHtml(rawText) : rawText.trim();
    return {
      url: url.toString(),
      title,
      contentType,
      retrievedAt: new Date().toISOString(),
      rawChars: rawText.length,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

export function truncateWebText(text, maxChars = DEFAULT_MAX_CHARS) {
  const max = Number.isFinite(Number(maxChars)) ? Math.max(500, Number(maxChars)) : DEFAULT_MAX_CHARS;
  return truncateText(String(text || ""), max);
}
