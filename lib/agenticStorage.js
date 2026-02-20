import fs from "fs/promises";
import path from "path";
import {
  AGENTIC_APPROVALS_DIR,
  AGENTIC_JOBS_DIR,
  AGENTIC_WATCHERS_DIR,
  AGENTIC_TASKS_DIR,
  AGENTIC_DIR,
  ensureDataDirs,
  readJsonFile,
  writeJsonFile,
  appendJsonl
} from "./storage.js";

const TASK_EVENTS_PATH = path.join(AGENTIC_DIR, "task-events.jsonl");
const TOOL_USAGE_PATH = path.join(AGENTIC_DIR, "tool-usage.jsonl");
const TASK_TEMPLATES_PATH = path.join(AGENTIC_DIR, "task-templates.json");
const WATCHER_EVENTS_PATH = path.join(AGENTIC_DIR, "watcher-events.jsonl");

export async function ensureAgenticDirs() {
  await ensureDataDirs();
}

function taskPath(taskId) {
  return path.join(AGENTIC_TASKS_DIR, `${taskId}.json`);
}

function approvalPath(approvalId) {
  return path.join(AGENTIC_APPROVALS_DIR, `${approvalId}.json`);
}

function jobPath(jobId) {
  return path.join(AGENTIC_JOBS_DIR, `${jobId}.json`);
}

export async function saveTask(task) {
  await ensureAgenticDirs();
  await writeJsonFile(taskPath(task.id), task);
  return task;
}

export async function getTask(taskId) {
  return readJsonFile(taskPath(taskId));
}

export async function updateTask(taskId, updater) {
  const current = await getTask(taskId);
  const next = typeof updater === "function" ? updater(current) : updater;
  await saveTask(next);
  return next;
}

export async function listTasks({ status = "" } = {}) {
  await ensureAgenticDirs();
  let files = [];
  try {
    files = await fs.readdir(AGENTIC_TASKS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const rows = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const task = await readJsonFile(path.join(AGENTIC_TASKS_DIR, file));
      if (status && String(task.status || "") !== status) continue;
      rows.push(task);
    } catch {
      // skip invalid rows
    }
  }
  rows.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  return rows;
}

export async function saveApproval(approval) {
  await ensureAgenticDirs();
  await writeJsonFile(approvalPath(approval.id), approval);
  return approval;
}

export async function getApproval(approvalId) {
  return readJsonFile(approvalPath(approvalId));
}

export async function updateApproval(approvalId, updater) {
  const current = await getApproval(approvalId);
  const next = typeof updater === "function" ? updater(current) : updater;
  await saveApproval(next);
  return next;
}

export async function listApprovals({ status = "" } = {}) {
  await ensureAgenticDirs();
  let files = [];
  try {
    files = await fs.readdir(AGENTIC_APPROVALS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const rows = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const approval = await readJsonFile(path.join(AGENTIC_APPROVALS_DIR, file));
      if (status && String(approval.status || "") !== status) continue;
      rows.push(approval);
    } catch {
      // skip malformed records
    }
  }
  rows.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  return rows;
}

export async function saveJob(job) {
  await ensureAgenticDirs();
  await writeJsonFile(jobPath(job.id), job);
  return job;
}

export async function getJob(jobId) {
  return readJsonFile(jobPath(jobId));
}

export async function listJobs() {
  await ensureAgenticDirs();
  let files = [];
  try {
    files = await fs.readdir(AGENTIC_JOBS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const rows = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      rows.push(await readJsonFile(path.join(AGENTIC_JOBS_DIR, file)));
    } catch {
      // skip bad files
    }
  }
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows;
}

function watcherPath(watcherId) {
  return path.join(AGENTIC_WATCHERS_DIR, `${watcherId}.json`);
}

export async function saveWatcher(watcher) {
  await ensureAgenticDirs();
  await writeJsonFile(watcherPath(watcher.id), watcher);
  return watcher;
}

export async function getWatcher(watcherId) {
  return readJsonFile(watcherPath(watcherId));
}

export async function updateWatcher(watcherId, updater) {
  const current = await getWatcher(watcherId);
  const next = typeof updater === "function" ? updater(current) : updater;
  await saveWatcher(next);
  return next;
}

export async function listWatchers() {
  await ensureAgenticDirs();
  let files = [];
  try {
    files = await fs.readdir(AGENTIC_WATCHERS_DIR);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const rows = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      rows.push(await readJsonFile(path.join(AGENTIC_WATCHERS_DIR, file)));
    } catch {
      // skip bad files
    }
  }
  rows.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  return rows;
}

export async function deleteWatcher(watcherId) {
  await ensureAgenticDirs();
  try {
    await fs.rm(watcherPath(watcherId), { force: true });
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function appendTaskEvent(event) {
  await ensureAgenticDirs();
  await appendJsonl(TASK_EVENTS_PATH, event);
}

export async function appendToolUsage(event) {
  await ensureAgenticDirs();
  await appendJsonl(TOOL_USAGE_PATH, event);
}

export async function appendWatcherEvent(event) {
  await ensureAgenticDirs();
  await appendJsonl(WATCHER_EVENTS_PATH, event);
}

export async function readJsonl(filePath, { limit = 1000 } = {}) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const rows = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return rows;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function listTaskEvents(limit = 1000) {
  return readJsonl(TASK_EVENTS_PATH, { limit });
}

export async function listToolUsage(limit = 1000) {
  return readJsonl(TOOL_USAGE_PATH, { limit });
}

export async function listTaskTemplates() {
  await ensureAgenticDirs();
  try {
    const data = await readJsonFile(TASK_TEMPLATES_PATH);
    const templates = Array.isArray(data.templates) ? data.templates : [];
    return templates.sort((a, b) =>
      String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
    );
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveTaskTemplate(template, { bumpVersion = true } = {}) {
  await ensureAgenticDirs();
  const existing = await listTaskTemplates();
  const now = new Date().toISOString();
  const currentVersion = Number(template?.version);
  const row = {
    ...template,
    createdAt: template.createdAt || now,
    updatedAt: now
  };
  const idx = existing.findIndex((item) => item.id === row.id);
  if (idx >= 0) {
    const prev = existing[idx];
    const prevVersion = Number(prev?.version || 1) || 1;
    const nextVersion = Number.isFinite(currentVersion) && currentVersion > 0
      ? currentVersion
      : (bumpVersion ? prevVersion + 1 : prevVersion);
    existing[idx] = {
      ...existing[idx],
      ...row,
      createdAt: existing[idx].createdAt || row.createdAt,
      version: nextVersion
    };
  } else {
    const nextVersion = Number.isFinite(currentVersion) && currentVersion > 0 ? currentVersion : 1;
    existing.push({ ...row, version: nextVersion });
  }
  await writeJsonFile(TASK_TEMPLATES_PATH, { templates: existing });
  return existing[idx >= 0 ? idx : existing.length - 1];
}

export async function deleteTaskTemplate(templateId) {
  await ensureAgenticDirs();
  const existing = await listTaskTemplates();
  const filtered = existing.filter((item) => item.id !== templateId);
  if (filtered.length === existing.length) return false;
  await writeJsonFile(TASK_TEMPLATES_PATH, { templates: filtered });
  return true;
}
