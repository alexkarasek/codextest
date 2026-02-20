import express from "express";
import {
  getAgentCoverageHeatmap,
  getPersonaAnalytics
} from "../../lib/adminAnalytics.js";
import {
  createGovernanceAdminChatSession,
  ensureGovernanceAdminAssets,
  getGovernanceAdminChat,
  listGovernanceAdminChats,
  sendGovernanceAdminChatMessage
} from "../../lib/adminGovernanceAgent.js";
import { resetDemoData } from "../../lib/systemReset.js";
import {
  getConversationProjectionDetail,
  listConversationProjection
} from "../../src/services/conversationProjection.js";
import { sendError, sendOk } from "../response.js";
import { sendMappedError } from "../errorMapper.js";

const router = express.Router();

router.get("/overview", async (req, res) => {
  const limit = Number(req.query.limit);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;

  try {
    const projection = await listConversationProjection({
      limit: safeLimit,
      includeDebates: true,
      includeChats: true
    });
    sendOk(res, {
      debates: projection.debates,
      chats: projection.chats,
      conversations: projection.conversations,
      totals: projection.totals,
      pricingNote: projection.pricingNote
    });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load admin overview: ${e.message}`
    });
  }
});

router.get("/debates/:debateId", async (req, res) => {
  try {
    const data = await getConversationProjectionDetail(req.params.debateId);
    if (data.conversationType !== "debate") {
      sendError(res, 404, "NOT_FOUND", `Debate '${req.params.debateId}' not found.`);
      return;
    }
    sendOk(res, data);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Debate '${req.params.debateId}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to load debate analytics: ${e.message}` }
    );
  }
});

router.get("/personas", async (_req, res) => {
  try {
    const data = await getPersonaAnalytics();
    sendOk(res, data);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load persona analytics: ${e.message}`
    });
  }
});

router.get("/heatmap", async (req, res) => {
  const mode = String(req.query.mode || "capability");
  const limit = Number(req.query.limit);
  const maxColumns = Number(req.query.maxColumns);
  try {
    const data = await getAgentCoverageHeatmap({
      mode,
      limit: Number.isFinite(limit) ? limit : undefined,
      maxColumns: Number.isFinite(maxColumns) ? maxColumns : undefined
    });
    sendOk(res, data);
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load admin heatmap: ${e.message}`
    });
  }
});

router.get("/chats", async (req, res) => {
  const limit = Number(req.query.limit);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;

  try {
    const projection = await listConversationProjection({
      limit: safeLimit,
      includeDebates: false,
      includeChats: true
    });
    sendOk(res, { chats: projection.chats });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to load chat analytics: ${e.message}`
    });
  }
});

router.get("/chats/:chatId", async (req, res) => {
  try {
    const data = await getConversationProjectionDetail(req.params.chatId);
    if (data.conversationType === "debate") {
      sendError(res, 404, "NOT_FOUND", `Chat '${req.params.chatId}' not found.`);
      return;
    }
    sendOk(res, data);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Chat '${req.params.chatId}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to load chat detail: ${e.message}` }
    );
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
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to create governance chat session: ${e.message}`
    });
  }
});

router.get("/governance-chat", async (_req, res) => {
  try {
    const chats = await listGovernanceAdminChats();
    sendOk(res, { chats });
  } catch (error) {
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to list governance chats: ${e.message}`
    });
  }
});

router.get("/governance-chat/:chatId", async (req, res) => {
  try {
    const data = await getGovernanceAdminChat(req.params.chatId);
    sendOk(res, data);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [
        { matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Governance chat '${req.params.chatId}' not found.` },
        { code: "FORBIDDEN", status: 403, message: "This chat is not a governance admin session." }
      ],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to load governance chat: ${e.message}` }
    );
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
    sendMappedError(
      res,
      error,
      [
        { matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Governance chat '${req.params.chatId}' not found.` },
        { code: "FORBIDDEN", status: 403, message: "This chat is not a governance admin session." },
        { code: "VALIDATION_ERROR", status: 400 },
        { code: "MISSING_API_KEY", status: 400, message: "LLM provider credentials are not configured." }
      ],
      { status: 502, code: "LLM_ERROR", message: (e) => `Governance chat failed: ${e.message}` }
    );
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
    sendMappedError(res, error, [], {
      status: 500,
      code: "SERVER_ERROR",
      message: (e) => `Failed to refresh governance assets: ${e.message}`
    });
  }
});

router.post("/system/reset", async (req, res) => {
  if (req.auth?.user?.role !== "admin") {
    sendError(res, 403, "FORBIDDEN", "Only admins can run system reset.");
    return;
  }
  const scope = String(req.body?.scope || "usage").toLowerCase();
  if (!["usage", "full"].includes(scope)) {
    sendError(res, 400, "VALIDATION_ERROR", "scope must be 'usage' or 'full'.");
    return;
  }
  try {
    const data = await resetDemoData(
      {
        scope,
        keepUsers: req.body?.keepUsers !== false,
        keepApiKeys: req.body?.keepApiKeys !== false,
        keepSettings: req.body?.keepSettings !== false,
        keepLogo: req.body?.keepLogo !== false,
        reason: req.body?.reason || ""
      },
      req.auth?.user || null
    );
    sendOk(res, data);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [],
      { status: 500, code: "SERVER_ERROR", message: (e) => `Failed to reset system data: ${e.message}` }
    );
  }
});

export default router;
