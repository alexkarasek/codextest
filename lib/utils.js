export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function timestampForId(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export function truncateText(text, maxLen = 500) {
  const str = String(text || "");
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toWordsLimitInstruction(maxWordsPerTurn) {
  return `Keep your response under ${maxWordsPerTurn} words.`;
}

export function safeJsonParse(content) {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (error) {
    return { ok: false, error };
  }
}
