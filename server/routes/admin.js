import express from "express";
import {
  getChatAnalyticsDetail,
  getChatAnalyticsOverview,
  getDebateAnalyticsDetail,
  getDebateAnalyticsOverview,
  getPersonaAnalytics
} from "../../lib/adminAnalytics.js";
import {
  createGovernanceAdminChatSession,
  ensureGovernanceAdminAssets,
  getGovernanceAdminChat,
  listGovernanceAdminChats,
  sendGovernanceAdminChatMessage
} from "../../lib/adminGovernanceAgent.js";
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

router.post("/governance-chat/session", async (req, res) => {
  try {
    const data = await createGovernanceAdminChatSession({
      user: req.auth?.user || null,
      settings: req.body?.settings || {}
    });
    sendOk(res, data, 201);
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to create governance chat session: ${error.message}`);
  }
});

router.get("/governance-chat", async (_req, res) => {
  try {
    const chats = await listGovernanceAdminChats();
    sendOk(res, { chats });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to list governance chats: ${error.message}`);
  }
});

router.get("/governance-chat/:chatId", async (req, res) => {
  try {
    const data = await getGovernanceAdminChat(req.params.chatId);
    sendOk(res, data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Governance chat '${req.params.chatId}' not found.`);
      return;
    }
    if (error.code === "FORBIDDEN") {
      sendError(res, 403, "FORBIDDEN", "This chat is not a governance admin session.");
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to load governance chat: ${error.message}`);
  }
});

router.post("/governance-chat/:chatId/messages", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    sendError(res, 400, "VALIDATION_ERROR", "message is required.");
    return;
  }

  try {
    const data = await sendGovernanceAdminChatMessage(req.params.chatId, message);
    sendOk(res, data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Governance chat '${req.params.chatId}' not found.`);
      return;
    }
    if (error.code === "FORBIDDEN") {
      sendError(res, 403, "FORBIDDEN", "This chat is not a governance admin session.");
      return;
    }
    if (error.code === "VALIDATION_ERROR") {
      sendError(res, 400, "VALIDATION_ERROR", error.message);
      return;
    }
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "LLM provider credentials are not configured.");
      return;
    }
    sendError(res, 502, "LLM_ERROR", `Governance chat failed: ${error.message}`);
  }
});

router.post("/governance-chat/refresh-assets", async (_req, res) => {
  try {
    const data = await ensureGovernanceAdminAssets();
    sendOk(res, {
      packId: data.pack.id,
      personaId: data.persona.id,
      generatedAt: data.dataset.generatedAt
    });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to refresh governance assets: ${error.message}`);
  }
});

export default router;
