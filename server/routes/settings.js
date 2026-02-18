import express from "express";
import { sendError, sendOk } from "../response.js";
import {
  getResponsibleAiPolicy,
  saveResponsibleAiPolicy
} from "../../lib/responsibleAi.js";
import { getWebPolicy, saveWebPolicy } from "../../lib/webPolicy.js";
import { formatZodError, responsibleAiPolicySchema, webPolicySchema } from "../../lib/validators.js";
import { getThemeSettings, saveThemeSettings } from "../../lib/themeSettings.js";

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

router.get("/web", async (_req, res) => {
  try {
    const policy = await getWebPolicy();
    sendOk(res, { policy });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load web policy: ${error.message}`);
  }
});

router.put("/web", async (req, res) => {
  const parsed = webPolicySchema.safeParse(req.body?.policy ?? req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid web policy payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const saved = await saveWebPolicy(parsed.data);
    sendOk(res, { policy: saved });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save web policy: ${error.message}`);
  }
});

router.get("/theme", async (_req, res) => {
  try {
    const theme = await getThemeSettings();
    sendOk(res, { theme });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load theme: ${error.message}`);
  }
});

router.put("/theme", async (req, res) => {
  const theme = req.body?.theme ?? req.body;
  if (!theme || typeof theme !== "object") {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid theme payload.");
    return;
  }
  try {
    const saved = await saveThemeSettings(theme);
    sendOk(res, { theme: saved });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save theme: ${error.message}`);
  }
});

export default router;
