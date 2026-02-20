import {
  getChatAnalyticsDetail,
  getChatAnalyticsOverview,
  getDebateAnalyticsDetail,
  getDebateAnalyticsOverview
} from "../../lib/adminAnalytics.js";

function toDebateConversationSummary(debate) {
  return {
    ...debate,
    id: debate.debateId,
    conversationId: debate.debateId,
    conversationType: "debate",
    kind: "group",
    conversationKind: "group",
    conversationMode: debate.conversationMode || "debate",
    transcriptCapable: true
  };
}

function toChatConversationSummary(chat) {
  return {
    ...chat,
    id: chat.chatId,
    conversationId: chat.chatId,
    conversationType: chat.kind === "simple" ? "simple-chat" : chat.kind === "support" ? "support-chat" : "group-chat",
    conversationKind: chat.kind === "simple" ? "simple" : "group",
    conversationMode: chat.conversationMode || chat.engagementMode || (chat.kind === "simple" ? "simple" : "group-chat"),
    transcriptCapable: false
  };
}

export async function listConversationProjection({
  limit = 100,
  includeDebates = true,
  includeChats = true
} = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 100;
  const [debateOverview, chatOverview] = await Promise.all([
    includeDebates ? getDebateAnalyticsOverview(safeLimit) : { debates: [], totals: {} },
    includeChats ? getChatAnalyticsOverview(safeLimit) : { chats: [] }
  ]);

  const debates = (debateOverview.debates || []).map(toDebateConversationSummary);
  const chats = (chatOverview.chats || []).map(toChatConversationSummary);
  const conversations = [...debates, ...chats].sort((a, b) =>
    String(b.lastActivityAt || b.updatedAt || b.createdAt || "").localeCompare(
      String(a.lastActivityAt || a.updatedAt || a.createdAt || "")
    )
  );

  return {
    conversations,
    debates,
    chats,
    totals: debateOverview.totals || {},
    pricingNote: debateOverview.pricingNote || ""
  };
}

export async function getConversationProjectionDetail(conversationId) {
  const id = String(conversationId || "").trim();
  if (!id) {
    const err = new Error("conversationId is required.");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  try {
    const debate = await getDebateAnalyticsDetail(id);
    return {
      ...debate,
      id: debate.debateId,
      conversationId: debate.debateId,
      conversationType: "debate",
      conversationKind: "group",
      conversationMode: debate.conversationMode || "debate",
      transcriptCapable: true
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const chat = await getChatAnalyticsDetail(id);
  return {
    ...chat,
    id: chat.chatId,
    conversationId: chat.chatId,
    conversationType: chat.kind === "simple" ? "simple-chat" : chat.kind === "support" ? "support-chat" : "group-chat",
    conversationKind: chat.kind === "simple" ? "simple" : "group",
    conversationMode: chat.conversationMode || chat.engagementMode || (chat.kind === "simple" ? "simple" : "group-chat"),
    transcriptCapable: false
  };
}
