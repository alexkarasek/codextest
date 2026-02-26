import { dequeue, ack, fail } from "../packages/core/queue/index.js";
import { runConversationSession } from "../src/services/conversationEngine.js";
import { getDebate } from "../lib/storage.js";
import { appendEvent, EVENT_TYPES, recordErrorEvent } from "../packages/core/events/index.js";
import { runWithObservabilityContext, logEvent } from "../lib/observability.js";
import { getRunRepository } from "../lib/runRepository.js";
import {
  executeWorkflowRun,
  pollAndQueueCronWorkflows,
  queueRunCompletedWorkflows
} from "../lib/workflowEngine.js";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 1000);
const WORKER_ID = String(process.env.WORKER_ID || `worker-${process.pid}`);
const JOB_TYPES = ["RUN_DEBATE", "RUN_WORKFLOW", "INGEST_DOCS"];
const runRepo = getRunRepository();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDebateJob(job) {
  const debateId = String(job?.payload?.debateId || "").trim();
  if (!debateId) {
    const err = new Error("Missing debateId in job payload.");
    err.code = "INVALID_JOB_PAYLOAD";
    throw err;
  }

  const { session } = await getDebate(debateId);
  if (String(session?.status || "") === "completed") {
    return {
      skipped: true,
      reason: "already_completed",
      debateId
    };
  }

  await runConversationSession({
    conversationMode: session?.conversationMode || "debate",
    conversationId: debateId,
    session
  });

  return {
    debateId,
    links: {
      self: `/api/debates/${debateId}`,
      transcript: `/api/debates/${debateId}/transcript`
    }
  };
}

async function processJob(job) {
  if (job.type === "RUN_DEBATE") {
    return runDebateJob(job);
  }
  if (job.type === "RUN_WORKFLOW") {
    const workflowId = String(job?.payload?.workflowId || "").trim();
    const workflowRunId = String(job?.payload?.runId || "").trim();
    if (!workflowId || !workflowRunId) {
      const err = new Error("RUN_WORKFLOW payload requires workflowId and runId.");
      err.code = "INVALID_JOB_PAYLOAD";
      throw err;
    }
    const run = await executeWorkflowRun({
      workflowId,
      workflowRunId,
      requestId: String(job?.payload?.requestId || "").trim() || null,
      triggerType: String(job?.payload?.triggerType || "manual"),
      triggerPayload: job?.payload?.triggerPayload || {},
      user: {
        id: String(job?.payload?.userId || "") || null,
        username: String(job?.payload?.username || "") || null
      }
    });
    return {
      workflowId,
      workflowRunId,
      status: run.status
    };
  }

  const err = new Error(`Unsupported job type '${job.type}'.`);
  err.code = "UNSUPPORTED_JOB_TYPE";
  throw err;
}

async function loop() {
  logEvent("info", {
    component: "worker",
    eventType: "worker.started",
    workerId: WORKER_ID
  });

  while (true) {
    let job = null;
    try {
      await pollAndQueueCronWorkflows({ requestId: null }).catch(() => []);
      job = await dequeue({ workerId: WORKER_ID, jobTypes: JOB_TYPES });
      if (!job) {
        await sleep(POLL_MS);
        continue;
      }

      const runId = String(job.runId || job.payload?.runId || job.payload?.debateId || "").trim() || null;
      const requestId = String(job.payload?.requestId || "").trim() || null;

      await runWithObservabilityContext({ requestId, runId }, async () => {
        await runRepo.upsert({
          id: runId || job.id,
          requestId,
          kind: String(job.type || "run").toLowerCase(),
          status: "running",
          startedAt: new Date().toISOString(),
          metadata: {
            jobId: job.id,
            jobType: job.type
          }
        });
        await appendEvent({
          eventType: EVENT_TYPES.RunStarted,
          component: "worker",
          requestId,
          runId,
          data: {
            jobId: job.id,
            jobType: job.type,
            attempt: job.attempts
          }
        });

        const started = Date.now();
        const result = await processJob(job);
        const latencyMs = Date.now() - started;

        await ack(job.id, result);
        await runRepo.upsert({
          id: runId || job.id,
          requestId,
          kind: String(job.type || "run").toLowerCase(),
          status: "completed",
          finishedAt: new Date().toISOString(),
          error: null,
          metadata: {
            jobId: job.id,
            jobType: job.type,
            result
          }
        });
        await appendEvent({
          eventType: EVENT_TYPES.RunFinished,
          component: "worker",
          requestId,
          runId,
          latencyMs,
          data: {
            status: "completed",
            jobId: job.id,
            jobType: job.type,
            result
          }
        });
        if (job.type !== "RUN_WORKFLOW") {
          await queueRunCompletedWorkflows({
            runId: runId || job.id,
            requestId,
            event: "run.finished",
            payload: {
              jobType: job.type,
              jobId: job.id
            }
          }).catch(() => []);
        }

        logEvent("info", {
          component: "worker",
          eventType: "job.completed",
          requestId,
          runId,
          latencyMs,
          jobId: job.id,
          jobType: job.type
        });
      });
    } catch (error) {
      const runId = String(job?.runId || job?.payload?.runId || job?.payload?.debateId || "").trim() || null;
      const requestId = String(job?.payload?.requestId || "").trim() || null;

      if (job?.id) {
        await fail(job.id, error, { backoffBaseMs: 500 });
      }
      if (runId) {
        await runRepo.upsert({
          id: runId,
          requestId,
          kind: String(job?.type || "run").toLowerCase(),
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: {
            code: error?.code || "WORKER_JOB_ERROR",
            message: error?.message || "Worker job failed."
          },
          metadata: {
            jobId: job?.id || null,
            jobType: job?.type || null
          }
        });
      }

      await recordErrorEvent({
        component: "worker",
        requestId,
        runId,
        error,
        data: {
          jobId: job?.id || null,
          jobType: job?.type || null
        }
      });

      await appendEvent({
        eventType: EVENT_TYPES.RunFinished,
        component: "worker",
        requestId,
        runId,
        level: "error",
        error: {
          code: error?.code || "WORKER_JOB_ERROR",
          message: error?.message || "Worker job failed."
        },
        data: {
          status: "failed",
          jobId: job?.id || null,
          jobType: job?.type || null
        }
      });

      logEvent("error", {
        component: "worker",
        eventType: "job.failed",
        requestId,
        runId,
        error: {
          code: error?.code || "WORKER_JOB_ERROR",
          message: error?.message || "Worker job failed."
        },
        jobId: job?.id || null,
        jobType: job?.type || null
      });

      await sleep(POLL_MS);
    }
  }
}

loop().catch((error) => {
  logEvent("error", {
    component: "worker",
    eventType: "worker.crashed",
    error: {
      code: error?.code || "WORKER_CRASH",
      message: error?.message || "Worker crashed."
    }
  });
  process.exitCode = 1;
});
