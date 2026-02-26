import fs from "fs/promises";
import path from "path";
import { enqueue } from "../packages/core/queue/index.js";
import { runTool } from "./agenticTools.js";
import { chatCompletion } from "./llm.js";
import { slugify, timestampForId, truncateText } from "./utils.js";
import {
  appendWorkflowEvent,
  getWorkflow,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflows,
  saveWorkflow,
  saveWorkflowRun,
  updateWorkflow
} from "./agenticStorage.js";

function nowIso() {
  return new Date().toISOString();
}

function workflowRunId(workflowId) {
  return `wfr-${timestampForId()}-${slugify(workflowId || "workflow") || "workflow"}`;
}

function interpolate(value, context) {
  if (typeof value === "string") {
    return value.replace(/{{\s*([^{}]+)\s*}}/g, (_all, expr) => {
      const pathExpr = String(expr || "").trim();
      const parts = pathExpr.split(".").map((p) => p.trim()).filter(Boolean);
      let curr = context;
      for (const part of parts) {
        if (curr == null) return "";
        curr = curr[part];
      }
      if (curr == null) return "";
      if (typeof curr === "object") return JSON.stringify(curr);
      return String(curr);
    });
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, context));
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = interpolate(v, context);
    });
    return out;
  }
  return value;
}

function shouldRunCron(trigger, now = new Date()) {
  const raw = String(trigger?.cron || "").trim();
  if (!raw) return false;
  // lightweight support for patterns: "* * * * *" and "*/N * * * *"
  if (raw === "* * * * *") return true;
  const m = raw.match(/^\*\/(\d{1,2})\s+\*\s+\*\s+\*\s+\*$/);
  if (!m) return false;
  const every = Number(m[1]);
  if (!Number.isFinite(every) || every <= 0) return false;
  return now.getUTCMinutes() % every === 0;
}

export async function createWorkflow({ id, name, enabled = true, trigger, steps, user = null }) {
  const now = nowIso();
  const row = {
    id,
    name,
    enabled: Boolean(enabled),
    trigger: trigger || { type: "manual", cron: "", event: "", secret: "" },
    steps: Array.isArray(steps) ? steps : [],
    createdAt: now,
    updatedAt: now,
    createdBy: user?.id || null,
    createdByUsername: user?.username || null,
    lastTriggeredAt: null,
    lastRunId: null
  };
  await saveWorkflow(row);
  await appendWorkflowEvent({
    ts: now,
    type: "workflow_created",
    workflowId: row.id,
    createdBy: row.createdBy,
    createdByUsername: row.createdByUsername
  });
  return row;
}

export async function queueWorkflowRun({ workflowId, triggerType = "manual", triggerPayload = {}, requestId = null, user = null }) {
  const workflow = await getWorkflow(workflowId);
  if (!workflow.enabled) {
    const err = new Error(`Workflow '${workflowId}' is disabled.`);
    err.code = "WORKFLOW_DISABLED";
    throw err;
  }

  const runId = workflowRunId(workflowId);
  const queued = await enqueue(
    "RUN_WORKFLOW",
    {
      workflowId,
      triggerType,
      triggerPayload,
      requestId,
      runId,
      userId: user?.id || null,
      username: user?.username || null
    },
    {
      runId,
      idempotencyKey: `RUN_WORKFLOW:${workflowId}:${triggerType}:${timestampForId().slice(0, 11)}`,
      maxAttempts: 3
    }
  );

  const now = nowIso();
  await saveWorkflowRun({
    id: runId,
    workflowId,
    status: "queued",
    triggerType,
    triggerPayload,
    createdAt: now,
    updatedAt: now,
    jobId: queued.job.id,
    steps: [],
    output: null,
    error: null
  });

  await updateWorkflow(workflowId, (current) => ({
    ...current,
    updatedAt: now,
    lastTriggeredAt: now,
    lastRunId: runId
  }));

  await appendWorkflowEvent({
    ts: now,
    type: "workflow_queued",
    workflowId,
    runId,
    jobId: queued.job.id,
    triggerType,
    triggerPayload
  });

  return { runId, jobId: queued.job.id, deduped: queued.deduped };
}

async function runWorkflowStep(step, context) {
  const input = interpolate(step.input || {}, context);
  const type = String(step.type || "");

  if (type === "condition") {
    const left = String(input.left || "");
    const op = String(input.op || "equals");
    const right = String(input.right || "");
    let passed = false;
    if (op === "equals") passed = left === right;
    else if (op === "contains") passed = left.includes(right);
    else if (op === "exists") passed = Boolean(left);
    return { passed, left, op, right };
  }

  if (type === "httpRequest") {
    return runTool("http.request", {
      url: String(input.url || ""),
      method: String(input.method || "GET"),
      headers: input.headers || {},
      body: typeof input.body === "undefined" ? undefined : input.body,
      timeoutMs: Number(input.timeoutMs || 15000)
    }, context);
  }

  if (type === "sendMessage") {
    return {
      channel: String(input.channel || "log"),
      message: String(input.message || ""),
      delivered: false,
      note: "Connector stub in MVP."
    };
  }

  if (type === "runDebate") {
    const topic = String(input.topic || "").trim();
    if (!topic) {
      const err = new Error("runDebate step requires topic");
      err.code = "VALIDATION_ERROR";
      throw err;
    }
    const run = await enqueue(
      "RUN_DEBATE",
      {
        debateId: String(input.debateId || "").trim() || `wf-${timestampForId()}-${slugify(topic).slice(0, 42)}`,
        requestId: context.requestId || null,
        runId: String(input.runId || "").trim() || null,
        workflowId: context.workflowId,
        workflowRunId: context.workflowRunId
      },
      {
        runId: String(input.runId || "").trim() || null,
        maxAttempts: 3
      }
    );
    return {
      enqueued: true,
      jobId: run.job.id,
      deduped: run.deduped
    };
  }

  if (type === "transform") {
    if (input.template) {
      const text = interpolate(String(input.template || ""), context);
      return { text };
    }
    if (input.prompt) {
      const response = await chatCompletion({
        model: String(context.model || "gpt-5-mini"),
        temperature: 0.2,
        messages: [
          { role: "system", content: "Transform workflow data into concise output." },
          { role: "user", content: String(input.prompt || "") }
        ]
      });
      return { text: String(response.text || "").trim() };
    }
    return { text: "" };
  }

  if (type === "persistRecord") {
    const relative = String(input.path || `data/agentic/workflow-records/${context.workflowId}.txt`);
    const full = path.resolve(process.cwd(), relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const content = String(input.content || input.text || "");
    if (Boolean(input.append)) {
      await fs.appendFile(full, content, "utf8");
    } else {
      await fs.writeFile(full, content, "utf8");
    }
    return {
      path: relative,
      bytesWritten: Buffer.byteLength(content, "utf8"),
      append: Boolean(input.append)
    };
  }

  const err = new Error(`Unsupported workflow step type '${type}'.`);
  err.code = "UNSUPPORTED_WORKFLOW_STEP";
  throw err;
}

export async function executeWorkflowRun({ workflowId, workflowRunId, requestId = null, triggerType = "manual", triggerPayload = {}, user = null }) {
  const workflow = await getWorkflow(workflowId);
  const run = await getWorkflowRun(workflowRunId);
  const now = nowIso();
  const context = {
    workflowId,
    workflowRunId,
    requestId,
    triggerType,
    triggerPayload,
    userId: user?.id || null,
    username: user?.username || null,
    model: "gpt-5-mini",
    steps: {}
  };

  await saveWorkflowRun({
    ...run,
    status: "running",
    updatedAt: now,
    startedAt: run.startedAt || now,
    requestId
  });

  const stepResults = [];
  try {
    for (let i = 0; i < (workflow.steps || []).length; i += 1) {
      const step = workflow.steps[i];
      const stepId = String(step.id || `step-${i + 1}`);
      const stepName = String(step.name || stepId);
      const result = await runWorkflowStep(step, context);
      context.steps[stepId] = result;
      stepResults.push({
        id: stepId,
        name: stepName,
        type: step.type,
        status: "completed",
        result
      });
      if (step.type === "condition" && result?.passed === false) {
        break;
      }
    }

    const completed = {
      ...run,
      status: "completed",
      updatedAt: nowIso(),
      completedAt: nowIso(),
      triggerType,
      triggerPayload,
      steps: stepResults,
      output: {
        summary: `Completed ${stepResults.length} step(s).`,
        lastStep: stepResults[stepResults.length - 1] || null
      },
      error: null
    };
    await saveWorkflowRun(completed);
    await appendWorkflowEvent({
      ts: nowIso(),
      type: "workflow_completed",
      workflowId,
      runId: workflowRunId,
      stepCount: stepResults.length
    });
    return completed;
  } catch (error) {
    const failed = {
      ...run,
      status: "failed",
      updatedAt: nowIso(),
      completedAt: nowIso(),
      triggerType,
      triggerPayload,
      steps: stepResults,
      error: {
        code: error?.code || "WORKFLOW_RUN_FAILED",
        message: error?.message || "Workflow run failed."
      }
    };
    await saveWorkflowRun(failed);
    await appendWorkflowEvent({
      ts: nowIso(),
      type: "workflow_failed",
      workflowId,
      runId: workflowRunId,
      error: failed.error
    });
    throw error;
  }
}

export async function queueRunCompletedWorkflows({ runId, requestId = null, event = "run.finished", payload = {} }) {
  const workflows = await listWorkflows();
  const matched = workflows.filter(
    (wf) => wf.enabled && String(wf.trigger?.type || "") === "runCompleted" && (!wf.trigger?.event || wf.trigger.event === event)
  );
  const queued = [];
  for (const wf of matched) {
    const q = await queueWorkflowRun({
      workflowId: wf.id,
      triggerType: "runCompleted",
      triggerPayload: {
        event,
        runId,
        ...payload
      },
      requestId
    });
    queued.push({ workflowId: wf.id, ...q });
  }
  return queued;
}

export async function pollAndQueueCronWorkflows({ now = new Date(), requestId = null } = {}) {
  const workflows = await listWorkflows();
  const candidates = workflows.filter((wf) => wf.enabled && String(wf.trigger?.type || "") === "cron" && shouldRunCron(wf.trigger, now));
  const queued = [];
  for (const wf of candidates) {
    const last = wf.lastTriggeredAt ? Date.parse(wf.lastTriggeredAt) : 0;
    if (Number.isFinite(last) && now.getTime() - last < 55_000) {
      continue;
    }
    const q = await queueWorkflowRun({
      workflowId: wf.id,
      triggerType: "cron",
      triggerPayload: { cron: wf.trigger?.cron || "" },
      requestId
    });
    queued.push({ workflowId: wf.id, ...q });
  }
  return queued;
}

export async function getWorkflowOverview({ limitRuns = 200 } = {}) {
  const [workflows, runs] = await Promise.all([listWorkflows(), listWorkflowRuns({ limit: limitRuns })]);
  const runsByWorkflow = new Map();
  runs.forEach((run) => {
    const key = String(run.workflowId || "");
    if (!runsByWorkflow.has(key)) runsByWorkflow.set(key, []);
    runsByWorkflow.get(key).push(run);
  });

  const rows = workflows.map((wf) => {
    const r = (runsByWorkflow.get(wf.id) || []).slice(0, 20);
    const latest = r[0] || null;
    return {
      ...wf,
      latestRun: latest,
      runCount: r.length,
      failedCount: r.filter((x) => x.status === "failed").length
    };
  });

  return {
    workflows: rows,
    runs
  };
}
