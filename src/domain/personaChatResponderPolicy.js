import { mergeKnowledgePacks } from "../../lib/knowledgeUtils.js";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "from",
  "this",
  "have",
  "your",
  "about",
  "what",
  "when",
  "where",
  "which",
  "would",
  "could",
  "should",
  "into",
  "than",
  "then",
  "them",
  "they",
  "there",
  "their",
  "just",
  "like",
  "also",
  "only",
  "realistic",
  "based",
  "persona",
  "definitions",
  "please",
  "help",
  "need"
]);

const POKER_TERMS = [
  "poker",
  "holdem",
  "hold'em",
  "texas hold",
  "preflop",
  "flop",
  "turn",
  "river",
  "pot odds",
  "range",
  "bluff",
  "all-in",
  "equity",
  "button",
  "big blind",
  "small blind"
];

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function asksParticipantPresence(text) {
  const low = String(text || "").toLowerCase();
  return (
    /\bwho('?s| is)?\s+(else\s+)?(here|in\s+here|in\s+the\s+chat)\b/.test(low) ||
    /\bwho\s+is\s+here\b/.test(low) ||
    /\bparticipants?\b/.test(low) ||
    /\bwho\s+am\s+i\s+talking\s+to\b/.test(low)
  );
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMentionedPersonaIds(userMessage, personas) {
  const text = String(userMessage || "").toLowerCase();
  if (!text) return [];
  const matched = new Set();
  for (const persona of personas || []) {
    const id = String(persona.id || "").toLowerCase().trim();
    const name = String(persona.displayName || "").toLowerCase().trim();
    const idPattern = id ? new RegExp(`(?:^|\\s|[,(])@?${escapeRegex(id)}(?:$|\\s|[?.!,)])`, "i") : null;
    const namePattern = name
      ? new RegExp(`(?:^|\\s|[,(])@?${escapeRegex(name)}(?:$|\\s|[?.!,)])`, "i")
      : null;
    const firstName = name.split(/\s+/).filter(Boolean)[0] || "";
    const firstNamePattern = firstName
      ? new RegExp(`(?:^|\\s|[,(])@?${escapeRegex(firstName)}(?:$|\\s|[?.!,)])`, "i")
      : null;
    if ((idPattern && idPattern.test(text)) || (namePattern && namePattern.test(text))) {
      matched.add(persona.id);
      continue;
    }
    if (firstName && firstName.length >= 4 && firstNamePattern && firstNamePattern.test(text)) {
      matched.add(persona.id);
    }
  }
  return (personas || []).filter((p) => matched.has(p.id)).map((p) => p.id);
}

function personaScopeCorpus(persona, personaPacks) {
  const style = persona.speakingStyle || {};
  const bias = Array.isArray(persona.biasValues)
    ? persona.biasValues.join(" ")
    : String(persona.biasValues || "");
  const packs = (personaPacks || [])
    .map((p) => `${p.title || ""} ${(p.tags || []).join(" ")} ${String(p.content || "").slice(0, 2200)}`)
    .join(" ");
  return [
    persona.displayName,
    persona.role || "",
    persona.description || "",
    persona.systemPrompt || "",
    persona.debateBehavior || "",
    style.tone || "",
    style.verbosity || "",
    (style.quirks || []).join(" "),
    (persona.expertiseTags || []).join(" "),
    bias,
    packs
  ]
    .join(" ")
    .toLowerCase();
}

function hasPokerScope(scopeCorpus) {
  return POKER_TERMS.some((term) => scopeCorpus.includes(term));
}

function isGreetingOrSmallTalk(text) {
  const low = String(text || "").toLowerCase().trim();
  if (!low) return true;
  const compact = low.replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
  const greetings = new Set([
    "hi",
    "hello",
    "hey",
    "yo",
    "hiya",
    "good morning",
    "good afternoon",
    "good evening",
    "how are you",
    "how's it going",
    "whats up",
    "what's up",
    "nice to meet you",
    "thanks",
    "thank you"
  ]);
  if (greetings.has(compact)) return true;
  const words = compact.split(" ").filter(Boolean);
  return words.length <= 2 && words.every((w) => w.length <= 6);
}

function appearsOutOfScope({ userMessage, persona, personaPacks }) {
  const scope = personaScopeCorpus(persona, personaPacks);
  const userText = String(userMessage || "").toLowerCase();
  if (isGreetingOrSmallTalk(userText)) {
    return false;
  }
  const userTerms = [...new Set(tokenize(userText))];
  if (!userTerms.length) return false;

  const asksPoker = POKER_TERMS.some((term) => userText.includes(term));
  if (asksPoker && !hasPokerScope(scope)) {
    return true;
  }

  const overlap = userTerms.filter((term) => scope.includes(term)).length;
  const overlapRatio = overlap / userTerms.length;
  const hasPacks = Array.isArray(personaPacks) && personaPacks.length > 0;
  const highConfidenceMismatch = userTerms.length >= 6 && overlapRatio < 0.08;
  return highConfidenceMismatch && !hasPacks;
}

function recentSpeakerIds(messages, maxUserTurns = 2) {
  const recent = [];
  let userTurnsSeen = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (row.role === "persona" && row.speakerId) {
      recent.push(row.speakerId);
    }
    if (row.role === "user") {
      userTurnsSeen += 1;
      if (userTurnsSeen >= maxUserTurns) break;
    }
  }

  return recent;
}

function computePersonaRelevance({ userMessage, persona, personaPacks }) {
  const scope = personaScopeCorpus(persona, personaPacks);
  const userTerms = [...new Set(tokenize(userMessage))];
  if (!userTerms.length) return 0.15;
  const hits = userTerms.filter((term) => scope.includes(term)).length;
  return hits / userTerms.length;
}

function personaPacksFor(persona, knowledgeByPersona, globalKnowledgePacks) {
  const personaPacks = Array.isArray(knowledgeByPersona?.[persona.id]) ? knowledgeByPersona[persona.id] : [];
  return mergeKnowledgePacks(personaPacks, globalKnowledgePacks);
}

export function chooseResponders({
  personas,
  knowledgeByPersona,
  globalKnowledgePacks,
  userMessage,
  history,
  engagementMode = "chat"
}) {
  const mode = String(engagementMode || "chat");
  const mentionedIds = findMentionedPersonaIds(userMessage, personas);
  const asksRoster = asksParticipantPresence(userMessage);
  if (mode === "chat" && asksRoster) {
    return {
      selectedPersonas: [],
      rationale: [],
      omittedCount: personas.length,
      routeType: "moderator-roster",
      mentionedIds
    };
  }
  if (mode === "chat" && mentionedIds.length) {
    const selected = personas.filter((p) => mentionedIds.includes(p.id));
    const limited = selected.slice(0, 3);
    return {
      selectedPersonas: limited,
      rationale: limited.map((p) => ({
        speakerId: p.id,
        displayName: p.displayName,
        relevance: 1,
        outOfScope: false,
        reason: "Directly addressed by user."
      })),
      omittedCount: Math.max(0, personas.length - limited.length),
      routeType: "explicit"
    };
  }

  if (mode === "panel") {
    const scoredMap = new Map(
      personas.map((persona) => {
        const packs = personaPacksFor(persona, knowledgeByPersona, globalKnowledgePacks);
        const relevance = computePersonaRelevance({ userMessage, persona, personaPacks: packs });
        const outOfScope = appearsOutOfScope({ userMessage, persona, personaPacks: packs });
        return [persona.id, { relevance, outOfScope }];
      })
    );
    const selected = personas.slice();
    return {
      selectedPersonas: selected,
      rationale: selected.map((p) => {
        const scored = scoredMap.get(p.id) || { relevance: 0, outOfScope: false };
        return {
          speakerId: p.id,
          displayName: p.displayName,
          relevance: scored.relevance,
          outOfScope: scored.outOfScope,
          reason: "Panel round: all participants respond in sequence."
        };
      }),
      omittedCount: 0,
      routeType: "panel-round",
      mentionedIds
    };
  }

  const recent = recentSpeakerIds(history, 2);
  const recentPenaltyIds = new Set(recent.slice(0, 2));

  const scored = personas.map((persona) => {
    const packs = personaPacksFor(persona, knowledgeByPersona, globalKnowledgePacks);
    const relevance = computePersonaRelevance({ userMessage, persona, personaPacks: packs });
    const outOfScope = appearsOutOfScope({ userMessage, persona, personaPacks: packs });
    const recencyPenalty = recentPenaltyIds.has(persona.id) ? 0.12 : 0;
    const score = (outOfScope ? -1 : relevance) - recencyPenalty;
    return { persona, relevance, outOfScope, score };
  });

  const inScope = scored.filter((x) => !x.outOfScope).sort((a, b) => b.score - a.score);
  const outScope = scored.filter((x) => x.outOfScope).sort((a, b) => b.score - a.score);

  let target = 1;
  if (mode === "chat") {
    target = 1;
  } else if (mode === "panel") {
    target = personas.length >= 4 ? 3 : Math.min(2, personas.length);
  } else if (mode === "debate-work-order") {
    target = personas.length <= 4 ? personas.length : 3;
  }
  if (mode !== "chat" && inScope.length >= 2 && inScope[0].relevance - inScope[1].relevance < 0.15) {
    target = Math.max(target, 2);
  }
  target = Math.min(target, personas.length);

  let selected = inScope.slice(0, target);
  if (!selected.length && outScope.length) {
    selected = [outScope[0]];
  }

  const rationale = selected.map((x) => ({
    speakerId: x.persona.id,
    displayName: x.persona.displayName,
    relevance: Number(x.relevance.toFixed(3)),
    outOfScope: x.outOfScope,
    reason: x.outOfScope
      ? "Selected to provide an explicit out-of-scope handoff."
      : x.relevance >= 0.35
        ? `High relevance to current user message (${engagementMode} mode).`
        : `Included for diversity and continuity (${engagementMode} mode).`
  }));

  return {
    selectedPersonas: selected.map((x) => x.persona),
    rationale,
    omittedCount: personas.length - selected.length,
    routeType: mode === "chat" ? "inferred" : "facilitated"
  };
}

export function buildOrchestrationContent(orchestration, mode) {
  const selected = orchestration.rationale.map((r) => r.displayName).join(", ");
  if (orchestration.routeType === "moderator-roster") {
    return "Moderator handled roster question directly so everyone has clear participant context.";
  }
  if (mode === "chat") {
    if (orchestration.routeType === "explicit") {
      return `Moderator routed this turn to: ${selected}.`;
    }
    return `Moderator inferred likely addressee: ${selected}${orchestration.omittedCount ? ` (${orchestration.omittedCount} not selected this turn)` : ""}. Tip: mention @persona name to direct who replies.`;
  }
  if (mode === "panel") {
    return `Moderator selected panel responders: ${selected}${orchestration.omittedCount ? ` (${orchestration.omittedCount} omitted this turn)` : ""}.`;
  }
  if (mode === "debate-work-order") {
    return `Moderator selected decision contributors: ${selected}${orchestration.omittedCount ? ` (${orchestration.omittedCount} omitted this turn)` : ""}.`;
  }
  return `Orchestrator selected ${selected}${orchestration.omittedCount ? ` (${orchestration.omittedCount} omitted this turn)` : ""}.`;
}
