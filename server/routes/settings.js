import express from "express";
import { sendError, sendOk } from "../response.js";
import {
  getResponsibleAiPolicy,
  saveResponsibleAiPolicy
} from "../../lib/responsibleAi.js";
import { formatZodError, responsibleAiPolicySchema } from "../../lib/validators.js";

const router = express.Router();

router.get("/responsible-ai", async (_req, res) => {
  try {
    const policy = await getResponsibleAiPolicy();
    sendOk(res, { policy });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load Responsible AI policy: ${error.message}`);
  }
});

router.put("/responsible-ai", async (req, res) => {
  const parsed = responsibleAiPolicySchema.safeParse(req.body?.policy ?? req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid Responsible AI policy payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const saved = await saveResponsibleAiPolicy(parsed.data);
    sendOk(res, { policy: saved });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save Responsible AI policy: ${error.message}`);
  }
});

export default router;
