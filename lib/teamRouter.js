import { listPersonas } from "./storage.js";

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

export async function routeTeam({
  mode = "auto",
  personaIds = [],
  tags = [],
  maxAgents = 3
} = {}) {
  const { personas } = await listPersonas();
  if (mode === "manual" && personaIds.length) {
    const selected = personaIds
      .map((id) => personas.find((p) => p.id === id))
      .filter(Boolean)
      .slice(0, Math.max(1, maxAgents));
    return {
      selectedPersonas: selected,
      selectedPersonaIds: selected.map((p) => p.id),
      reasoning: `Manual mode selected ${selected.length} personas.`
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
  const selected = fallback.slice(0, Math.max(1, maxAgents)).map((row) => row.persona);

  return {
    selectedPersonas: selected,
    selectedPersonaIds: selected.map((p) => p.id),
    reasoning: ranked.length
      ? `Auto mode matched expertise tags and selected top ${selected.length} persona(s).`
      : `Auto mode found no strong tag matches; selected ${selected.length} fallback persona(s).`
  };
}

