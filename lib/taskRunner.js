import { chatCompletion } from "./llm.js";
import { runTool } from "./agenticTools.js";
import {
  appendTaskEvent,
  appendToolUsage,
  getApproval,
  getTask,
  saveApproval,
  saveTask,
  updateApproval,
  updateTask
} from "./agenticStorage.js";
import { routeTeam } from "./teamRouter.js";
import { slugify, timestampForId, truncateText } from "./utils.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix, label = "") {
  return `${prefix}-${timestampForId()}-${slugify(label || prefix) || prefix}-${Math.random().toString(36).slice(2, 7)}`;
}

function findStep(task, stepId) {
  return (task.steps || []).find((s) => s.id === stepId);
}

function depsCompleted(task, step) {
  const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [];
  if (!deps.length) return true;
  return deps.every((id) => {
    const dep = findStep(task, id);
    return dep && dep.status === "completed";
  });
}

function nextRunnableStep(task) {
  return (task.steps || []).find((step) => step.status === "pending" && depsCompleted(task, step));
}

function getByPath(target, dotPath) {
  const parts = String(dotPath || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let current = target;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function templateContextForTask(task) {
  const steps = {};
  (task.steps || []).forEach((step) => {
    steps[step.id] = {
      id: step.id,
      name: step.name,
      type: step.type,
      toolId: step.toolId || "",
      status: step.status,
      input: step.input || {},
      result: step.result || {},
      error: step.error || null,
      startedAt: step.startedAt || null,
      completedAt: step.completedAt || null
    };
  });
  return { steps };
}

function interpolateTemplateString(value, task) {
  const source = String(value || "");
  const context = templateContextForTask(task);
  return source.replace(/{{\s*([^{}]+)\s*}}/g, (_all, expr) => {
    const trimmed = String(expr || "").trim();
    const resolved = getByPath(context, trimmed);
    if (typeof resolved === "undefined" || resolved === null) return "";
    if (typeof resolved === "object") return JSON.stringify(resolved);
    return String(resolved);
  });
}

function resolveTemplatedValue(value, task) {
  if (typeof value === "string") {
    return interpolateTemplateString(value, task);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplatedValue(item, task));
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      out[key] = resolveTemplatedValue(item, task);
    });
    return out;
  }
  return value;
}

function buildToolUsageMetadata(toolId, input) {
  const metadata = {};
  if (!toolId) return metadata;
  if (toolId === "web.fetch") {
    metadata.requestedUrl = String(input?.url || "");
    metadata.maxChars = Number(input?.maxChars || 0) || null;
  } else if (toolId === "http.request") {
    metadata.requestedUrl = String(input?.url || "");
    metadata.method = String(input?.method || "GET");
  } else if (toolId === "filesystem.write_text") {
    metadata.path = String(input?.path || "");
    metadata.append = Boolean(input?.append);
  } else if (toolId === "filesystem.read_text") {
    metadata.path = String(input?.path || "");
  } else if (toolId === "knowledge.ingest_url") {
    metadata.requestedUrl = String(input?.url || "");
    metadata.mode = String(input?.mode || "create");
  } else if (toolId === "openai.generate_image") {
    metadata.prompt = String(input?.prompt || "");
  }
  metadata.inputPreview = typeof input === "object" ? JSON.stringify(input).slice(0, 800) : String(input || "");
  return metadata;
}

async function ensureStepApproval(task, step, user) {
  if (!step.requiresApproval) return { approved: true, approval: null };
  if (step.approvalId) {
    const approval = await getApproval(step.approvalId);
    return {
      approved: approval.status === "approved",
      approval
    };
  }
  const approval = {
    id: makeId("appr", `${task.id}-${step.id}`),
    taskId: task.id,
    stepId: step.id,
    title: `Approve task step: ${step.name || step.id}`,
    status: "pending",
    requestedBy: user?.id || null,
    requestedByUsername: user?.username || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    decision: null
  };
  await saveApproval(approval);
  await updateTask(task.id, (current) => ({
    ...current,
    status: "waiting_approval",
    updatedAt: nowIso(),
    steps: (current.steps || []).map((s) =>
      s.id === step.id
        ? {
            ...s,
            approvalId: approval.id
          }
        : s
    )
  }));
  await appendTaskEvent({
    ts: nowIso(),
    type: "approval_requested",
    taskId: task.id,
    stepId: step.id,
    approvalId: approval.id
  });
  return { approved: false, approval };
}

async function executeStep(task, step, user) {
  const resolvedInput = resolveTemplatedValue(step.input || {}, task);
  const resolvedPrompt = resolveTemplatedValue(step.prompt || "", task);
  if (step.type === "tool") {
    const started = Date.now();
    const metadata = buildToolUsageMetadata(step.toolId, resolvedInput);
    const result = await runTool(step.toolId, resolvedInput, {
      user,
      taskId: task.id,
      stepId: step.id,
      task
    });
    await appendToolUsage({
      ts: nowIso(),
      taskId: task.id,
      stepId: step.id,
      toolId: step.toolId,
      durationMs: Date.now() - started,
      ok: true,
      metadata
    });
    return {
      output: result
    };
  }
  if (step.type === "llm") {
    const model = String(step.model || task.settings?.model || "gpt-4.1-mini");
    const prompt = String(resolvedPrompt || "").trim() || "Provide a concise task execution response.";
    const response = await chatCompletion({
      model,
      temperature: Number(task.settings?.temperature ?? 0.3),
      messages: [
        {
          role: "system",
          content: "You are a deterministic task-runner assistant. Return concise actionable output."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });
    return {
      output: {
        text: String(response.text || "").trim()
      }
    };
  }
  if (step.type === "job") {
    return {
      output: {
        status: "queued",
        note: "Job step scaffold: integrate with worker/executor in a later milestone.",
        payload: resolvedInput
      }
    };
  }
  return {
    output: {
      note: "No-op step type."
    }
  };
}

export async function createTaskDraft({
  title,
  objective,
  steps,
  team,
  settings,
  user
}) {
  const now = nowIso();
  const taskId = makeId("task", title || "task");
  const routing = await routeTeam({
    mode: team?.mode || "auto",
    personaIds: team?.personaIds || [],
    tags: team?.tags || [],
    maxAgents: Number(team?.maxAgents || 3)
  });
  const normalizedSteps = (steps || []).map((step, idx) => ({
    id: step.id || `step-${idx + 1}`,
    name: step.name || `Step ${idx + 1}`,
    type: step.type || "tool",
    toolId: step.toolId || "",
    prompt: step.prompt || "",
    model: step.model || "",
    input: step.input || {},
    requiresApproval: Boolean(step.requiresApproval),
    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
    status: "pending",
    approvalId: null,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null
  }));

  const task = {
    id: taskId,
    title: title || "Agentic Task",
    objective: objective || "",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    createdBy: user?.id || null,
    createdByUsername: user?.username || null,
    settings: {
      model: settings?.model || "gpt-4.1-mini",
      temperature: Number(settings?.temperature ?? 0.3)
    },
    team: {
      mode: team?.mode || "auto",
      personaIds: team?.personaIds || [],
      tags: team?.tags || [],
      maxAgents: Number(team?.maxAgents || 3)
    },
    routing: {
      selectedPersonaIds: routing.selectedPersonaIds,
      reasoning: routing.reasoning
    },
    steps: normalizedSteps,
    summary: null
  };

  await saveTask(task);
  await appendTaskEvent({
    ts: now,
    type: "task_created",
    taskId: task.id,
    createdBy: task.createdBy,
    createdByUsername: task.createdByUsername
  });
  return task;
}

export async function runTask(taskId, { user, maxSteps = 100 } = {}) {
  let task = await getTask(taskId);
  if (!task.steps?.length) {
    const err = new Error("Task has no steps.");
    err.code = "TASK_EMPTY";
    throw err;
  }
  if (task.status === "completed") return task;
  if (task.status === "canceled") return task;

  task = await updateTask(taskId, (current) => ({
    ...current,
    status: "running",
    startedAt: current.startedAt || nowIso(),
    updatedAt: nowIso()
  }));

  let iteration = 0;
  while (iteration < maxSteps) {
    iteration += 1;
    const step = nextRunnableStep(task);
    if (!step) break;

    const approvalState = await ensureStepApproval(task, step, user);
    if (!approvalState.approved) {
      return getTask(taskId);
    }

    task = await updateTask(taskId, (current) => ({
      ...current,
      steps: (current.steps || []).map((s) =>
        s.id === step.id
          ? {
              ...s,
              status: "running",
              startedAt: nowIso(),
              error: null
            }
          : s
      ),
      updatedAt: nowIso()
    }));

    try {
      const execution = await executeStep(task, step, user);
      task = await updateTask(taskId, (current) => ({
        ...current,
        steps: (current.steps || []).map((s) =>
          s.id === step.id
            ? {
                ...s,
                status: "completed",
                result: execution.output,
                completedAt: nowIso()
              }
            : s
        ),
        updatedAt: nowIso()
      }));
      await appendTaskEvent({
        ts: nowIso(),
        type: "step_completed",
        taskId,
        stepId: step.id
      });
    } catch (error) {
      if (step.type === "tool") {
        const resolvedInput = resolveTemplatedValue(step.input || {}, task);
        const metadata = buildToolUsageMetadata(step.toolId, resolvedInput);
        await appendToolUsage({
          ts: nowIso(),
          taskId: task.id,
          stepId: step.id,
          toolId: step.toolId,
          durationMs: 0,
          ok: false,
          error: error.message,
          metadata
        });
      }
      task = await updateTask(taskId, (current) => ({
        ...current,
        status: "failed",
        updatedAt: nowIso(),
        completedAt: nowIso(),
        steps: (current.steps || []).map((s) =>
          s.id === step.id
            ? {
                ...s,
                status: "failed",
                error: error.message,
                completedAt: nowIso()
              }
            : s
        ),
        summary: truncateText(`Failed at ${step.id}: ${error.message}`, 400)
      }));
      await appendTaskEvent({
        ts: nowIso(),
        type: "task_failed",
        taskId,
        stepId: step.id,
        error: error.message
      });
      return task;
    }
  }

  const fresh = await getTask(taskId);
  const incomplete = (fresh.steps || []).some((s) => s.status !== "completed");
  if (incomplete) {
    return updateTask(taskId, (current) => ({
      ...current,
      status: current.status === "waiting_approval" ? "waiting_approval" : "running",
      updatedAt: nowIso()
    }));
  }

  const summary = truncateText(
    (fresh.steps || [])
      .map((s) => `${s.name || s.id}: ${JSON.stringify(s.result || {})}`)
      .join(" | "),
    1000
  );

  return updateTask(taskId, (current) => ({
    ...current,
    status: "completed",
    updatedAt: nowIso(),
    completedAt: nowIso(),
    summary
  }));
}

export async function applyApprovalDecision(approvalId, { decision, notes, user }) {
  const normalized = decision === "approved" ? "approved" : "rejected";
  const approval = await updateApproval(approvalId, (current) => ({
    ...current,
    status: normalized,
    updatedAt: nowIso(),
    decision: {
      byUserId: user?.id || null,
      byUsername: user?.username || null,
      decision: normalized,
      notes: String(notes || ""),
      at: nowIso()
    }
  }));

  await updateTask(approval.taskId, (current) => ({
    ...current,
    status: normalized === "approved" ? "running" : "failed",
    updatedAt: nowIso(),
    completedAt: normalized === "approved" ? current.completedAt : nowIso(),
    steps: (current.steps || []).map((s) =>
      s.id === approval.stepId
        ? {
            ...s,
            status: normalized === "approved" ? "pending" : "failed",
            error: normalized === "approved" ? null : `Approval rejected: ${String(notes || "").trim() || "No reason provided."}`
          }
        : s
    )
  }));

  await appendTaskEvent({
    ts: nowIso(),
    type: "approval_decision",
    taskId: approval.taskId,
    stepId: approval.stepId,
    approvalId: approval.id,
    decision: normalized
  });

  return approval;
}
