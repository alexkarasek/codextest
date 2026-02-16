import express from "express";
import {
  getChatAnalyticsDetail,
  getChatAnalyticsOverview,
  getDebateAnalyticsDetail,
  getDebateAnalyticsOverview,
  getPersonaAnalytics
} from "../../lib/adminAnalytics.js";
import { sendError, sendOk } from "../response.js";

const router = express.Router();

router.get("/overview", async (req, res) => {
  const limit = Number(req.query.limit);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;

  try {
    const data = await getDebateAnalyticsOverview(safeLimit);
    sendOk(res, data);
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load admin overview: ${error.message}`);
  }
});

router.get("/debates/:debateId", async (req, res) => {
  try {
    const data = await getDebateAnalyticsDetail(req.params.debateId);
    sendOk(res, data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Debate '${req.params.debateId}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to load debate analytics: ${error.message}`);
  }
});

router.get("/personas", async (_req, res) => {
  try {
    const data = await getPersonaAnalytics();
    sendOk(res, data);
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load persona analytics: ${error.message}`);
  }
});

router.get("/chats", async (req, res) => {
  const limit = Number(req.query.limit);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;

  try {
    const data = await getChatAnalyticsOverview(safeLimit);
    sendOk(res, data);
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load chat analytics: ${error.message}`);
  }
});

router.get("/chats/:chatId", async (req, res) => {
  try {
    const data = await getChatAnalyticsDetail(req.params.chatId);
    sendOk(res, data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Chat '${req.params.chatId}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to load chat detail: ${error.message}`);
  }
});

export default router;
