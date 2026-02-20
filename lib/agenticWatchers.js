import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fetchWebDocument } from "./webFetch.js";
import { appendWatcherEvent, getWatcher, saveWatcher, updateWatcher } from "./agenticStorage.js";
import { createTaskDraft, runTask } from "./taskRunner.js";
import { ingestUrlToKnowledgePack } from "./knowledgeIngest.js";
import { getKnowledgePack, saveKnowledgePack } from "./storage.js";
import { slugify, timestampForId, truncateText } from "./utils.js";

function nowIso() {
  return new Date().toISOString();
}

function hashContent(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function assertWorkspacePath(filePath) {
  const root = process.cwd();
  const resolved = path.resolve(root, String(filePath || ""));
  if (!resolved.startsWith(root)) {
    const err = new Error("Path must remain within workspace.");
    err.code = "WATCHER_PATH_FORBIDDEN";
    throw err;
  }
  return resolved;
}

async function readTargetSnapshot(watcher) {
  const check = watcher?.check || {};
  if (check.type === "http") {
    const doc = await fetchWebDocument(check.url);
    return {
      source: "http",
      identifier: doc.url,
      content: doc.text || "",
      meta: {
        url: doc.url,
        contentType: doc.contentType,
        retrievedAt: doc.retrievedAt
      }
    };
  }
  if (check.type === "file") {
    const resolved = assertWorkspacePath(check.path);
    const content = await fs.readFile(resolved, "utf8");
    return {
      source: "file",
      identifier: path.relative(process.cwd(), resolved),
      content,
      meta: {
        path: path.relative(process.cwd(), resolved)
      }
    };
  }
  const err = new Error("Unsupported watcher check type.");
  err.code = "WATCHER_INVALID_TYPE";
  throw err;
}

function normalizeTemplate(template, watcher, snapshot) {
  const baseTitle = template?.title || watcher?.name || "Watcher Task";
  const title = `${baseTitle} (${watcher.id})`;
  const contextSummary = [
    `Watcher: ${watcher.name || watcher.id}`,
    `Target: ${watcher.check?.type || "unknown"} ${watcher.check?.url || watcher.check?.path || ""}`,
    `Retrieved: ${snapshot?.meta?.retrievedAt || nowIso()}`
  ].join("\n");
  return {
    title,
    objective: `${String(template?.objective || "").trim()}\n\n${contextSummary}`.trim(),
    team: template?.team || {},
    settings: template?.settings || {},
    steps: Array.isArray(template?.steps) ? template.steps : [],
    packId: String(template?.packId || "")
  };
}

async function triggerWatcherTask({ watcher, snapshot, user }) {
  const template = normalizeTemplate(watcher.action?.template || {}, watcher, snapshot);
  if (watcher.action?.type === "knowledge-pack" && template.packId) {
    if (!watcher.check || watcher.check.type !== "http") {
      const err = new Error("Knowledge pack watchers require http check type.");
      err.code = "WATCHER_INVALID_ACTION";
      throw err;
    }
    const mode = String(watcher.action?.mode || "append");
    const { pack } = await ingestUrlToKnowledgePack({
      url: watcher.check.url,
      id: template.packId,
      title: template.title || "",
      description: template.objective || "",
      tags: watcher.action?.tags || [],
      summarize: watcher.action?.summarize !== false
    });
    if (mode === "append") {
      const existing = await getKnowledgePack(pack.id);
      const merged = {
        ...existing,
        title: pack.title || existing.title,
        description: pack.description || existing.description,
        tags: Array.from(new Set([...(existing.tags || []), ...(pack.tags || [])])),
        content: [existing.content, pack.content].filter(Boolean).join("\n\n"),
        updatedAt: new Date().toISOString(),
        sourceUrl: pack.sourceUrl || existing.sourceUrl,
        retrievedAt: pack.retrievedAt || existing.retrievedAt
      };
      await saveKnowledgePack(merged);
      return { type: "knowledge-pack", packId: merged.id, mode };
    }
    if (mode === "overwrite") {
      await saveKnowledgePack(pack);
      return { type: "knowledge-pack", packId: pack.id, mode };
    }
    await saveKnowledgePack(pack);
    return { type: "knowledge-pack", packId: pack.id, mode };
  }
  const task = await createTaskDraft({
    title: template.title,
    objective: template.objective,
    team: template.team,
    settings: template.settings,
    steps: template.steps,
    user
  });
  if (watcher.action?.runImmediately) {
    await runTask(task.id, { user, maxSteps: 200 });
  }
  return task;
}

export async function createWatcher({ name, check, action, enabled = true, createdBy }) {
  const id = `watch-${timestampForId()}-${slugify(name) || "watcher"}`;
  const now = nowIso();
  const watcher = {
    id,
    name: String(name || "Watcher"),
    enabled: Boolean(enabled),
    check,
    action,
    createdAt: now,
    updatedAt: now,
    createdBy: createdBy?.id || null,
    createdByUsername: createdBy?.username || null,
    lastRunAt: null,
    lastChangeAt: null,
    lastHash: "",
    lastSummary: "",
    lastTaskId: null,
    lastError: null
  };
  await saveWatcher(watcher);
  return watcher;
}

export async function runWatcher(watcherId, { user } = {}) {
  const watcher = await getWatcher(watcherId);
  if (!watcher.enabled) {
    return {
      watcher,
      changed: false,
      status: "disabled"
    };
  }

  let snapshot;
  try {
    snapshot = await readTargetSnapshot(watcher);
  } catch (error) {
    const updated = await updateWatcher(watcher.id, (current) => ({
      ...current,
      lastRunAt: nowIso(),
      lastError: error.message,
      updatedAt: nowIso()
    }));
    await appendWatcherEvent({
      ts: nowIso(),
      watcherId: watcher.id,
      status: "error",
      error: error.message
    });
    return { watcher: updated, changed: false, status: "error", error: error.message };
  }

  const contentHash = hashContent(snapshot.content || "");
  const changed = !watcher.lastHash || watcher.lastHash !== contentHash;
  let task = null;
  let summary = "";

  if (changed && watcher.action?.type) {
    const result = await triggerWatcherTask({ watcher, snapshot, user });
    if (result?.type === "knowledge-pack") {
      summary = `Change detected (${snapshot.identifier}). Updated knowledge pack ${result.packId}.`;
    } else {
      task = result;
      summary = `Change detected (${snapshot.identifier}). Triggered task ${result?.id || result?.taskId || "unknown"}.`;
    }
  } else {
    summary = changed
      ? `Change detected (${snapshot.identifier}) but no action configured.`
      : `No change detected (${snapshot.identifier}).`;
  }

  const updated = await updateWatcher(watcher.id, (current) => ({
    ...current,
    lastRunAt: nowIso(),
    lastChangeAt: changed ? nowIso() : current.lastChangeAt || null,
    lastHash: contentHash,
    lastSummary: truncateText(summary, 500),
    lastTaskId: task?.id || current.lastTaskId || null,
    lastError: null,
    updatedAt: nowIso()
  }));

  await appendWatcherEvent({
    ts: nowIso(),
    watcherId: watcher.id,
    status: changed ? "changed" : "unchanged",
    target: snapshot.identifier,
    taskId: task?.id || null
  });

  return {
    watcher: updated,
    changed,
    status: changed ? "changed" : "unchanged",
    task
  };
}
