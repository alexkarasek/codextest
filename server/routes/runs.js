import express from "express";
import { sendError, sendOk } from "../response.js";
import { getRunDetails, listRuns } from "../../packages/core/events/index.js";

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
    sendError(res, 404, "NOT_FOUND", `Run '${runId}' not found.`);
    return;
  }

  sendOk(res, details);
});

export default router;
