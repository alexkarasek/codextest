import fs from "fs/promises";
import path from "path";
import { RUNS_DIR } from "./storage.js";
import { getRunRepository } from "./runRepository.js";
import { logEvent } from "./observability.js";

const FLAG_FILE = path.join(RUNS_DIR, ".legacy-seeded");

export async function ensureRunMetadataSeeded() {
  const repo = getRunRepository();
  await fs.mkdir(RUNS_DIR, { recursive: true });

  try {
    await fs.access(FLAG_FILE);
    return { seeded: false, reason: "already-seeded" };
  } catch {
    // continue
  }

  const existing = await repo.list({ limit: 1 });
  if (existing.length) {
    await fs.writeFile(FLAG_FILE, new Date().toISOString(), "utf8");
    return { seeded: false, reason: "repository-not-empty" };
  }

  const result = await repo.migrateFromLegacyDebates({ limit: 5000 });
  await fs.writeFile(FLAG_FILE, new Date().toISOString(), "utf8");
  logEvent("info", {
    component: "run-migration",
    eventType: "runs.legacy.seeded",
    imported: Number(result.imported || 0)
  });
  return { seeded: true, imported: Number(result.imported || 0) };
}
