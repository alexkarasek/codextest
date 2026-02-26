import express from "express";
import { sendError, sendOk } from "../response.js";
import { compareRuns, getRunDetails, listRuns } from "../../packages/core/events/index.js";
import { findJobByRunId } from "../../packages/core/queue/index.js";
import { computeRunScorecard } from "../../lib/runScorecard.js";
import { getRunRepository } from "../../lib/runRepository.js";

const router = express.Router();
const runRepo = getRunRepository();

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
    const repoRun = await runRepo.getById(runId);
    if (repoRun) {
      sendOk(res, {
        summary: {
          runId: repoRun.id,
          requestId: repoRun.requestId || null,
          component: "runs-repository",
          status: repoRun.status,
          startedAt: repoRun.startedAt || repoRun.createdAt || null,
          finishedAt: repoRun.finishedAt || null,
          durationMs: repoRun.durationMs,
          llmCalls: 0,
          toolCalls: 0,
          eventCount: 0,
          tokens: repoRun.tokens || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          estimatedCostUsd: Number(repoRun.estimatedCostUsd || 0),
          error: repoRun.error || null,
          score: repoRun.score || computeRunScorecard(repoRun, [])
        },
        events: []
      });
      return;
    }
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
        score: null,
        job
      },
      events: []
    });
    return;
  }

  sendOk(res, details);
});

router.get("/compare/:runA/:runB", async (req, res) => {
  const runA = String(req.params?.runA || "").trim();
  const runB = String(req.params?.runB || "").trim();
  if (!runA || !runB) {
    sendError(res, 400, "VALIDATION_ERROR", "Both runA and runB are required.");
    return;
  }
  const data = await compareRuns(runA, runB);
  sendOk(res, data);
});

export default router;
