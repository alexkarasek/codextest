import express from "express";
import { sendError, sendOk } from "../response.js";
import { getRunDetails, listRuns } from "../../packages/core/events/index.js";
import { findJobByRunId } from "../../packages/core/queue/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const limit = Number(req.query?.limit || 25);
  const runs = await listRuns({ limit: Number.isFinite(limit) ? limit : 25 });
  sendOk(res, { runs });
});

router.get("/:runId", async (req, res) => {
  const runId = String(req.params?.runId || "").trim();
  if (!runId) {
    sendError(res, 400, "VALIDATION_ERROR", "runId is required.");
    return;
  }

  const details = await getRunDetails(runId);
  if (!details?.events?.length) {
    const job = await findJobByRunId(runId);
    if (!job) {
      sendError(res, 404, "NOT_FOUND", `Run '${runId}' not found.`);
      return;
    }
    sendOk(res, {
      summary: {
        runId,
        requestId: String(job.payload?.requestId || "") || null,
        component: "queue",
        status: job.status,
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
        error: job.lastError || null,
        job
      },
      events: []
    });
    return;
  }

  sendOk(res, details);
});

export default router;
