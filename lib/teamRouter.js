import { listPersonas } from "./storage.js";
import { listProviderTargets } from "../src/agents/providerService.js";
import { createAgentProviderRegistry } from "../src/agents/agentProviderRegistry.js";
import { buildFoundryParticipant } from "../src/services/conversationParticipants.js";

function norm(value) {
  return String(value || "").toLowerCase().trim();
}

function overlapScore(persona, tags) {
  const pTags = new Set((persona.expertiseTags || []).map((t) => norm(t)));
  const query = tags.map((t) => norm(t)).filter(Boolean);
  if (!query.length) return 0;
  let score = 0;
  query.forEach((tag) => {
    if (pTags.has(tag)) score += 2;
    if (norm(persona.description || "").includes(tag)) score += 1;
    if (norm(persona.role || "").includes(tag)) score += 1;
  });
  return score;
}

function foundryOverlapScore(target, tags) {
  const targetTags = new Set((target.tags || []).map((t) => norm(t)));
  const query = tags.map((t) => norm(t)).filter(Boolean);
  if (!query.length) return 0;
  let score = 0;
  query.forEach((tag) => {
    if (targetTags.has(tag)) score += 2;
    if (norm(target.description || "").includes(tag)) score += 1;
    if (norm(target.label || target.displayName || "").includes(tag)) score += 1;
  });
  return score;
}

async function listAvailableFoundryTargets() {
  const registry = createAgentProviderRegistry();
  const manifests = await registry.listAgents();
  const availableIds = new Set(
    manifests
      .filter((row) => row?.provider === "foundry")
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
  );
  if (!availableIds.size) return [];

  return listProviderTargets().filter(
    (target) =>
      target?.type === "agent" &&
      target?.provider === "foundry" &&
      availableIds.has(String(target.id || "").trim())
  );
}

async function resolveFoundryParticipantsByIds(ids = [], maxAgents = 3) {
  const targetIds = new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
  if (!targetIds.size) return [];
  const targets = await listAvailableFoundryTargets();
  return targets
    .filter((target) => targetIds.has(String(target.id || "").trim()))
    .slice(0, Math.max(1, maxAgents))
    .map((target) => buildFoundryParticipant(target));
}

export async function resolveTaskParticipantsByIds(ids = [], { maxAgents = 3 } = {}) {
  const requestedIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (!requestedIds.length) return [];

  const { personas } = await listPersonas();
  const personaById = new Map(personas.map((persona) => [String(persona.id || "").trim(), persona]));
  const selected = [];

  for (const id of requestedIds) {
    if (selected.length >= Math.max(1, maxAgents)) break;
    const persona = personaById.get(id);
    if (persona) {
      selected.push(persona);
    }
  }

  if (selected.length >= Math.max(1, maxAgents)) {
    return selected;
  }

  const foundry = await resolveFoundryParticipantsByIds(requestedIds, maxAgents);
  for (const participant of foundry) {
    if (selected.length >= Math.max(1, maxAgents)) break;
    if (!selected.some((row) => row.id === participant.id)) {
      selected.push(participant);
    }
  }

  return selected;
}

export async function routeTeam({
  mode = "auto",
  personaIds = [],
  tags = [],
  maxAgents = 3
} = {}) {
  const limit = Math.max(1, maxAgents);
  const { personas } = await listPersonas();
  if (mode === "manual" && personaIds.length) {
    const selected = await resolveTaskParticipantsByIds(personaIds, { maxAgents: limit });
    return {
      selectedParticipants: selected,
      selectedPersonas: selected,
      selectedPersonaIds: selected.map((p) => p.id),
      reasoning: `Manual mode selected ${selected.length} participant(s).`
    };
  }

  const scored = personas
    .map((persona) => ({
      persona,
      score: overlapScore(persona, tags)
    }))
    .sort((a, b) => b.score - a.score || String(a.persona.displayName || "").localeCompare(String(b.persona.displayName || "")));

  const ranked = scored.filter((row) => row.score > 0);
  const fallback = ranked.length ? ranked : scored;
  const selected = fallback.slice(0, limit).map((row) => row.persona);
  if (selected.length) {
    return {
      selectedParticipants: selected,
      selectedPersonas: selected,
      selectedPersonaIds: selected.map((p) => p.id),
      reasoning: ranked.length
        ? `Auto mode matched expertise tags and selected top ${selected.length} persona(s).`
        : `Auto mode found no strong tag matches; selected ${selected.length} fallback persona(s).`
    };
  }

  const foundryTargets = await listAvailableFoundryTargets();
  const foundryScored = foundryTargets
    .map((target) => ({
      target,
      score: foundryOverlapScore(target, tags)
    }))
    .sort((a, b) => b.score - a.score || String(a.target.label || a.target.displayName || "").localeCompare(String(b.target.label || b.target.displayName || "")));
  const foundryRanked = foundryScored.filter((row) => row.score > 0);
  const foundryFallback = foundryRanked.length ? foundryRanked : foundryScored;
  const selectedFoundry = foundryFallback
    .slice(0, limit)
    .map((row) => buildFoundryParticipant(row.target));

  return {
    selectedParticipants: selectedFoundry,
    selectedPersonas: selectedFoundry,
    selectedPersonaIds: selectedFoundry.map((p) => p.id),
    reasoning: foundryRanked.length
      ? `Auto mode fell back to Foundry agents and selected top ${selectedFoundry.length} participant(s) by tag match.`
      : `Auto mode found no local personas; selected ${selectedFoundry.length} fallback Foundry participant(s).`
  };
}
