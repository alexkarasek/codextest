import { createDebateFiles, createPersonaChatFiles, getKnowledgePack } from "../../lib/storage.js";
import { resolveDebatePersonas, resolveSelectedPersonas } from "./conversationParticipants.js";
import { resolveDebateKnowledge, resolveChatKnowledge } from "./conversationKnowledge.js";
import {
  buildDebateConversationSession,
  buildPersonaChatConversationSession
} from "./conversationSessions.js";

async function resolveKnowledgeForPersonas(personas) {
  const byPersona = {};
  const cache = new Map();

  for (const persona of personas || []) {
    const ids = [...new Set(persona.knowledgePackIds || [])];
    byPersona[persona.id] = [];
    for (const id of ids) {
      if (!cache.has(id)) {
        try {
          const pack = await getKnowledgePack(id);
          cache.set(id, pack);
        } catch {
          cache.set(id, null);
        }
      }
      const pack = cache.get(id);
      if (pack) byPersona[persona.id].push(pack);
    }
  }

  return byPersona;
}

async function createDebateModeSession(payload, user) {
  const resolvedParticipants = await resolveDebatePersonas({
    selectedPersonas: payload.selectedPersonas,
    topic: payload.topic,
    context: payload.context,
    model: payload.settings?.model,
    maxCount: 3
  });
  const personas = resolvedParticipants.personas;
  const selectionMeta = resolvedParticipants.selectionMeta;

  const resolvedKnowledge = await resolveDebateKnowledge(personas, payload.knowledgePackIds);
  const built = buildDebateConversationSession({
    topic: payload.topic,
    context: payload.context,
    topicDiscovery: payload.topicDiscovery,
    settings: payload.settings,
    personas,
    selectionMeta,
    knowledgePacks: resolvedKnowledge.knowledgePacks,
    globalKnowledgePackIds: resolvedKnowledge.globalKnowledgePackIds,
    personaKnowledgeMap: resolvedKnowledge.personaKnowledgeMap,
    user
  });

  await createDebateFiles(built.conversationId, built.session);
  return {
    kind: "debate",
    conversationId: built.conversationId,
    session: built.session,
    personas,
    selectionMeta,
    knowledgePacks: resolvedKnowledge.knowledgePacks
  };
}

async function createPersonaChatSession(payload, user) {
  const personas = await resolveSelectedPersonas(payload.selectedPersonas);
  const knowledgeByPersona = await resolveKnowledgeForPersonas(personas);
  const resolvedKnowledge = await resolveChatKnowledge(payload.knowledgePackIds);

  const built = buildPersonaChatConversationSession({
    title: payload.title,
    context: payload.context,
    settings: payload.settings,
    personas,
    knowledgeByPersona,
    knowledgePacks: resolvedKnowledge.knowledgePacks,
    globalKnowledgePackIds: resolvedKnowledge.globalKnowledgePackIds,
    user
  });

  await createPersonaChatFiles(built.conversationId, built.session);
  return {
    kind: "persona-chat",
    conversationId: built.conversationId,
    session: built.session,
    personas,
    knowledgeByPersona,
    knowledgePacks: resolvedKnowledge.knowledgePacks
  };
}

export async function createConversationSession({ kind, payload, user }) {
  const normalized = String(kind || "").trim().toLowerCase();
  if (normalized === "debate" || normalized === "debate-mode") {
    return createDebateModeSession(payload, user || null);
  }
  if (normalized === "persona-chat" || normalized === "group-chat") {
    return createPersonaChatSession(payload, user || null);
  }
  const err = new Error(`Unsupported session kind '${kind}'.`);
  err.code = "UNSUPPORTED_CONVERSATION_KIND";
  throw err;
}
