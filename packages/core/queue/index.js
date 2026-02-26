import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { DATA_DIR } from "../../../lib/storage.js";
import { safeJsonParse } from "../../../lib/utils.js";

const QUEUE_DIR = path.join(DATA_DIR, "queue");
const JOBS_DIR = path.join(QUEUE_DIR, "jobs");
const DEFAULT_LEASE_MS = 10 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function jobId() {
  return `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function toMs(ts) {
  const ms = Date.parse(String(ts || ""));
  return Number.isFinite(ms) ? ms : 0;
}

async function ensureQueue() {
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

function jobPath(id) {
  return path.join(JOBS_DIR, `${id}.json`);
}

async function writeJob(job) {
  await ensureQueue();
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2), "utf8");
  return job;
}

export async function getJob(id) {
  const raw = await fs.readFile(jobPath(id), "utf8");
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) {
    const err = new Error(`Invalid queue job JSON: ${id}`);
    err.code = "INVALID_JSON";
    throw err;
  }
  return parsed.value;
}

export async function listJobs({ limit = 200 } = {}) {
  await ensureQueue();
  const files = await fs.readdir(JOBS_DIR).catch(() => []);
  const jobs = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, file), "utf8");
      const parsed = safeJsonParse(raw);
      if (parsed.ok && parsed.value) jobs.push(parsed.value);
    } catch {
      // ignore malformed job file
    }
  }
  jobs.sort((a, b) => toMs(b.updatedAt || b.createdAt) - toMs(a.updatedAt || a.createdAt));
  return jobs.slice(0, Math.max(1, Number(limit) || 200));
}

export async function findJobByRunId(runId) {
  const rows = await listJobs({ limit: 2000 });
  return rows.find((job) => String(job.runId || "") === String(runId || "")) || null;
}

async function findByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey) return null;
  const rows = await listJobs({ limit: 5000 });
  return (
    rows.find((job) => {
      if (String(job.idempotencyKey || "") !== String(idempotencyKey)) return false;
      return ["pending", "running", "completed"].includes(String(job.status || ""));
    }) || null
  );
}

export async function enqueue(jobType, payload, opts = {}) {
  await ensureQueue();
  const idempotencyKey = String(opts.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { job: existing, deduped: true };
    }
  }

  const createdAt = nowIso();
  const job = {
    id: jobId(),
    runId: String(opts.runId || "").trim() || null,
    type: String(jobType || "").trim(),
    payload: payload || {},
    status: "pending",
    attempts: 0,
    maxAttempts: Math.max(1, Number(opts.maxAttempts || 3)),
    idempotencyKey: idempotencyKey || null,
    availableAt: String(opts.availableAt || createdAt),
    leaseUntil: null,
    workerId: null,
    result: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt
  };

  await writeJob(job);
  return { job, deduped: false };
}

export async function dequeue({ workerId = "worker", jobTypes = [], leaseMs = DEFAULT_LEASE_MS } = {}) {
  const rows = await listJobs({ limit: 5000 });
  const now = Date.now();
  const typeSet = new Set((jobTypes || []).map((t) => String(t)));

  const candidates = rows.filter((job) => {
    const status = String(job.status || "");
    const allowedType = !typeSet.size || typeSet.has(String(job.type || ""));
    if (!allowedType) return false;

    if (status === "pending") {
      return toMs(job.availableAt) <= now;
    }

    if (status === "running") {
      return toMs(job.leaseUntil) <= now;
    }

    return false;
  });

  candidates.sort((a, b) => {
    const aAvail = toMs(a.availableAt || a.createdAt);
    const bAvail = toMs(b.availableAt || b.createdAt);
    if (aAvail !== bAvail) return aAvail - bAvail;
    return toMs(a.createdAt) - toMs(b.createdAt);
  });

  const next = candidates[0];
  if (!next) return null;

  const updated = {
    ...next,
    status: "running",
    workerId,
    attempts: Number(next.attempts || 0) + 1,
    leaseUntil: new Date(now + Math.max(1000, Number(leaseMs) || DEFAULT_LEASE_MS)).toISOString(),
    startedAt: next.startedAt || nowIso(),
    updatedAt: nowIso()
  };
  await writeJob(updated);
  return updated;
}

export async function ack(jobIdValue, result = {}) {
  const current = await getJob(jobIdValue);
  const next = {
    ...current,
    status: "completed",
    result,
    leaseUntil: null,
    updatedAt: nowIso(),
    completedAt: nowIso()
  };
  await writeJob(next);
  return next;
}

export async function fail(jobIdValue, error, opts = {}) {
  const current = await getJob(jobIdValue);
  const attempts = Number(current.attempts || 0);
  const maxAttempts = Number(current.maxAttempts || 3);
  const retryable = attempts < maxAttempts;

  if (!retryable) {
    const final = {
      ...current,
      status: "failed",
      leaseUntil: null,
      updatedAt: nowIso(),
      failedAt: nowIso(),
      lastError: {
        code: error?.code || "JOB_FAILED",
        message: error?.message || "Job failed."
      }
    };
    await writeJob(final);
    return final;
  }

  const base = Math.max(250, Number(opts.backoffBaseMs || 500));
  const backoffMs = base * 2 ** Math.max(0, attempts - 1);
  const retry = {
    ...current,
    status: "pending",
    leaseUntil: null,
    updatedAt: nowIso(),
    availableAt: new Date(Date.now() + backoffMs).toISOString(),
    lastError: {
      code: error?.code || "JOB_FAILED",
      message: error?.message || "Job failed.",
      retryInMs: backoffMs
    }
  };
  await writeJob(retry);
  return retry;
}
