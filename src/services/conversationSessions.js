import { slugify, timestampForId } from "../../lib/utils.js";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 7);
}

function personaChatModeFromSettings(settings) {
  if (settings?.engagementMode === "panel") return "panel";
  if (settings?.engagementMode === "debate-work-order") return "debate-work-order";
  return "group-chat";
}

export function buildDebateConversationSession({
  topic,
  context,
  topicDiscovery,
  settings,
  personas,
  selectionMeta,
  knowledgePacks,
  globalKnowledgePackIds,
  personaKnowledgeMap,
  user
}) {
  const stamp = timestampForId();
  const debateId = `${stamp}-${slugify(topic) || "debate"}`;
  const now = new Date().toISOString();

  const session = {
    debateId,
    conversationKind: "group",
    conversationMode: "debate",
    conversationEngine: "debate-orchestrator",
    topic,
    context: context || "",
    topicDiscovery: topicDiscovery || { query: "", selectedTitle: "", selectedSummary: "", sources: [] },
    knowledgePacks,
    knowledgePackCatalog: knowledgePacks,
    knowledgePackIds: globalKnowledgePackIds,
    globalKnowledgePackIds,
    personaKnowledgeMap,
    settings,
    personas,
    personaSelection: selectionMeta,
    createdBy: user?.id || null,
    createdByUsername: user?.username || null,
    status: "queued",
    createdAt: now,
    progress: {
      round: 0,
      currentSpeaker: null,
      message: "Queued"
    },
    turns: []
  };

  return { conversationId: debateId, session };
}

export function buildPersonaChatConversationSession({
  title,
  context,
  settings,
  personas,
  knowledgeByPersona,
  knowledgePacks,
  globalKnowledgePackIds,
  user
}) {
  const chatId = `${timestampForId()}-${slugify(title || "persona-chat") || "persona-chat"}-${randomSuffix()}`;
  const now = new Date().toISOString();

  const session = {
    chatId,
    conversationKind: "group",
    conversationMode: personaChatModeFromSettings(settings),
    conversationEngine: "persona-chat-orchestrator",
    title: title || "Persona Collaboration Chat",
    context: context || "",
    settings,
    personas,
    knowledgeByPersona,
    knowledgePackIds: globalKnowledgePackIds,
    knowledgePacks,
    createdBy: user?.id || null,
    createdByUsername: user?.username || null,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    turnIndex: 0,
    lastSpeakerIds: []
  };

  return { conversationId: chatId, session };
}
