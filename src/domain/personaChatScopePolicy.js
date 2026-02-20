import { truncateText } from "../../lib/utils.js";

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

function personaScopeCorpus(persona, personaPacks) {
  const style = persona.speakingStyle || {};
  const bias = Array.isArray(persona.biasValues)
    ? persona.biasValues.join(" ")
    : String(persona.biasValues || "");
  const packs = (personaPacks || [])
    .map((p) => `${p.title || ""} ${(p.tags || []).join(" ")} ${truncateText(p.content || "", 2200)}`)
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

export function appearsOutOfScope({ userMessage, persona, personaPacks }) {
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

export function outOfScopeReply(persona, userMessage) {
  return [
    `I’m ${persona.displayName}, and that request is outside my defined scope.`,
    "I can help with topics aligned to my role, expertise tags, and attached knowledge packs.",
    `Please reframe your question around: ${(persona.expertiseTags || []).join(", ") || persona.role || "my persona definition"}.`,
    `Your message: ${truncateText(userMessage, 180)}`
  ].join(" ");
}

