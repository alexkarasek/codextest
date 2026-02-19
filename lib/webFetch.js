import { truncateText } from "./utils.js";
import { getWebPolicySync, isDomainAllowed } from "./webPolicy.js";

const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CHARS = 12000;
const DISCOVERY_TOKEN_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "news",
  "latest",
  "today",
  "current",
  "update",
  "updates",
  "live",
  "www",
  "index",
  "home"
]);

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

function assertAllowedUrl(url) {
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
}

async function fetchPage(url, { timeoutMs = 12000, allowNonOk = false } = {}) {
  assertAllowedUrl(url);

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
    const contentType = String(res.headers.get("content-type") || "");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_FETCH_BYTES) {
      const err = new Error("Response too large.");
      err.code = "FETCH_TOO_LARGE";
      throw err;
    }
    const rawText = buffer.toString("utf8");
    const isHtml = contentType.includes("text/html") || rawText.trim().startsWith("<");
    if (!res.ok && !allowNonOk) {
      const err = new Error(`Fetch failed with status ${res.status}`);
      err.code = "FETCH_FAILED";
      err.status = res.status;
      throw err;
    }
    return {
      requestedUrl: url.toString(),
      finalUrl: String(res.url || url.toString()),
      status: Number(res.status),
      ok: Boolean(res.ok),
      contentType,
      retrievedAt: new Date().toISOString(),
      rawChars: rawText.length,
      rawText,
      isHtml
    };
  } finally {
    clearTimeout(timer);
  }
}

function tokenizePathHints(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !DISCOVERY_TOKEN_STOPWORDS.has(token));
}

function extractLinkCandidates(html, baseUrl) {
  const links = new Set();
  const raw = String(html || "");
  const re = /<a\s+[^>]*href\s*=\s*(['"])(.*?)\1/gi;
  let match = re.exec(raw);
  while (match) {
    const href = String(match[2] || "").trim();
    if (href && !href.startsWith("#") && !href.toLowerCase().startsWith("javascript:")) {
      try {
        const abs = new URL(href, baseUrl);
        if (["http:", "https:"].includes(abs.protocol) && abs.hostname === baseUrl.hostname) {
          abs.hash = "";
          links.add(abs.toString());
        }
      } catch {
        // skip malformed href
      }
    }
    match = re.exec(raw);
  }
  return [...links];
}

function buildAncestorUrls(targetUrl) {
  const segments = targetUrl.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set();
  for (let i = segments.length - 1; i >= 1; i -= 1) {
    const prefix = `/${segments.slice(0, i).join("/")}`;
    out.add(new URL(`${prefix}/`, targetUrl).toString());
    out.add(new URL(prefix, targetUrl).toString());
  }
  out.add(new URL("/", targetUrl).toString());
  return [...out];
}

function scoreCandidateUrl(candidateUrl, targetTokens) {
  const url = new URL(candidateUrl);
  const candidateTokens = tokenizePathHints(url.pathname);
  if (!candidateTokens.length || !targetTokens.length) return 0;
  const overlap = candidateTokens.filter((token) => targetTokens.includes(token)).length;
  return overlap / Math.max(targetTokens.length, 1);
}

async function discoverNearbyPage(targetUrl, { timeoutMs = 7000, queryHint = "" } = {}) {
  const tokens = [
    ...new Set([...tokenizePathHints(targetUrl.pathname), ...tokenizePathHints(queryHint)])
  ];
  if (!tokens.length) return null;

  const ancestors = buildAncestorUrls(targetUrl);
  for (const ancestor of ancestors) {
    const ancestorUrl = new URL(ancestor);
    let page;
    try {
      page = await fetchPage(ancestorUrl, { timeoutMs, allowNonOk: true });
    } catch {
      continue;
    }
    if (!page.ok || !page.isHtml) continue;

    const links = extractLinkCandidates(page.rawText, new URL(page.finalUrl));
    const scored = links
      .map((link) => ({ link, score: scoreCandidateUrl(link, tokens) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    for (const row of scored) {
      try {
        const candidatePage = await fetchPage(new URL(row.link), {
          timeoutMs,
          allowNonOk: true
        });
        if (candidatePage.ok) {
          return {
            url: candidatePage.finalUrl,
            discoveredFrom: ancestorUrl.toString(),
            score: Number(row.score.toFixed(3))
          };
        }
      } catch {
        // ignore and continue probing
      }
    }
  }
  return null;
}

function toWebDoc(page, meta = {}) {
  const rawText = String(page.rawText || "");
  const isHtml = Boolean(page.isHtml);
  return {
    url: String(page.finalUrl || page.requestedUrl),
    requestedUrl: String(page.requestedUrl || ""),
    discoveredFrom: meta.discoveredFrom || "",
    discoveryScore: meta.discoveryScore || 0,
    title: isHtml ? extractTitle(rawText) : "",
    contentType: page.contentType,
    retrievedAt: page.retrievedAt,
    rawChars: page.rawChars,
    text: isHtml ? stripHtml(rawText) : rawText.trim()
  };
}

export async function fetchWebDocument(
  rawUrl,
  { timeoutMs = 12000, discover = false, queryHint = "" } = {}
) {
  const url = ensureHttpUrl(rawUrl);
  const firstPage = await fetchPage(url, { timeoutMs, allowNonOk: true });
  if (firstPage.ok) {
    return toWebDoc(firstPage);
  }

  if (discover && Number(firstPage.status) === 404) {
    const discovered = await discoverNearbyPage(url, {
      timeoutMs: Math.max(3000, Math.min(timeoutMs, 7000)),
      queryHint
    });
    if (discovered?.url) {
      const repaired = await fetchPage(new URL(discovered.url), {
        timeoutMs,
        allowNonOk: false
      });
      return toWebDoc(repaired, {
        discoveredFrom: discovered.discoveredFrom,
        discoveryScore: discovered.score
      });
    }
  }

  const err = new Error(`Fetch failed with status ${firstPage.status}`);
  err.code = "FETCH_FAILED";
  err.status = firstPage.status;
  throw err;
}

export function truncateWebText(text, maxChars = DEFAULT_MAX_CHARS) {
  const max = Number.isFinite(Number(maxChars)) ? Math.max(500, Number(maxChars)) : DEFAULT_MAX_CHARS;
  return truncateText(String(text || ""), max);
}
