import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";
import { safeJsonParse } from "./utils.js";
import { responsibleAiPolicySchema } from "./validators.js";

const POLICY_PATH = path.join(SETTINGS_DIR, "responsible-ai.json");

const DEFAULT_POLICY = {
  stoplight: {
    redKeywords: [
      "kill",
      "suicide",
      "self-harm",
      "bomb",
      "terror",
      "ethnic cleansing",
      "genocide",
      "overdose",
      "rape",
      "how to hurt",
      "hack bank",
      "credit card theft"
    ],
    yellowKeywords: [
      "guaranteed profit",
      "insider tip",
      "evade taxes",
      "diagnose",
      "prescribe",
      "legal advice",
      "financial advice",
      "weapon",
      "violent",
      "harass",
      "exploit"
    ]
  },
  sentiment: {
    positiveKeywords: ["good", "great", "helpful", "constructive", "benefit", "improve", "safe", "clarify", "collaborate"],
    negativeKeywords: ["bad", "terrible", "harm", "danger", "risky", "hate", "angry", "useless", "worse"],
    threshold: 1
  }
};

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text, term) {
  const t = String(term || "").toLowerCase().trim();
  if (!t) return false;
  const pattern = `(?:^|[^a-z0-9])${escapeRegex(t)}(?:$|[^a-z0-9])`;
  return new RegExp(pattern, "i").test(text);
}

function containsAny(text, terms) {
  return terms.some((term) => containsTerm(text, term));
}

function normalizePolicy(candidate) {
  const parsed = responsibleAiPolicySchema.safeParse(candidate);
  if (!parsed.success) {
    return structuredClone(DEFAULT_POLICY);
  }
  return parsed.data;
}

export async function getResponsibleAiPolicy() {
  try {
    const raw = await fsp.readFile(POLICY_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return structuredClone(DEFAULT_POLICY);
    return normalizePolicy(parsed.value);
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(DEFAULT_POLICY);
    throw error;
  }
}

export function getResponsibleAiPolicySync() {
  try {
    if (!fs.existsSync(POLICY_PATH)) return structuredClone(DEFAULT_POLICY);
    const raw = fs.readFileSync(POLICY_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return structuredClone(DEFAULT_POLICY);
    return normalizePolicy(parsed.value);
  } catch {
    return structuredClone(DEFAULT_POLICY);
  }
}

export async function saveResponsibleAiPolicy(policy) {
  const normalized = normalizePolicy(policy);
  await fsp.mkdir(SETTINGS_DIR, { recursive: true });
  await fsp.writeFile(POLICY_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function assessTextRisk(text, policy = null) {
  const raw = String(text || "").trim();
  const low = raw.toLowerCase();
  const activePolicy = normalizePolicy(policy || getResponsibleAiPolicySync());

  const red = containsAny(low, activePolicy.stoplight.redKeywords || []);
  const yellow = !red && containsAny(low, activePolicy.stoplight.yellowKeywords || []);
  const stoplight = red ? "red" : yellow ? "yellow" : "green";

  let pos = 0;
  let neg = 0;
  for (const term of activePolicy.sentiment.positiveKeywords || []) {
    if (low.includes(String(term).toLowerCase())) pos += 1;
  }
  for (const term of activePolicy.sentiment.negativeKeywords || []) {
    if (low.includes(String(term).toLowerCase())) neg += 1;
  }
  const threshold = Number(activePolicy.sentiment.threshold || 1);
  const sentiment = pos - neg >= threshold ? "positive" : neg - pos >= threshold ? "negative" : "neutral";

  return { stoplight, sentiment };
}

export function aggregateRiskSignals(textRows, policy = null) {
  const activePolicy = normalizePolicy(policy || getResponsibleAiPolicySync());
  const result = {
    stoplights: { green: 0, yellow: 0, red: 0 },
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    exchangeCount: 0
  };

  for (const row of textRows || []) {
    const content = String(row || "").trim();
    if (!content) continue;
    const assessed = assessTextRisk(content, activePolicy);
    result.exchangeCount += 1;
    result.stoplights[assessed.stoplight] += 1;
    result.sentiment[assessed.sentiment] += 1;
  }

  return result;
}
