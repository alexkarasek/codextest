import fs from "fs/promises";
import path from "path";
import { getTask } from "./agenticStorage.js";
import { listTaskEvents, listToolUsage } from "./agenticStorage.js";
import { slugify, truncateText } from "./utils.js";

function nowIso() {
  return new Date().toISOString();
}

function ensureReportsDir() {
  return fs.mkdir(path.join(process.cwd(), "data", "agentic", "reports"), { recursive: true });
}

function formatStep(step) {
  const lines = [
    `- id: ${step.id}`,
    `  name: ${step.name}`,
    `  type: ${step.type}`,
    `  status: ${step.status || "unknown"}`
  ];
  if (step.toolId) lines.push(`  toolId: ${step.toolId}`);
  if (step.model) lines.push(`  model: ${step.model}`);
  if (step.error) lines.push(`  error: ${truncateText(step.error, 400)}`);
  if (step.result) lines.push(`  result: ${truncateText(JSON.stringify(step.result), 1400)}`);
  return lines.join("\n");
}

function extractSources(toolEvents = []) {
  const sources = [];
  for (const evt of toolEvents) {
    const meta = evt.metadata || {};
    const url = meta.requestedUrl || meta.url || "";
    const pathValue = meta.path || "";
    if (url) {
      sources.push({
        type: "url",
        toolId: evt.toolId || "unknown",
        value: url,
        ts: evt.ts || ""
      });
    } else if (pathValue) {
      sources.push({
        type: "file",
        toolId: evt.toolId || "unknown",
        value: pathValue,
        ts: evt.ts || ""
      });
    }
  }
  const seen = new Set();
  return sources.filter((s) => {
    const key = `${s.type}:${s.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeTaskEvents(events) {
  return events
    .slice(-20)
    .map((evt) => `- ${evt.type || "event"} @ ${evt.ts || "n/a"} ${evt.stepId ? `(step ${evt.stepId})` : ""}`.trim())
    .join("\n");
}

export async function generateTaskReport(taskId) {
  const task = await getTask(taskId);
  const taskEvents = await listTaskEvents(2000);
  const toolEvents = await listToolUsage(2000);
  const taskEventRows = taskEvents.filter((e) => e.taskId === task.id);
  const toolEventRows = toolEvents.filter((e) => e.taskId === task.id);
  const sources = extractSources(toolEventRows);
  const reportId = `task-${slugify(task.title || task.id)}-${task.id}`;
  const reportPath = path.join(process.cwd(), "data", "agentic", "reports", `${reportId}.md`);

  const content = [
    "# Agentic Task Report",
    "",
    `- taskId: ${task.id}`,
    `- title: ${task.title || task.id}`,
    `- status: ${task.status || "unknown"}`,
    `- createdAt: ${task.createdAt || "n/a"}`,
    `- updatedAt: ${task.updatedAt || "n/a"}`,
    `- generatedAt: ${nowIso()}`,
    "",
    "## Objective",
    task.objective || "(none)",
    "",
    "## Routing",
    `- selectedPersonaIds: ${(task.routing?.selectedPersonaIds || []).join(", ") || "(auto)"}`,
    `- reasoning: ${task.routing?.reasoning || "(none)"}`,
    "",
    "## Steps",
    ...(task.steps || []).map(formatStep),
    "",
    "## Observability",
    "### Task Events",
    summarizeTaskEvents(taskEventRows) || "(none)",
    "",
    "### Tool Usage",
    toolEventRows.length
      ? toolEventRows
          .slice(-40)
          .map((evt) => {
            const meta = evt.metadata || {};
            const target = meta.requestedUrl || meta.path || "";
            return `- ${evt.toolId || "unknown"} | ok=${evt.ok === true ? "true" : "false"} | ${target}`.trim();
          })
          .join("\n")
      : "(none)",
    "",
    "## Sources",
    sources.length
      ? sources
          .map((s, idx) => `${idx + 1}. [${s.type}] ${s.value} (via ${s.toolId}${s.ts ? ` @ ${s.ts}` : ""})`)
          .join("\n")
      : "(none)",
    ""
  ].join("\n");

  await ensureReportsDir();
  await fs.writeFile(reportPath, content, "utf8");

  return {
    taskId: task.id,
    reportId,
    reportPath: path.relative(process.cwd(), reportPath),
    content
  };
}
