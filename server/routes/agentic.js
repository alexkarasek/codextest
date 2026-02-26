import express from "express";
import { getAgenticMetricsOverview } from "../../lib/agenticMetrics.js";
import {
  deleteTaskTemplate,
  deleteWatcher,
  getTask,
  listApprovals,
  listJobs,
  listTaskEvents,
  listTaskTemplates,
  listTasks,
  listToolUsage,
  listWatchers,
  appendToolUsage,
  deleteWorkflow,
  getWorkflow,
  saveWorkflow,
  saveTaskTemplate
} from "../../lib/agenticStorage.js";
import { listTools } from "../../lib/agenticTools.js";
import { chatCompletion } from "../../lib/llm.js";
import { getMcpReadinessStatus, listResolvedMcpServers } from "../../lib/mcpStatus.js";
import { runMcpTool } from "../../lib/mcpRegistry.js";
import { listPersonas } from "../../lib/storage.js";
import { applyApprovalDecision, createTaskDraft, runTask } from "../../lib/taskRunner.js";
import { createWatcher, runWatcher } from "../../lib/agenticWatchers.js";
import {
  createWorkflow,
  getWorkflowOverview,
  queueWorkflowRun
} from "../../lib/workflowEngine.js";
import { generateTaskReport } from "../../lib/agenticReports.js";
import { routeTeam } from "../../lib/teamRouter.js";
import { slugify } from "../../lib/utils.js";
import {
  agenticPlanRequestSchema,
  approvalDecisionSchema,
  createAgenticTaskSchema,
  createWatcherSchema,
  createWorkflowSchema,
  formatZodError,
  routerPreviewSchema,
  updateWorkflowSchema,
  workflowSchema,
  runAgenticTaskSchema
} from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";
import { sendMappedError } from "../errorMapper.js";

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

router.get("/watchers", async (_req, res) => {
  try {
    const watchers = await listWatchers();
    sendOk(res, { watchers });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list watchers: ${e.message}`
    });
  }
});

router.get("/workflows", async (req, res) => {
  try {
    const limitRuns = Number(req.query?.limitRuns || 200);
    const data = await getWorkflowOverview({ limitRuns: Number.isFinite(limitRuns) ? limitRuns : 200 });
    sendOk(res, data);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list workflows: ${e.message}`
    });
  }
});

router.post("/workflows", async (req, res) => {
  const parsed = createWorkflowSchema.safeParse(req.body || {});
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid workflow payload.", formatZodError(parsed.error));
    return;
  }
  try {
    const workflow = await createWorkflow({
      ...parsed.data,
      user: req.auth?.user || null
    });
    sendOk(res, { workflow }, 201);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to create workflow: ${e.message}`
    });
  }
});

router.put("/workflows/:workflowId", async (req, res) => {
  const parsed = updateWorkflowSchema.safeParse(req.body || {});
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid workflow update payload.", formatZodError(parsed.error));
    return;
  }
  try {
    const current = await getWorkflow(req.params.workflowId);
    const merged = {
      ...current,
      ...parsed.data,
      id: req.params.workflowId,
      updatedAt: new Date().toISOString()
    };
    const validated = workflowSchema.safeParse(merged);
    if (!validated.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid workflow payload.", formatZodError(validated.error));
      return;
    }
    const saved = await saveWorkflow(validated.data);
    sendOk(res, { workflow: saved });
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Workflow '${req.params.workflowId}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to update workflow: ${e.message}` }
    );
  }
});

router.delete("/workflows/:workflowId", async (req, res) => {
  try {
    const ok = await deleteWorkflow(req.params.workflowId);
    if (!ok) {
      sendError(res, 404, "NOT_FOUND", `Workflow '${req.params.workflowId}' not found.`);
      return;
    }
    sendOk(res, { deleted: true });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to delete workflow: ${e.message}`
    });
  }
});

router.post("/workflows/:workflowId/run", async (req, res) => {
  try {
    const data = await queueWorkflowRun({
      workflowId: req.params.workflowId,
      triggerType: "manual",
      triggerPayload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {},
      requestId: req.requestId || null,
      user: req.auth?.user || null
    });
    sendOk(res, data, 202);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [
        { matchCode: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Workflow '${req.params.workflowId}' not found.` },
        { code: "WORKFLOW_DISABLED", status: 400 }
      ],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to run workflow: ${e.message}` }
    );
  }
});

router.post("/workflows/:workflowId/trigger", async (req, res) => {
  try {
    const workflow = await getWorkflow(req.params.workflowId);
    const secret = String(workflow?.trigger?.secret || "").trim();
    if (workflow?.trigger?.type !== "webhook") {
      sendError(res, 400, "VALIDATION_ERROR", "Workflow trigger type must be webhook for this endpoint.");
      return;
    }
    if (secret) {
      const provided = String(req.headers["x-workflow-secret"] || req.body?.secret || "").trim();
      if (!provided || provided !== secret) {
        sendError(res, 401, "UNAUTHORIZED", "Invalid workflow secret.");
        return;
      }
    }
    const data = await queueWorkflowRun({
      workflowId: req.params.workflowId,
      triggerType: "webhook",
      triggerPayload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {},
      requestId: req.requestId || null,
      user: req.auth?.user || null
    });
    sendOk(res, data, 202);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Workflow '${req.params.workflowId}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to trigger workflow: ${e.message}` }
    );
  }
});

router.post("/watchers", async (req, res) => {
  const parsed = createWatcherSchema.safeParse(req.body || {});
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid watcher payload.", formatZodError(parsed.error));
    return;
  }
  try {
    const watcher = await createWatcher({
      name: parsed.data.name,
      enabled: parsed.data.enabled,
      check: parsed.data.check,
      action: parsed.data.action,
      createdBy: req.auth?.user || null
    });
    sendOk(res, { watcher }, 201);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to create watcher: ${e.message}`
    });
  }
});

router.post("/watchers/:watcherId/run", async (req, res) => {
  try {
    const data = await runWatcher(req.params.watcherId, { user: req.auth?.user || null });
    sendOk(res, data);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Watcher '${req.params.watcherId}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to run watcher: ${e.message}` }
    );
  }
});

router.delete("/watchers/:watcherId", async (req, res) => {
  try {
    const ok = await deleteWatcher(req.params.watcherId);
    if (!ok) {
      sendError(res, 404, "NOT_FOUND", `Watcher '${req.params.watcherId}' not found.`);
      return;
    }
    sendOk(res, { deleted: true });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to delete watcher: ${e.message}`
    });
  }
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
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to preview team routing: ${e.message}`
    });
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
      model: "gpt-5-mini",
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
    sendMappedError(
      res,
      error,
      [{ code: "MISSING_API_KEY", status: 400, message: "LLM provider credentials are not configured." }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to generate plan: ${e.message}` }
    );
  }
});

router.get("/templates", async (_req, res) => {
  try {
    const templates = await listTaskTemplates();
    sendOk(res, { templates });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list templates: ${e.message}`
    });
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
    }, { bumpVersion: req.body?.bumpVersion !== false });
    sendOk(res, { template: row }, 201);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to save template: ${e.message}`
    });
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
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to delete template: ${e.message}`
    });
  }
});

router.get("/tasks", async (req, res) => {
  const status = String(req.query.status || "").trim();
  try {
    const tasks = await listTasks({ status });
    sendOk(res, { tasks });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list tasks: ${e.message}`
    });
  }
});

router.get("/tasks/:taskId", async (req, res) => {
  try {
    const task = await getTask(req.params.taskId);
    sendOk(res, { task });
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Task '${req.params.taskId}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to load task: ${e.message}` }
    );
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
    sendMappedError(
      res,
      error,
      [
        { code: "MISSING_API_KEY", status: 400, message: "LLM provider credentials are not configured." },
        { code: "UNKNOWN_TOOL", status: 400 }
      ],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to create task: ${e.message}` }
    );
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
    sendMappedError(
      res,
      error,
      [
        { matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Task '${req.params.taskId}' not found.` },
        { code: "MISSING_API_KEY", status: 400, message: "LLM provider credentials are not configured." },
        { code: "UNKNOWN_TOOL", status: 400 }
      ],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Task run failed: ${e.message}` }
    );
  }
});

router.post("/tasks/:taskId/report", async (req, res) => {
  try {
    const report = await generateTaskReport(req.params.taskId);
    sendOk(res, { report });
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Task '${req.params.taskId}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to generate report: ${e.message}` }
    );
  }
});

router.get("/approvals", async (req, res) => {
  const status = String(req.query.status || "").trim();
  try {
    const approvals = await listApprovals({ status });
    sendOk(res, { approvals });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list approvals: ${e.message}`
    });
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
    sendMappedError(
      res,
      error,
      [
        { matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Approval '${req.params.approvalId}' not found.` },
        { code: "MISSING_API_KEY", status: 400, message: "LLM provider credentials are not configured." },
        { code: "UNKNOWN_TOOL", status: 400 }
      ],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to apply approval: ${e.message}` }
    );
  }
});

router.get("/jobs", async (_req, res) => {
  try {
    const jobs = await listJobs();
    sendOk(res, { jobs });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list jobs: ${e.message}`
    });
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
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list events: ${e.message}`
    });
  }
});

router.get("/metrics/overview", async (_req, res) => {
  try {
    const metrics = await getAgenticMetricsOverview();
    sendOk(res, metrics);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load agentic metrics: ${e.message}`
    });
  }
});

router.get("/mcp/status", async (_req, res) => {
  try {
    const status = await getMcpReadinessStatus();
    sendOk(res, status);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load MCP status: ${e.message}`
    });
  }
});

router.get("/mcp/servers", async (req, res) => {
  const includeTools = String(req.query.includeTools || "") === "true";
  try {
    const servers = await listResolvedMcpServers({ includeTools });
    sendOk(res, { servers });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load MCP servers: ${e.message}`
    });
  }
});

router.get("/mcp/servers/:serverId/tools", async (req, res) => {
  try {
    const servers = await listResolvedMcpServers({ includeTools: true });
    const server = servers.find((item) => item.id === req.params.serverId);
    if (!server) {
      sendError(res, 404, "NOT_FOUND", `MCP server '${req.params.serverId}' not found.`);
      return;
    }
    sendOk(res, { tools: server.tools || [] });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load MCP tools: ${e.message}`
    });
  }
});

router.post("/mcp/servers/:serverId/call", async (req, res) => {
  const tool = String(req.body?.tool || "").trim();
  const input = req.body?.input && typeof req.body.input === "object" ? req.body.input : {};
  if (!tool) {
    sendError(res, 400, "VALIDATION_ERROR", "tool is required.");
    return;
  }
  try {
    const started = Date.now();
    const output = await runMcpTool(req.params.serverId, tool, input, { user: req.user || null });
    await appendToolUsage({
      ts: new Date().toISOString(),
      toolId: `mcp.${req.params.serverId}.${tool}`,
      durationMs: Date.now() - started,
      ok: true,
      metadata: {
        source: "mcp",
        serverId: req.params.serverId,
        tool
      }
    });
    sendOk(res, { output });
  } catch (error) {
    sendMappedError(
      res,
      error,
      [
        { code: "MCP_SERVER_NOT_FOUND", status: 404, responseCode: "NOT_FOUND" },
        { code: "MCP_TOOL_NOT_FOUND", status: 404, responseCode: "NOT_FOUND" }
      ],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to run MCP tool: ${e.message}` }
    );
  }
});

export default router;
