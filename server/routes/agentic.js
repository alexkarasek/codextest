import express from "express";
import { getAgenticMetricsOverview } from "../../lib/agenticMetrics.js";
import {
  deleteTaskTemplate,
  getTask,
  listApprovals,
  listJobs,
  listTaskEvents,
  listTaskTemplates,
  listTasks,
  listToolUsage,
  saveTaskTemplate
} from "../../lib/agenticStorage.js";
import { listTools } from "../../lib/agenticTools.js";
import { chatCompletion } from "../../lib/llm.js";
import { getMcpReadinessStatus } from "../../lib/mcpStatus.js";
import { listPersonas } from "../../lib/storage.js";
import { applyApprovalDecision, createTaskDraft, runTask } from "../../lib/taskRunner.js";
import { routeTeam } from "../../lib/teamRouter.js";
import { slugify } from "../../lib/utils.js";
import {
  agenticPlanRequestSchema,
  approvalDecisionSchema,
  createAgenticTaskSchema,
  formatZodError,
  routerPreviewSchema,
  runAgenticTaskSchema
} from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";

const router = express.Router();

function parsePlannerJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = candidate.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizePlannedStep(step, idx) {
  const type = ["tool", "llm", "job"].includes(String(step?.type || "")) ? String(step.type) : "tool";
  return {
    id: String(step?.id || `step-${idx + 1}`),
    name: String(step?.name || `Step ${idx + 1}`),
    type,
    toolId: String(step?.toolId || (type === "tool" ? "filesystem.write_text" : "")),
    prompt: String(step?.prompt || ""),
    model: String(step?.model || ""),
    input: step?.input && typeof step.input === "object" ? step.input : {},
    dependsOn: Array.isArray(step?.dependsOn) ? step.dependsOn.map((x) => String(x || "")).filter(Boolean) : [],
    requiresApproval: Boolean(step?.requiresApproval)
  };
}

router.get("/tools", (_req, res) => {
  sendOk(res, { tools: listTools() });
});

router.post("/router/preview", async (req, res) => {
  const parsed = routerPreviewSchema.safeParse(req.body || {});
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid router preview payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const routed = await routeTeam(parsed.data);
    sendOk(res, {
      mode: parsed.data.mode,
      selectedPersonaIds: routed.selectedPersonaIds,
      selectedPersonas: routed.selectedPersonas,
      reasoning: routed.reasoning
    });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to preview team routing: ${error.message}`);
  }
});

router.post("/plan", async (req, res) => {
  const parsed = agenticPlanRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid planning payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const [toolData, personaData] = await Promise.all([Promise.resolve(listTools()), listPersonas()]);
    const tools = (toolData || []).map((t) => ({
      id: t.id,
      description: t.description || "",
      inputSchema: t.inputSchema || {}
    }));
    const personas = (personaData.personas || []).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      role: p.role || "",
      expertiseTags: p.expertiseTags || []
    }));

    const plannerPrompt = [
      "Create an executable local-first agentic task plan.",
      "",
      `Goal: ${parsed.data.goal}`,
      parsed.data.constraints ? `Constraints: ${parsed.data.constraints}` : "",
      `Max steps: ${parsed.data.maxSteps}`,
      "",
      "Available tools:",
      JSON.stringify(tools, null, 2),
      "",
      "Available personas:",
      JSON.stringify(personas, null, 2),
      "",
      "Return ONLY JSON with this shape:",
      JSON.stringify(
        {
          title: "string",
          objective: "string",
          team: {
            mode: "auto",
            personaIds: [],
            tags: [],
            maxAgents: 3
          },
          reasoning: "string",
          steps: [
            {
              id: "step-1",
              name: "string",
              type: "tool",
              toolId: "filesystem.write_text",
              prompt: "",
              model: "",
              input: {},
              dependsOn: [],
              requiresApproval: false
            }
          ]
        },
        null,
        2
      ),
      "",
      "Rules:",
      "- Use only listed tool ids.",
      "- Steps must be sequentially valid and dependencies must refer to earlier steps.",
      "- Use template references for chaining when useful, e.g. {{steps.step-1.result.bodyPreview}}.",
      "- Keep plan concise and practical."
    ]
      .filter(Boolean)
      .join("\n");

    const response = await chatCompletion({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a deterministic agentic planner. Output valid JSON only."
        },
        {
          role: "user",
          content: plannerPrompt
        }
      ]
    });

    const planned = parsePlannerJson(response.text);
    if (!planned || !Array.isArray(planned.steps) || !planned.steps.length) {
      sendError(res, 502, "PLANNER_ERROR", "Planner returned invalid plan JSON.");
      return;
    }

    const steps = planned.steps.slice(0, parsed.data.maxSteps).map((step, idx) => normalizePlannedStep(step, idx));
    const plan = {
      title: String(planned.title || parsed.data.goal).trim() || "Agentic Task",
      objective: String(planned.objective || parsed.data.goal).trim(),
      team: {
        mode: ["auto", "manual"].includes(String(planned.team?.mode || "")) ? planned.team.mode : parsed.data.team.mode,
        personaIds: Array.isArray(planned.team?.personaIds)
          ? planned.team.personaIds.map((x) => String(x || "")).filter(Boolean)
          : parsed.data.team.personaIds,
        tags: Array.isArray(planned.team?.tags)
          ? planned.team.tags.map((x) => String(x || "")).filter(Boolean)
          : parsed.data.team.tags,
        maxAgents: Number.isFinite(Number(planned.team?.maxAgents))
          ? Math.max(1, Math.min(8, Number(planned.team.maxAgents)))
          : parsed.data.team.maxAgents
      },
      reasoning: String(planned.reasoning || "").trim(),
      steps
    };

    sendOk(res, { plan });
  } catch (error) {
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "LLM provider credentials are not configured.");
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to generate plan: ${error.message}`);
  }
});

router.get("/templates", async (_req, res) => {
  try {
    const templates = await listTaskTemplates();
    sendOk(res, { templates });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to list templates: ${error.message}`);
  }
});

router.post("/templates", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const template = req.body?.template && typeof req.body.template === "object" ? req.body.template : null;
  if (!name || !template) {
    sendError(res, 400, "VALIDATION_ERROR", "name and template are required.");
    return;
  }
  if (!Array.isArray(template.steps) || !template.steps.length) {
    sendError(res, 400, "VALIDATION_ERROR", "template.steps must be a non-empty array.");
    return;
  }
  try {
    const id = String(req.body?.id || "").trim() || `tpl-${slugify(name) || "template"}`;
    const row = await saveTaskTemplate({
      id,
      name,
      title: String(template.title || ""),
      objective: String(template.objective || ""),
      team: template.team || {},
      settings: template.settings || {},
      steps: template.steps
    });
    sendOk(res, { template: row }, 201);
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save template: ${error.message}`);
  }
});

router.delete("/templates/:templateId", async (req, res) => {
  try {
    const ok = await deleteTaskTemplate(req.params.templateId);
    if (!ok) {
      sendError(res, 404, "NOT_FOUND", `Template '${req.params.templateId}' not found.`);
      return;
    }
    sendOk(res, { deleted: true });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to delete template: ${error.message}`);
  }
});

router.get("/tasks", async (req, res) => {
  const status = String(req.query.status || "").trim();
  try {
    const tasks = await listTasks({ status });
    sendOk(res, { tasks });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to list tasks: ${error.message}`);
  }
});

router.get("/tasks/:taskId", async (req, res) => {
  try {
    const task = await getTask(req.params.taskId);
    sendOk(res, { task });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Task '${req.params.taskId}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to load task: ${error.message}`);
  }
});

router.post("/tasks", async (req, res) => {
  const parsed = createAgenticTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid task payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const task = await createTaskDraft({
      title: parsed.data.title,
      objective: parsed.data.objective,
      team: parsed.data.team,
      settings: parsed.data.settings,
      steps: parsed.data.steps,
      user: req.auth?.user || null
    });

    let hydrated = task;
    if (parsed.data.runImmediately) {
      hydrated = await runTask(task.id, {
        user: req.auth?.user || null,
        maxSteps: 100
      });
    }

    sendOk(res, { task: hydrated }, 201);
  } catch (error) {
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "LLM provider credentials are not configured.");
      return;
    }
    if (error.code === "UNKNOWN_TOOL") {
      sendError(res, 400, "UNKNOWN_TOOL", error.message);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to create task: ${error.message}`);
  }
});

router.post("/tasks/:taskId/run", async (req, res) => {
  const parsed = runAgenticTaskSchema.safeParse(req.body || {});
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid run payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const task = await runTask(req.params.taskId, {
      user: req.auth?.user || null,
      maxSteps: parsed.data.maxSteps
    });
    sendOk(res, { task });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Task '${req.params.taskId}' not found.`);
      return;
    }
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "LLM provider credentials are not configured.");
      return;
    }
    if (error.code === "UNKNOWN_TOOL") {
      sendError(res, 400, "UNKNOWN_TOOL", error.message);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Task run failed: ${error.message}`);
  }
});

router.get("/approvals", async (req, res) => {
  const status = String(req.query.status || "").trim();
  try {
    const approvals = await listApprovals({ status });
    sendOk(res, { approvals });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to list approvals: ${error.message}`);
  }
});

router.post("/approvals/:approvalId/decision", async (req, res) => {
  const parsed = approvalDecisionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid approval payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const approval = await applyApprovalDecision(req.params.approvalId, {
      decision: parsed.data.decision,
      notes: parsed.data.notes,
      user: req.auth?.user || null
    });
    let task = await getTask(approval.taskId);
    if (parsed.data.decision === "approved") {
      task = await runTask(approval.taskId, {
        user: req.auth?.user || null,
        maxSteps: 200
      });
    }
    sendOk(res, { approval, task });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Approval '${req.params.approvalId}' not found.`);
      return;
    }
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "LLM provider credentials are not configured.");
      return;
    }
    if (error.code === "UNKNOWN_TOOL") {
      sendError(res, 400, "UNKNOWN_TOOL", error.message);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to apply approval: ${error.message}`);
  }
});

router.get("/jobs", async (_req, res) => {
  try {
    const jobs = await listJobs();
    sendOk(res, { jobs });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to list jobs: ${error.message}`);
  }
});

router.get("/events", async (req, res) => {
  const type = String(req.query.type || "task").trim();
  const limit = Number(req.query.limit);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 200;

  try {
    if (type === "tool") {
      const rows = await listToolUsage(safeLimit);
      sendOk(res, { type: "tool", events: rows });
      return;
    }
    const rows = await listTaskEvents(safeLimit);
    sendOk(res, { type: "task", events: rows });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to list events: ${error.message}`);
  }
});

router.get("/metrics/overview", async (_req, res) => {
  try {
    const metrics = await getAgenticMetricsOverview();
    sendOk(res, metrics);
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load agentic metrics: ${error.message}`);
  }
});

router.get("/mcp/status", async (_req, res) => {
  try {
    const status = await getMcpReadinessStatus();
    sendOk(res, status);
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load MCP status: ${error.message}`);
  }
});

export default router;
