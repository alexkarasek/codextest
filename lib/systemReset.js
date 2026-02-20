import fs from "fs/promises";
import path from "path";
import {
  AGENTIC_APPROVALS_DIR,
  AGENTIC_DIR,
  AGENTIC_JOBS_DIR,
  AGENTIC_TASKS_DIR,
  DATA_DIR,
  DEBATES_DIR,
  DELETION_AUDIT_PATH,
  IMAGES_DIR,
  KNOWLEDGE_DIR,
  PERSONA_CHATS_DIR,
  PERSONAS_DIR,
  SETTINGS_DIR,
  SIMPLE_CHATS_DIR,
  SUPPORT_DIR,
  appendJsonl,
  ensureDataDirs
} from "./storage.js";
import { ensureDefaultAgenticTemplates } from "./agenticTemplateDefaults.js";

async function removeIfExists(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function clearDirContents(dirPath, { keepNames = [".gitkeep"] } = {}) {
  const keep = new Set(keepNames);
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (keep.has(entry.name)) continue;
    await removeIfExists(path.join(dirPath, entry.name));
  }
}

export async function resetDemoData(options = {}, actor = null) {
  const scope = String(options.scope || "usage").toLowerCase() === "full" ? "full" : "usage";
  const keepUsers = options.keepUsers !== false;
  const keepApiKeys = options.keepApiKeys !== false;
  const keepSettings = options.keepSettings !== false;
  const keepLogo = options.keepLogo !== false;

  await ensureDataDirs();

  // Usage/history artifacts
  await Promise.all([
    clearDirContents(DEBATES_DIR),
    clearDirContents(PERSONA_CHATS_DIR),
    clearDirContents(SIMPLE_CHATS_DIR),
    clearDirContents(SUPPORT_DIR),
    clearDirContents(AGENTIC_TASKS_DIR),
    clearDirContents(AGENTIC_APPROVALS_DIR),
    clearDirContents(AGENTIC_JOBS_DIR)
  ]);
  await Promise.all([
    removeIfExists(path.join(AGENTIC_DIR, "autonomy")),
    removeIfExists(path.join(AGENTIC_DIR, "notes")),
    removeIfExists(path.join(AGENTIC_DIR, "reports")),
    removeIfExists(path.join(AGENTIC_DIR, "task-events.jsonl")),
    removeIfExists(path.join(AGENTIC_DIR, "tool-usage.jsonl")),
    removeIfExists(path.join(SETTINGS_DIR, "usage.jsonl"))
  ]);
  if (keepLogo) {
    const logoDir = path.join(IMAGES_DIR, "logo");
    await fs.mkdir(logoDir, { recursive: true });
    await clearDirContents(IMAGES_DIR, { keepNames: [".gitkeep", "logo"] });
  } else {
    await clearDirContents(IMAGES_DIR);
  }

  if (scope === "full") {
    await Promise.all([
      clearDirContents(PERSONAS_DIR),
      clearDirContents(KNOWLEDGE_DIR)
    ]);
    if (!keepSettings) {
      await clearDirContents(SETTINGS_DIR, {
        keepNames: [
          ".gitkeep",
          ...(keepUsers ? ["users.json"] : []),
          ...(keepApiKeys ? ["api-keys.json"] : [])
        ]
      });
    } else {
      // Keep settings but rotate usage-level artifacts.
      await removeIfExists(DELETION_AUDIT_PATH);
      if (!keepUsers) {
        await removeIfExists(path.join(SETTINGS_DIR, "users.json"));
      }
      if (!keepApiKeys) {
        await removeIfExists(path.join(SETTINGS_DIR, "api-keys.json"));
      }
    }
  }

  await ensureDefaultAgenticTemplates();

  await appendJsonl(DELETION_AUDIT_PATH, {
    ts: new Date().toISOString(),
    entityType: "system-reset",
    entityId: scope,
    mode: scope,
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(options.reason || ""),
    options: {
      keepUsers,
      keepApiKeys,
      keepSettings,
      keepLogo
    }
  });

  return {
    scope,
    kept: {
      users: keepUsers,
      apiKeys: keepApiKeys,
      settings: keepSettings,
      logo: keepLogo
    },
    dataRoot: DATA_DIR
  };
}
