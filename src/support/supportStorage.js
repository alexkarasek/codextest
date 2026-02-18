import fs from "fs/promises";
import path from "path";
import { safeJsonParse } from "../../lib/utils.js";
import { SUPPORT_DIR, ensureDataDirs } from "../../lib/storage.js";

const SUPPORT_LOG_PATH = path.join(SUPPORT_DIR, "messages.jsonl");

export async function appendSupportMessage(entry) {
  await ensureDataDirs();
  await fs.appendFile(SUPPORT_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function listSupportMessages({ userId = null, username = null, limit = 10 } = {}) {
  await ensureDataDirs();
  let raw = "";
  try {
    raw = await fs.readFile(SUPPORT_LOG_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeJsonParse(line))
    .filter((p) => p.ok && p.value)
    .map((p) => p.value);

  let filtered = rows;
  if (userId || username) {
    filtered = rows.filter((row) => {
      if (userId && row.userId === userId) return true;
      if (username && row.username === username) return true;
      return false;
    });
  }

  return filtered.slice(-Math.max(1, Math.min(50, Number(limit) || 10)));
}
