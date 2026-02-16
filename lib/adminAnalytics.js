import fs from "fs/promises";
import path from "path";
import { DEBATES_DIR, PERSONA_CHATS_DIR, PERSONAS_DIR, readJsonFile } from "./storage.js";
import { safeJsonParse, truncateText } from "./utils.js";

const MODEL_PRICING_USD_PER_1M = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 }
};

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function extractUsage(rawResponse) {
  const usage = rawResponse?.usage || {};
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens) || 0;
  return { promptTokens, completionTokens, totalTokens };
}

function estimateCostUsd(model, usageTotals) {
  const price = MODEL_PRICING_USD_PER_1M[model];
  if (!price) {
    return {
      estimatedCostUsd: null,
      pricingKnown: false
    };
  }

  const inputCost = (usageTotals.promptTokens / 1_000_000) * price.input;
  const outputCost = (usageTotals.completionTokens / 1_000_000) * price.output;

  return {
    estimatedCostUsd: Number((inputCost + outputCost).toFixed(6)),
    pricingKnown: true
  };
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter((row) => row.ok)
      .map((row) => row.value);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function summarizeDebate({ debateId, session, transcript, messageRows }) {
  const model = session?.settings?.model || "unknown";
  const usageTotals = messageRows.reduce(
    (acc, row) => {
      if (!String(row.type || "").includes("response")) return acc;
      const usage = extractUsage(row.response);
      acc.promptTokens += usage.promptTokens;
      acc.completionTokens += usage.completionTokens;
      acc.totalTokens += usage.totalTokens;
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );

  const cost = estimateCostUsd(model, usageTotals);
  const participants = (session.personas || []).map((p) => p.displayName);
  const outcome =
    session.finalSynthesis ||
    (session.turns || [])
      .filter((t) => t.type === "moderator")
      .slice(-1)
      .map((t) => t.text)[0] ||
    "";

  return {
    debateId,
    title: session.topic || debateId,
    topicSummary: truncateText(session.context || session.topic || "", 220),
    participants,
    participantCount: participants.length,
    status: session.status || "unknown",
    createdAt: session.createdAt || null,
    completedAt: session.completedAt || null,
    rounds: session.settings?.rounds || null,
    model,
    outcomes: truncateText(outcome || transcript || "", 360),
    tokenUsage: usageTotals,
    estimatedCostUsd: cost.estimatedCostUsd,
    pricingKnown: cost.pricingKnown,
    drillSummary: {
      turns: (session.turns || []).length,
      transcriptChars: String(transcript || "").length
    }
  };
}

function buildDebateDrilldown(session) {
  const byRound = new Map();
  for (const turn of session.turns || []) {
    const r = Number(turn.round || 0);
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push({
      speaker: turn.displayName,
      type: turn.type,
      text: turn.text,
      wordCount: wordCount(turn.text),
      createdAt: turn.createdAt
    });
  }

  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, entries]) => ({ round, entries }));
}

export async function getDebateAnalyticsOverview(limit = 100) {
  let entries = [];
  try {
    entries = await fs.readdir(DEBATES_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { debates: [], totals: {} };
    throw error;
  }

  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).slice(0, limit);
  const debates = [];

  for (const debateId of folders) {
    try {
      const dir = path.join(DEBATES_DIR, debateId);
      const session = await readJsonFile(path.join(dir, "session.json"));
      const transcript = await fs.readFile(path.join(dir, "transcript.md"), "utf8").catch(() => "");
      const messageRows = await readJsonl(path.join(dir, "messages.jsonl"));
      debates.push(summarizeDebate({ debateId, session, transcript, messageRows }));
    } catch {
      // skip malformed debate directories
    }
  }

  debates.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const totals = debates.reduce(
    (acc, debate) => {
      acc.debates += 1;
      acc.totalTokens += debate.tokenUsage.totalTokens;
      if (typeof debate.estimatedCostUsd === "number") acc.estimatedCostUsd += debate.estimatedCostUsd;
      if (debate.status === "completed") acc.completed += 1;
      return acc;
    },
    { debates: 0, completed: 0, totalTokens: 0, estimatedCostUsd: 0 }
  );
  totals.estimatedCostUsd = Number(totals.estimatedCostUsd.toFixed(6));

  let chatOverview = { chats: [] };
  try {
    chatOverview = await getPersonaChatAnalyticsOverview(limit);
  } catch {
    chatOverview = { chats: [] };
  }
  const chats = chatOverview.chats || [];
  totals.chats = chats.length;
  totals.totalConversations = totals.debates + totals.chats;
  totals.chatMessages = chats.reduce((acc, chat) => acc + Number(chat.messageCount || 0), 0);

  return {
    debates,
    chats,
    totals,
    pricingNote:
      "Estimated cost is derived from a static model pricing table in server code and may differ from actual billing."
  };
}

function summarizePersonaChat({ chatId, session, messages }) {
  const participants = (session.personas || []).map((p) => p.displayName);
  const userMessages = messages.filter((m) => m.role === "user");
  const personaMessages = messages.filter((m) => m.role === "persona");
  const turns = [...new Set(messages.map((m) => m.turnId).filter(Boolean))].length;
  const lastTs = messages.length ? messages[messages.length - 1].ts : session.updatedAt || session.createdAt || null;

  return {
    chatId,
    title: session.title || chatId,
    contextSummary: truncateText(session.context || "", 220),
    participants,
    participantCount: participants.length,
    createdAt: session.createdAt || null,
    updatedAt: session.updatedAt || null,
    lastActivityAt: lastTs,
    model: session.settings?.model || "unknown",
    turns,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    personaMessageCount: personaMessages.length,
    summary: truncateText(
      personaMessages.slice(-2).map((m) => `${m.displayName}: ${m.content}`).join(" | ") || "No persona replies yet.",
      360
    )
  };
}

export async function getPersonaChatAnalyticsOverview(limit = 100) {
  let entries = [];
  try {
    entries = await fs.readdir(PERSONA_CHATS_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { chats: [] };
    throw error;
  }

  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).slice(0, limit);
  const chats = [];

  for (const chatId of folders) {
    try {
      const dir = path.join(PERSONA_CHATS_DIR, chatId);
      const session = await readJsonFile(path.join(dir, "session.json"));
      const messages = await readJsonl(path.join(dir, "messages.jsonl"));
      chats.push(summarizePersonaChat({ chatId, session, messages }));
    } catch {
      // skip malformed chat directories
    }
  }

  chats.sort((a, b) => String(b.lastActivityAt || b.createdAt || "").localeCompare(String(a.lastActivityAt || a.createdAt || "")));
  return { chats };
}

export async function getPersonaChatAnalyticsDetail(chatId) {
  const dir = path.join(PERSONA_CHATS_DIR, chatId);
  const session = await readJsonFile(path.join(dir, "session.json"));
  const messages = await readJsonl(path.join(dir, "messages.jsonl"));
  const summary = summarizePersonaChat({ chatId, session, messages });
  return {
    ...summary,
    session,
    messages
  };
}

export async function getDebateAnalyticsDetail(debateId) {
  const dir = path.join(DEBATES_DIR, debateId);
  const session = await readJsonFile(path.join(dir, "session.json"));
  const transcript = await fs.readFile(path.join(dir, "transcript.md"), "utf8").catch(() => "");
  const messageRows = await readJsonl(path.join(dir, "messages.jsonl"));

  const summary = summarizeDebate({ debateId, session, transcript, messageRows });
  return {
    ...summary,
    transcript,
    rounds: buildDebateDrilldown(session)
  };
}

export async function getPersonaAnalytics() {
  const personaFiles = await fs
    .readdir(PERSONAS_DIR)
    .then((files) => files.filter((f) => f.endsWith(".json")))
    .catch((err) => {
      if (err.code === "ENOENT") return [];
      throw err;
    });

  const personas = [];
  for (const file of personaFiles) {
    try {
      const persona = await readJsonFile(path.join(PERSONAS_DIR, file));
      personas.push({
        id: persona.id,
        displayName: persona.displayName,
        role: persona.role || "",
        expertiseTags: persona.expertiseTags || [],
        description: persona.description || "",
        createdAt: persona.createdAt || null,
        updatedAt: persona.updatedAt || null,
        metrics: {
          debateCount: 0,
          turnCount: 0,
          chatCount: 0,
          chatTurnCount: 0,
          avgWordsPerTurn: 0,
          lastUsedAt: null
        }
      });
    } catch {
      // skip malformed persona files
    }
  }

  let debateFolders = [];
  try {
    debateFolders = (await fs.readdir(DEBATES_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const personaMap = new Map(personas.map((p) => [p.id, p]));

  for (const debateId of debateFolders) {
    const sessionPath = path.join(DEBATES_DIR, debateId, "session.json");
    let session;
    try {
      session = await readJsonFile(sessionPath);
    } catch {
      continue;
    }

    const usedInDebate = new Set();
    for (const turn of session.turns || []) {
      if (turn.type !== "persona") continue;
      const p = personaMap.get(turn.speakerId);
      if (!p) continue;

      p.metrics.turnCount += 1;
      p.metrics.avgWordsPerTurn += wordCount(turn.text);
      if (!p.metrics.lastUsedAt || String(turn.createdAt) > String(p.metrics.lastUsedAt)) {
        p.metrics.lastUsedAt = turn.createdAt;
      }
      usedInDebate.add(p.id);
    }

    for (const id of usedInDebate) {
      const p = personaMap.get(id);
      if (p) p.metrics.debateCount += 1;
    }
  }

  let chatFolders = [];
  try {
    chatFolders = (await fs.readdir(PERSONA_CHATS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  for (const chatId of chatFolders) {
    const sessionPath = path.join(PERSONA_CHATS_DIR, chatId, "session.json");
    const messagesPath = path.join(PERSONA_CHATS_DIR, chatId, "messages.jsonl");
    let session;
    let messages;
    try {
      session = await readJsonFile(sessionPath);
      messages = await readJsonl(messagesPath);
    } catch {
      continue;
    }

    const personaIdsInChat = new Set((session.personas || []).map((p) => p.id));
    const usedInChat = new Set();

    for (const row of messages || []) {
      if (row.role !== "persona") continue;
      const p = personaMap.get(row.speakerId);
      if (!p) continue;
      p.metrics.chatTurnCount += 1;
      if (!p.metrics.lastUsedAt || String(row.ts) > String(p.metrics.lastUsedAt)) {
        p.metrics.lastUsedAt = row.ts;
      }
      usedInChat.add(p.id);
    }

    for (const id of personaIdsInChat) {
      const p = personaMap.get(id);
      if (p) p.metrics.chatCount += 1;
    }

    // Backfill participation based on actual messages even if session list misses a persona id.
    for (const id of usedInChat) {
      const p = personaMap.get(id);
      if (p && !personaIdsInChat.has(id)) p.metrics.chatCount += 1;
    }
  }

  for (const p of personas) {
    if (p.metrics.turnCount > 0) {
      p.metrics.avgWordsPerTurn = Number((p.metrics.avgWordsPerTurn / p.metrics.turnCount).toFixed(1));
    }
  }

  personas.sort((a, b) => b.metrics.debateCount - a.metrics.debateCount || a.displayName.localeCompare(b.displayName));
  return { personas };
}
