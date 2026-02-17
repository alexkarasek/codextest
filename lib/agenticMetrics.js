import { listApprovals, listJobs, listTaskEvents, listTasks, listToolUsage } from "./agenticStorage.js";

function toMs(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function durationMs(startedAt, completedAt) {
  if (!startedAt || !completedAt) return 0;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export async function getAgenticMetricsOverview() {
  const [tasks, approvals, jobs, taskEvents, toolUsage] = await Promise.all([
    listTasks(),
    listApprovals(),
    listJobs(),
    listTaskEvents(5000),
    listToolUsage(5000)
  ]);

  const taskStatusCounts = tasks.reduce((acc, task) => {
    const key = String(task.status || "unknown");
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});

  const approvalStatusCounts = approvals.reduce((acc, approval) => {
    const key = String(approval.status || "unknown");
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});

  const toolCounts = toolUsage.reduce((acc, row) => {
    const key = String(row.toolId || "unknown");
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});

  const durations = tasks
    .map((task) => durationMs(task.startedAt, task.completedAt))
    .filter((ms) => ms > 0);

  const avgTaskDurationMs = durations.length
    ? Math.round(durations.reduce((acc, ms) => acc + ms, 0) / durations.length)
    : 0;

  const totalToolDurationMs = toolUsage.reduce((acc, row) => acc + toMs(row.durationMs), 0);

  const recent = {
    tasks: tasks.slice(0, 15).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      updatedAt: task.updatedAt,
      selectedPersonaIds: task.routing?.selectedPersonaIds || []
    })),
    approvals: approvals.slice(0, 15).map((approval) => ({
      id: approval.id,
      taskId: approval.taskId,
      stepId: approval.stepId,
      status: approval.status,
      updatedAt: approval.updatedAt,
      title: approval.title
    })),
    jobs: jobs.slice(0, 15).map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      createdAt: job.createdAt
    }))
  };

  return {
    totals: {
      tasks: tasks.length,
      approvals: approvals.length,
      jobs: jobs.length,
      taskEvents: taskEvents.length,
      toolExecutions: toolUsage.length,
      avgTaskDurationMs,
      totalToolDurationMs
    },
    byStatus: {
      taskStatusCounts,
      approvalStatusCounts
    },
    byTool: toolCounts,
    recent
  };
}
