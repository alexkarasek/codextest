import { getNewsApiKey, getNewsProvider } from "./config.js";
import { truncateText } from "./utils.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function nowMs() {
  return Date.now();
}

function cacheKey({ query, limit, recencyDays, provider }) {
  return JSON.stringify({ query, limit, recencyDays, provider });
}

function getCached(key) {
  const row = cache.get(key);
  if (!row) return null;
  if (nowMs() > row.expiresAt) {
    cache.delete(key);
    return null;
  }
  return row.data;
}

function setCached(key, data) {
  cache.set(key, { data, expiresAt: nowMs() + CACHE_TTL_MS });
}

function decodeXml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function pickTag(itemXml, tag) {
  const m = itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

function toIso(dateStr) {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchGoogleNews({ query, limit }) {
  const q = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google News RSS failed (${response.status})`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((m) => m[1])
    .slice(0, limit * 2);

  const parsed = items
    .map((itemXml) => {
      const titleRaw = pickTag(itemXml, "title");
      const title = titleRaw.replace(/\s*-\s*[^-]+$/, "").trim();
      const source = titleRaw.includes(" - ") ? titleRaw.split(" - ").slice(-1)[0].trim() : "Unknown";
      const url = pickTag(itemXml, "link");
      const publishedAt = toIso(pickTag(itemXml, "pubDate"));
      const snippet = truncateText(pickTag(itemXml, "description"), 260);
      return { title, source, url, publishedAt, snippet };
    })
    .filter((x) => x.title && x.url)
    .slice(0, limit);

  return {
    provider: "google-news-rss",
    items: parsed
  };
}

async function fetchNewsApi({ query, limit, recencyDays }) {
  const key = getNewsApiKey();
  if (!key) {
    throw new Error("NEWS_API_KEY is missing");
  }

  const from = new Date(nowMs() - recencyDays * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("from", from);
  url.searchParams.set("pageSize", String(Math.min(100, limit)));

  const response = await fetch(url, {
    headers: { "X-Api-Key": key }
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = body?.message || `NewsAPI failed (${response.status})`;
    throw new Error(msg);
  }

  const items = (body.articles || [])
    .map((article) => ({
      title: String(article.title || "").trim(),
      source: String(article?.source?.name || "Unknown").trim(),
      url: String(article.url || "").trim(),
      publishedAt: toIso(article.publishedAt),
      snippet: truncateText(article.description || article.content || "", 260)
    }))
    .filter((x) => x.title && x.url)
    .slice(0, limit);

  return {
    provider: "newsapi",
    items
  };
}

export async function discoverCurrentEventTopics({ query, limit = 8, recencyDays = 7, provider }) {
  const q = String(query || "").trim();
  if (!q) {
    throw new Error("query is required");
  }

  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 8));
  const safeRecency = Math.max(1, Math.min(30, Number(recencyDays) || 7));
  const preferredProvider = provider || getNewsProvider();

  const key = cacheKey({ query: q, limit: safeLimit, recencyDays: safeRecency, provider: preferredProvider });
  const cached = getCached(key);
  if (cached) return cached;

  let data;
  if (preferredProvider === "newsapi") {
    try {
      data = await fetchNewsApi({ query: q, limit: safeLimit, recencyDays: safeRecency });
    } catch {
      data = await fetchGoogleNews({ query: q, limit: safeLimit });
    }
  } else {
    try {
      data = await fetchGoogleNews({ query: q, limit: safeLimit });
    } catch {
      data = await fetchNewsApi({ query: q, limit: safeLimit, recencyDays: safeRecency });
    }
  }

  setCached(key, data);
  return data;
}
