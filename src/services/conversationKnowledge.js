import { normalizeKnowledgePackIds, resolveKnowledgePacks } from "../../lib/knowledgeUtils.js";

export async function resolveDebateKnowledge(personas, knowledgePackIds) {
  const globalKnowledgePackIds = normalizeKnowledgePackIds(knowledgePackIds);
  const personaKnowledgeMap = (personas || []).reduce((acc, persona) => {
    acc[persona.id] = [...new Set(persona.knowledgePackIds || [])];
    return acc;
  }, {});
  const allPersonaPackIds = Object.values(personaKnowledgeMap).flat();
  const allKnowledgePackIds = [...new Set([...globalKnowledgePackIds, ...allPersonaPackIds])];
  const knowledgePacks = await resolveKnowledgePacks(allKnowledgePackIds);

  return {
    globalKnowledgePackIds,
    personaKnowledgeMap,
    knowledgePacks
  };
}

export async function resolveChatKnowledge(knowledgePackIds) {
  const globalKnowledgePackIds = normalizeKnowledgePackIds(knowledgePackIds);
  const knowledgePacks = await resolveKnowledgePacks(globalKnowledgePackIds);
  return {
    globalKnowledgePackIds,
    knowledgePacks
  };
}
