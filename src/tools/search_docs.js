import fs from "fs/promises";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "docs");
const README_PATH = path.join(process.cwd(), "README.md");

function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function headingForLine(lines, index) {
  for (let i = index; i >= 0; i -= 1) {
    const line = String(lines[i] || "").trim();
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) return m[2].trim();
  }
  return "(document root)";
}

function snippetAround(lines, index, radius = 3) {
  const start = Math.max(0, index - radius);
  const end = Math.min(lines.length - 1, index + radius);
  return lines.slice(start, end + 1).join("\n").trim();
}

async function listDocFiles() {
  const files = [];
  try {
    const entries = await fs.readdir(DOCS_DIR);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith(".md")) {
        files.push(path.join(DOCS_DIR, entry));
      }
    }
  } catch {
    // docs dir may not exist in very early bootstrap
  }
  files.push(README_PATH);
  return files;
}

export async function searchDocs({ query, limit = 6 }) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Number(limit))) : 6;
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];

  const files = await listDocFiles();
  const matches = [];

  for (const filePath of files) {
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = raw.split(/\r?\n/);
    lines.forEach((line, index) => {
      const low = String(line || "").toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (low.includes(term)) score += 1;
      }
      if (score <= 0) return;
      if (/^#{1,6}\s+/.test(line)) score += 0.5;
      matches.push({
        filePath,
        file: path.relative(process.cwd(), filePath),
        heading: headingForLine(lines, index),
        excerpt: snippetAround(lines, index, 3),
        score
      });
    });
  }

  matches.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const dedup = [];
  const seen = new Set();
  for (const row of matches) {
    const key = `${row.file}::${row.heading}::${row.excerpt.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push({
      file: row.file,
      heading: row.heading,
      excerpt: row.excerpt
    });
    if (dedup.length >= safeLimit) break;
  }

  return dedup;
}
