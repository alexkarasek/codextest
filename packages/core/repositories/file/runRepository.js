import fs from "fs/promises";
import path from "path";
import { RunRepository } from "../interfaces.js";
import { RUNS_META_DIR, DEBATES_DIR, readJsonFile, writeJsonFile } from "../../../../lib/storage.js";

function nowIso() {
  return new Date().toISOString();
}

function toMs(ts) {
  const ms = Date.parse(String(ts || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function runFilePath(runId) {
  return path.join(RUNS_META_DIR, `${runId}.json`);
}

function normalizeTokens(tokens = {}) {
  return {
    promptTokens: Number(tokens.promptTokens || 0) || 0,
    completionTokens: Number(tokens.completionTokens || 0) || 0,
    totalTokens: Number(tokens.totalTokens || 0) || 0
  };
}

function normalizeRun(input = {}) {
  const createdAt = String(input.createdAt || nowIso());
  const updatedAt = String(input.updatedAt || nowIso());
  return {
    id: String(input.id || "").trim(),
    requestId: input.requestId || null,
    kind: String(input.kind || "run"),
    status: String(input.status || "pending"),
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    durationMs: Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : null,
    tokens: normalizeTokens(input.tokens),
    estimatedCostUsd: Number(input.estimatedCostUsd || 0) || 0,
    score: input.score && typeof input.score === "object" ? input.score : null,
    error: input.error || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    createdAt,
    updatedAt
  };
}

export class FileRunRepository extends RunRepository {
  async ensureDir() {
    await fs.mkdir(RUNS_META_DIR, { recursive: true });
  }

  async upsert(run) {
    const normalized = normalizeRun(run);
    if (!normalized.id) {
      const err = new Error("run.id is required");
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    await this.ensureDir();
    const file = runFilePath(normalized.id);
    let existing = null;
    try {
      existing = await readJsonFile(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const now = nowIso();
    const merged = normalizeRun({
      ...(existing || {}),
      ...normalized,
      id: normalized.id,
      createdAt: existing?.createdAt || normalized.createdAt || now,
      updatedAt: now
    });

    await writeJsonFile(file, merged);
    return merged;
  }

  async getById(runId) {
    const id = String(runId || "").trim();
    if (!id) return null;
    try {
      return await readJsonFile(runFilePath(id));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async list({ limit = 100 } = {}) {
    await this.ensureDir();
    const files = await fs.readdir(RUNS_META_DIR).catch(() => []);
    const rows = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const run = await readJsonFile(path.join(RUNS_META_DIR, file));
        rows.push(normalizeRun(run));
      } catch {
        // skip malformed records
      }
    }
    rows.sort((a, b) => toMs(b.updatedAt || b.startedAt || b.createdAt) - toMs(a.updatedAt || a.startedAt || a.createdAt));
    return rows.slice(0, Math.max(1, Number(limit) || 100));
  }

  async migrateFromLegacyDebates({ limit = 500 } = {}) {
    await this.ensureDir();
    const entries = await fs.readdir(DEBATES_DIR, { withFileTypes: true }).catch(() => []);
    const dirs = entries.filter((entry) => entry.isDirectory()).slice(0, Math.max(1, Number(limit) || 500));

    let imported = 0;
    for (const entry of dirs) {
      const debateId = entry.name;
      const existing = await this.getById(debateId);
      if (existing) continue;
      const sessionPath = path.join(DEBATES_DIR, debateId, "session.json");
      try {
        const session = await readJsonFile(sessionPath);
        await this.upsert({
          id: debateId,
          requestId: null,
          kind: "debate",
          status: String(session?.status || "completed"),
          startedAt: session?.createdAt || null,
          finishedAt: session?.completedAt || null,
          durationMs: null,
          tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          estimatedCostUsd: 0,
          error: session?.error || null,
          metadata: {
            source: "legacy-debate",
            topic: session?.topic || "",
            participants: Array.isArray(session?.personas) ? session.personas.map((p) => p.displayName) : []
          },
          createdAt: session?.createdAt || nowIso(),
          updatedAt: session?.updatedAt || session?.completedAt || nowIso()
        });
        imported += 1;
      } catch {
        // ignore malformed debate folder
      }
    }

    return { imported };
  }
}
