import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "../../../lib/storage.js";
import { getObservabilityContext } from "../../../lib/observability.js";
import { safeJsonParse } from "../../../lib/utils.js";
import { listJobs } from "../queue/index.js";

export const EVENT_TYPES = {
  RunStarted: "RunStarted",
  RunFinished: "RunFinished",
  ToolInvoked: "ToolInvoked",
  ToolFinished: "ToolFinished",
  LLMCallStarted: "LLMCallStarted",
  LLMCallFinished: "LLMCallFinished",
  Error: "Error"
};

const EVENTS_DIR = path.join(DATA_DIR, "events");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");

const MODEL_PRICING_USD_PER_1M = {
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5.2": { input: 0.4, output: 1.6 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 }
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEvent(input) {
  const ctx = getObservabilityContext();
  const eventType = String(input?.eventType || "").trim();
  if (!eventType) {
    const err = new Error("eventType is required");
    err.code = "EVENT_VALIDATION_ERROR";
    throw err;
  }

  const timestamp = String(input?.timestamp || nowIso());
  const level = String(input?.level || "info");
  const runId = input?.runId || ctx.runId || null;
  const requestId = input?.requestId || ctx.requestId || null;

  return {
    timestamp,
    level,
    eventType,
    requestId,
    runId,
    component: String(input?.component || "app"),
    latencyMs: Number.isFinite(Number(input?.latencyMs)) ? Number(input.latencyMs) : null,
    error: input?.error || null,
    data: input?.data || {}
  };
}

async function ensureEventsFile() {
  await fs.mkdir(EVENTS_DIR, { recursive: true });
  await fs.appendFile(EVENTS_FILE, "", "utf8");
}

export async function appendEvent(input) {
  const event = normalizeEvent(input);
  await ensureEventsFile();
  await fs.appendFile(EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function listEvents({ limit = 500, runId = "" } = {}) {
  await ensureEventsFile();
  const raw = await fs.readFile(EVENTS_FILE, "utf8");
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeJsonParse(line))
    .filter((row) => row.ok && row.value)
    .map((row) => row.value)
    .filter((event) => !runId || String(event.runId || "") === String(runId));

  rows.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return rows.slice(-Math.max(1, Number(limit) || 500));
}

function extractUsage(event) {
  const usage = event?.data?.usage || {};
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens ?? promptTokens + completionTokens) || 0;
  return { promptTokens, completionTokens, totalTokens };
}

function estimateCostUsd({ model, promptTokens, completionTokens }) {
  const pricing = MODEL_PRICING_USD_PER_1M[String(model || "")] || null;
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}

export function summarizeRunEvents(runId, events = []) {
  const rows = (events || []).filter((e) => String(e.runId || "") === String(runId));
  const started = rows.find((e) => e.eventType === EVENT_TYPES.RunStarted) || null;
  const finished = [...rows].reverse().find((e) => e.eventType === EVENT_TYPES.RunFinished) || null;
  const errored = [...rows].reverse().find((e) => e.eventType === EVENT_TYPES.Error) || null;

  const llmFinished = rows.filter((e) => e.eventType === EVENT_TYPES.LLMCallFinished);
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;
  for (const event of llmFinished) {
    const usage = extractUsage(event);
    promptTokens += usage.promptTokens;
    completionTokens += usage.completionTokens;
    totalTokens += usage.totalTokens;
    estimatedCostUsd += estimateCostUsd({
      model: event?.data?.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens
    });
  }

  const startMs = started ? Date.parse(started.timestamp) : NaN;
  const endMs = finished ? Date.parse(finished.timestamp) : NaN;
  const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null;

  let status = "running";
  if (finished) {
    status = String(finished?.data?.status || "completed");
  } else if (errored) {
    status = "failed";
  }

  return {
    runId,
    requestId: started?.requestId || rows.find((e) => e.requestId)?.requestId || null,
    component: started?.component || rows.find((e) => e.component)?.component || null,
    status,
    startedAt: started?.timestamp || null,
    finishedAt: finished?.timestamp || null,
    durationMs,
    llmCalls: llmFinished.length,
    toolCalls: rows.filter((e) => e.eventType === EVENT_TYPES.ToolFinished).length,
    eventCount: rows.length,
    tokens: {
      promptTokens,
      completionTokens,
      totalTokens
    },
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(8)),
    error: errored?.error || finished?.error || null
  };
}

export async function listRuns({ limit = 25 } = {}) {
  const events = await listEvents({ limit: 5000 });
  const runIds = [...new Set(events.map((e) => String(e.runId || "").trim()).filter(Boolean))];
  const summaries = runIds.map((runId) => summarizeRunEvents(runId, events));
  const existing = new Set(summaries.map((s) => String(s.runId || "")));
  const jobs = await listJobs({ limit: 2000 });
  for (const job of jobs) {
    const runId = String(job.runId || "").trim();
    if (!runId || existing.has(runId)) continue;
    summaries.push({
      runId,
      requestId: String(job.payload?.requestId || "") || null,
      component: "queue",
      status: String(job.status || "pending"),
      startedAt: job.startedAt || null,
      finishedAt: job.completedAt || job.failedAt || null,
      durationMs: null,
      llmCalls: 0,
      toolCalls: 0,
      eventCount: 0,
      tokens: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      estimatedCostUsd: 0,
      error: job.lastError || null
    });
  }
  summaries.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
  return summaries.slice(0, Math.max(1, Number(limit) || 25));
}

export async function getRunDetails(runId) {
  const events = await listEvents({ limit: 5000, runId });
  return {
    summary: summarizeRunEvents(runId, events),
    events
  };
}

export async function recordErrorEvent({ component = "app", error, runId = null, requestId = null, data = {} }) {
  const message = String(error?.message || "Unknown error");
  return appendEvent({
    eventType: EVENT_TYPES.Error,
    level: "error",
    component,
    runId,
    requestId,
    error: {
      code: error?.code || "ERROR",
      message,
      status: Number(error?.status || 0) || null
    },
    data
  });
}
