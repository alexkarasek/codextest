import fs from "fs/promises";
import path from "path";
import {
  DEBATES_DIR,
  PERSONA_CHATS_DIR,
  PERSONAS_DIR,
  SIMPLE_CHATS_DIR,
  SUPPORT_DIR,
  readJsonFile
} from "./storage.js";
import { aggregateRiskSignals } from "./responsibleAi.js";
import { safeJsonParse, truncateText } from "./utils.js";

const MODEL_PRICING_USD_PER_1M = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 }
};
const MAX_TRACE_CHARS = 1200;

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

function maskSecrets(value) {
  return String(value || "")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "sk-***")
    .replace(/\b(pk_[A-Za-z0-9_-]{8,})\b/g, "pk_***")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._-]{8,}\b/gi, "$1 ***")
    .replace(/\b(OPENAI_API_KEY|AZURE_OPENAI_API_KEY)\s*[:=]\s*['"]?[^'"\s]+['"]?/gi, "$1=***");
}

function truncateMasked(value, maxChars = MAX_TRACE_CHARS) {
  return truncateText(maskSecrets(value), maxChars);
}

function sanitizeTraceObject(value, depth = 0) {
  if (depth > 4) return "(truncated)";
  if (value === null || typeof value === "undefined") return value;
  if (typeof value === "string") return truncateMasked(value, MAX_TRACE_CHARS);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeTraceObject(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) {
      out[k] = sanitizeTraceObject(v, depth + 1);
    }
    return out;
  }
  return truncateMasked(String(value), MAX_TRACE_CHARS);
}

function extractDebateObservability(messageRows) {
  const llmTraces = [];
  const payloadTraces = [];
  const toolTraces = [];
  const orchestration = [];

  for (const row of messageRows || []) {
    const type = String(row?.type || "");
    if (!type) continue;

    if (type.includes("request")) {
      const promptParts = Array.isArray(row.messages)
        ? row.messages.map((m) => `${m.role || "unknown"}: ${truncateMasked(m.content || "", 520)}`).join("\n\n")
        : "";
      payloadTraces.push({
        ts: row.ts || null,
        round: row.round || null,
        speakerId: row.speakerId || null,
        speakerName: row.speakerName || null,
        type,
        promptExcerpt: truncateMasked(promptParts, 1800)
      });
      orchestration.push({
        ts: row.ts || null,
        round: row.round || null,
        step: "speaker-turn",
        speaker: row.speakerName || row.speakerId || "unknown",
        note: `Prompt issued for ${row.speakerName || row.speakerId || "speaker"}.`
      });
      continue;
    }

    if (type.includes("response")) {
      const usage = extractUsage(row.response);
      llmTraces.push({
        ts: row.ts || null,
        round: row.round || null,
        speakerId: row.speakerId || null,
        speakerName: row.speakerName || null,
        type,
        model: row.response?.model || null,
        usage,
        finishReason: row.response?.choices?.[0]?.finish_reason || null
      });
      payloadTraces.push({
        ts: row.ts || null,
        round: row.round || null,
        speakerId: row.speakerId || null,
        speakerName: row.speakerName || null,
        type,
        responsePreview: truncateMasked(
          row.response?.choices?.[0]?.message?.content ||
            row.response?.output_text ||
            JSON.stringify(sanitizeTraceObject(row.response)),
          1800
        )
      });
      continue;
    }
  }

  return {
    summary: {
      llmCalls: llmTraces.length,
      payloadTraces: payloadTraces.length,
      orchestrationEvents: orchestration.length,
      toolRuns: toolTraces.length
    },
    llmTraces: llmTraces.slice(-200),
    payloadTraces: payloadTraces.slice(-120),
    orchestration: orchestration.slice(-200),
    toolTraces
  };
}

function extractPersonaChatObservability(messages) {
  const llmTraces = [];
  const payloadTraces = [];
  const orchestration = [];
  const toolTraces = [];

  for (const msg of messages || []) {
    const role = String(msg?.role || "");
    if (role === "orchestrator") {
      orchestration.push({
        ts: msg.ts || null,
        turnId: msg.turnId || null,
        selectedSpeakerIds: msg.selectedSpeakerIds || [],
        omittedCount: Number(msg.omittedCount || 0),
        rationale: sanitizeTraceObject(msg.rationale || []),
        note: truncateMasked(msg.content || "", 700)
      });
      continue;
    }
    if (role !== "persona") continue;

    if (msg.toolExecution) {
      toolTraces.push({
        ts: msg.ts || null,
        turnId: msg.turnId || null,
        speakerId: msg.speakerId || null,
        speakerName: msg.displayName || null,
        status: String(msg.toolExecution.status || "unknown"),
        toolId: msg.toolExecution.toolId || msg.toolExecution.requested?.toolId || null,
        requestedUrl:
          msg.toolExecution.requestedUrl ||
          msg.toolExecution.requested?.input?.url ||
          msg.toolExecution.responseMeta?.requestedUrl ||
          null,
        finalUrl: msg.toolExecution.responseMeta?.url || null,
        error: msg.toolExecution.error ? truncateMasked(msg.toolExecution.error, 500) : null
      });
      payloadTraces.push({
        ts: msg.ts || null,
        turnId: msg.turnId || null,
        speakerId: msg.speakerId || null,
        type: "toolExecution",
        payload: sanitizeTraceObject(msg.toolExecution)
      });
    }

    if (msg.usage && typeof msg.usage === "object") {
      const usage = extractUsage({ usage: msg.usage });
      llmTraces.push({
        ts: msg.ts || null,
        turnId: msg.turnId || null,
        speakerId: msg.speakerId || null,
        speakerName: msg.displayName || null,
        type: "persona-response",
        model: msg.model || null,
        usage
      });
    }
  }

  return {
    summary: {
      llmCalls: llmTraces.length,
      payloadTraces: payloadTraces.length,
      orchestrationEvents: orchestration.length,
      toolRuns: toolTraces.length
    },
    llmTraces: llmTraces.slice(-200),
    payloadTraces: payloadTraces.slice(-120),
    orchestration: orchestration.slice(-200),
    toolTraces: toolTraces.slice(-200)
  };
}

function extractSimpleChatObservability(messages) {
  const llmTraces = [];
  const payloadTraces = [];
  const toolTraces = [];

  for (const msg of messages || []) {
    if (msg.role !== "assistant") continue;
    if (msg.usage && typeof msg.usage === "object") {
      llmTraces.push({
        ts: msg.ts || null,
        type: "assistant-response",
        usage: extractUsage({ usage: msg.usage })
      });
    }
    if (msg.image?.id || msg.image?.url) {
      toolTraces.push({
        ts: msg.ts || null,
        type: "openai.generate_image",
        status: "succeeded",
        imageId: msg.image.id || null
      });
    }
    payloadTraces.push({
      ts: msg.ts || null,
      type: "assistant-content",
      responsePreview: truncateMasked(msg.content || "", 900)
    });
  }

  return {
    summary: {
      llmCalls: llmTraces.length,
      payloadTraces: payloadTraces.length,
      orchestrationEvents: 0,
      toolRuns: toolTraces.length
    },
    llmTraces: llmTraces.slice(-200),
    payloadTraces: payloadTraces.slice(-120),
    orchestration: [],
    toolTraces: toolTraces.slice(-200)
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
  const risk = aggregateRiskSignals((session.turns || []).map((t) => t.text));
  const observability = extractDebateObservability(messageRows);

  return {
    debateId,
    kind: "group",
    conversationMode: session?.conversationMode || "debate",
    title: session.topic || debateId,
    topicSummary: truncateText(session.context || session.topic || "", 220),
    participants,
    participantCount: participants.length,
    status: session.status || "unknown",
    createdAt: session.createdAt || null,
    completedAt: session.completedAt || null,
    rounds: session.settings?.rounds || null,
    createdBy: session.createdBy || null,
    createdByUsername: session.createdByUsername || null,
    model,
    outcomes: truncateText(outcome || transcript || "", 360),
    tokenUsage: usageTotals,
    estimatedCostUsd: cost.estimatedCostUsd,
    pricingKnown: cost.pricingKnown,
    responsibleAi: risk,
    observabilitySummary: observability.summary,
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
    if (error.code === "ENOENT") entries = [];
    else throw error;
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
      acc.stoplightGreen += Number(debate.responsibleAi?.stoplights?.green || 0);
      acc.stoplightYellow += Number(debate.responsibleAi?.stoplights?.yellow || 0);
      acc.stoplightRed += Number(debate.responsibleAi?.stoplights?.red || 0);
      acc.sentimentPositive += Number(debate.responsibleAi?.sentiment?.positive || 0);
      acc.sentimentNeutral += Number(debate.responsibleAi?.sentiment?.neutral || 0);
      acc.sentimentNegative += Number(debate.responsibleAi?.sentiment?.negative || 0);
      return acc;
    },
    {
      debates: 0,
      completed: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      stoplightGreen: 0,
      stoplightYellow: 0,
      stoplightRed: 0,
      sentimentPositive: 0,
      sentimentNeutral: 0,
      sentimentNegative: 0
    }
  );
  totals.estimatedCostUsd = Number(totals.estimatedCostUsd.toFixed(6));

  let chatOverview = { chats: [] };
  try {
    chatOverview = await getChatAnalyticsOverview(limit);
  } catch {
    chatOverview = { chats: [] };
  }
  const chats = chatOverview.chats || [];
  totals.chats = chats.length;
  totals.totalConversations = totals.debates + totals.chats;
  totals.chatMessages = chats.reduce((acc, chat) => acc + Number(chat.messageCount || 0), 0);
  totals.scopeRefusals = chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.scopeRefusalCount || 0),
    0
  );
  totals.groundedReplies = chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.groundedReplyCount || 0),
    0
  );
  totals.ungroundedReplies = chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.ungroundedReplyCount || 0),
    0
  );
  totals.groupChatCount = chats.filter((chat) => chat.kind === "group").length;
  totals.simpleChatCount = chats.filter((chat) => chat.kind === "simple").length;
  totals.groupChatModeBreakdown = chats
    .filter((chat) => chat.kind === "group")
    .reduce((acc, chat) => {
      const mode = chat.engagementMode || "chat";
      acc[mode] = Number(acc[mode] || 0) + 1;
      return acc;
    }, {});
  totals.stoplightGreen += chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.stoplights?.green || 0),
    0
  );
  totals.stoplightYellow += chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.stoplights?.yellow || 0),
    0
  );
  totals.stoplightRed += chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.stoplights?.red || 0),
    0
  );
  totals.sentimentPositive += chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.sentiment?.positive || 0),
    0
  );
  totals.sentimentNeutral += chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.sentiment?.neutral || 0),
    0
  );
  totals.sentimentNegative += chats.reduce(
    (acc, chat) => acc + Number(chat.responsibleAi?.sentiment?.negative || 0),
    0
  );

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
  const scopeRefusalCount = messages.filter(
    (m) => m.role === "persona" && String(m.content || "").toLowerCase().includes("outside my defined scope")
  ).length;
  const risk = aggregateRiskSignals(messages.map((m) => m.content));
  const observability = extractPersonaChatObservability(messages);

  return {
    kind: "group",
    conversationMode:
      session?.conversationMode ||
      (session.settings?.engagementMode === "panel"
        ? "panel"
        : session.settings?.engagementMode === "debate-work-order"
          ? "debate-work-order"
          : "group-chat"),
    chatId,
    title: session.title || chatId,
    engagementMode: session.settings?.engagementMode || "chat",
    contextSummary: truncateText(session.context || "", 220),
    participants,
    participantCount: participants.length,
    createdBy: session.createdBy || null,
    createdByUsername: session.createdByUsername || null,
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
    ),
    responsibleAi: {
      ...risk,
      scopeRefusalCount
    },
    observabilitySummary: observability.summary
  };
}

function summarizeSimpleChat({ chatId, session, messages }) {
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const groundedReplyCount = assistantMessages.filter(
    (m) => Array.isArray(m.citations) && m.citations.length > 0
  ).length;
  const ungroundedReplyCount = assistantMessages.filter(
    (m) => !Array.isArray(m.citations) || !m.citations.length
  ).length;
  const usageTotals = assistantMessages.reduce(
    (acc, row) => {
      const usage = extractUsage({ usage: row.usage || {} });
      acc.promptTokens += usage.promptTokens;
      acc.completionTokens += usage.completionTokens;
      acc.totalTokens += usage.totalTokens;
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
  const model = session?.settings?.model || "unknown";
  const cost = estimateCostUsd(model, usageTotals);
  const risk = aggregateRiskSignals(messages.map((m) => m.content));
  const observability = extractSimpleChatObservability(messages);

  return {
    kind: "simple",
    conversationMode: session?.conversationMode || "simple",
    chatId,
    title: session.title || chatId,
    contextSummary: truncateText(session.context || "", 220),
    participants: ["User", "Assistant"],
    participantCount: 2,
    createdBy: session.createdBy || null,
    createdByUsername: session.createdByUsername || null,
    createdAt: session.createdAt || null,
    updatedAt: session.updatedAt || null,
    lastActivityAt: session.updatedAt || session.createdAt || null,
    model,
    turns: userMessages.length,
    messageCount: messages.length,
    userMessageCount: userMessages.length,
    personaMessageCount: assistantMessages.length,
    tokenUsage: usageTotals,
    estimatedCostUsd: cost.estimatedCostUsd,
    pricingKnown: cost.pricingKnown,
    summary: truncateText(assistantMessages.slice(-1).map((m) => m.content).join(" ") || "No assistant replies yet.", 360),
    responsibleAi: {
      ...risk,
      groundedReplyCount,
      ungroundedReplyCount
    },
    observabilitySummary: observability.summary
  };
}

function supportChatId(entry, index) {
  if (entry?.chatId) return String(entry.chatId);
  const ts = String(entry?.ts || "unknown").replace(/[^0-9]/g, "").slice(0, 14) || "unknown";
  const user = String(entry?.username || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
  return `support-${ts}-${user}-${index + 1}`;
}

function summarizeSupportChat({ chatId, entry }) {
  const userText = String(entry?.message || "");
  const replyText = String(entry?.reply || "");
  const citations = Array.isArray(entry?.citations) ? entry.citations : [];
  const risk = aggregateRiskSignals([userText, replyText]);
  const groundedReplyCount = citations.length ? 1 : 0;
  const ungroundedReplyCount = citations.length ? 0 : 1;

  return {
    kind: "support",
    conversationMode: "support",
    chatId,
    title: "Support Concierge",
    engagementMode: "support-chat",
    contextSummary: truncateText(userText, 220),
    participants: ["User", "Support Concierge"],
    participantCount: 2,
    createdBy: entry?.userId || null,
    createdByUsername: entry?.username || "unknown",
    createdAt: entry?.ts || null,
    updatedAt: entry?.ts || null,
    lastActivityAt: entry?.ts || null,
    model: "gpt-4.1-mini",
    turns: 1,
    messageCount: 2,
    userMessageCount: 1,
    personaMessageCount: 1,
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    estimatedCostUsd: 0,
    pricingKnown: false,
    summary: truncateText(replyText || "No support reply.", 360),
    responsibleAi: {
      ...risk,
      groundedReplyCount,
      ungroundedReplyCount
    },
    citations,
    observabilitySummary: {
      llmCalls: 1,
      payloadTraces: 1,
      orchestrationEvents: 0,
      toolRuns: 0
    }
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
  const observability = extractPersonaChatObservability(messages);
  return {
    ...summary,
    session,
    messages,
    observability
  };
}

export async function getSimpleChatAnalyticsOverview(limit = 100) {
  let entries = [];
  try {
    entries = await fs.readdir(SIMPLE_CHATS_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { chats: [] };
    throw error;
  }

  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).slice(0, limit);
  const chats = [];
  for (const chatId of folders) {
    try {
      const dir = path.join(SIMPLE_CHATS_DIR, chatId);
      const session = await readJsonFile(path.join(dir, "session.json"));
      const messages = await readJsonl(path.join(dir, "messages.jsonl"));
      chats.push(summarizeSimpleChat({ chatId, session, messages }));
    } catch {
      // skip malformed chat directories
    }
  }
  chats.sort((a, b) => String(b.lastActivityAt || "").localeCompare(String(a.lastActivityAt || "")));
  return { chats };
}

export async function getSimpleChatAnalyticsDetail(chatId) {
  const dir = path.join(SIMPLE_CHATS_DIR, chatId);
  const session = await readJsonFile(path.join(dir, "session.json"));
  const messages = await readJsonl(path.join(dir, "messages.jsonl"));
  const summary = summarizeSimpleChat({ chatId, session, messages });
  const observability = extractSimpleChatObservability(messages);
  return {
    ...summary,
    session,
    messages,
    observability
  };
}

export async function getSupportChatAnalyticsOverview(limit = 100) {
  const filePath = path.join(SUPPORT_DIR, "messages.jsonl");
  const rows = await readJsonl(filePath);
  const scoped = rows.slice(-Math.max(1, Number(limit) || 100));
  const chats = scoped.map((entry, idx) =>
    summarizeSupportChat({
      chatId: supportChatId(entry, idx),
      entry
    })
  );
  chats.sort((a, b) => String(b.lastActivityAt || "").localeCompare(String(a.lastActivityAt || "")));
  return { chats };
}

export async function getSupportChatAnalyticsDetail(chatId) {
  const filePath = path.join(SUPPORT_DIR, "messages.jsonl");
  const rows = await readJsonl(filePath);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const id = supportChatId(row, i);
    if (id !== chatId) continue;
    const summary = summarizeSupportChat({ chatId: id, entry: row });
    return {
      ...summary,
      session: {
        chatId: id,
        title: "Support Concierge",
        createdBy: row?.userId || null,
        createdByUsername: row?.username || "unknown",
        createdAt: row?.ts || null,
        updatedAt: row?.ts || null
      },
      messages: [
        { role: "user", content: String(row?.message || ""), ts: row?.ts || null },
        { role: "assistant", content: String(row?.reply || ""), ts: row?.ts || null, citations: row?.citations || [] }
      ],
      observability: {
        summary: {
          llmCalls: 1,
          payloadTraces: 1,
          orchestrationEvents: 0,
          toolRuns: 0
        },
        llmTraces: [
          {
            ts: row?.ts || null,
            type: "support-response",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
          }
        ],
        payloadTraces: [
          {
            ts: row?.ts || null,
            type: "support-content",
            responsePreview: truncateMasked(String(row?.reply || ""), 900)
          }
        ],
        orchestration: [],
        toolTraces: []
      }
    };
  }
  const err = new Error(`Support chat '${chatId}' not found.`);
  err.code = "ENOENT";
  throw err;
}

export async function getChatAnalyticsOverview(limit = 100) {
  const [group, simple, support] = await Promise.all([
    getPersonaChatAnalyticsOverview(limit),
    getSimpleChatAnalyticsOverview(limit),
    getSupportChatAnalyticsOverview(limit)
  ]);
  const chats = [...(group.chats || []), ...(simple.chats || []), ...(support.chats || [])];
  chats.sort((a, b) =>
    String(b.lastActivityAt || b.updatedAt || b.createdAt || "").localeCompare(
      String(a.lastActivityAt || a.updatedAt || a.createdAt || "")
    )
  );
  return { chats };
}

export async function getChatAnalyticsDetail(chatId) {
  try {
    return await getPersonaChatAnalyticsDetail(chatId);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    return await getSupportChatAnalyticsDetail(chatId);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return getSimpleChatAnalyticsDetail(chatId);
}

export async function getDebateAnalyticsDetail(debateId) {
  const dir = path.join(DEBATES_DIR, debateId);
  const session = await readJsonFile(path.join(dir, "session.json"));
  const transcript = await fs.readFile(path.join(dir, "transcript.md"), "utf8").catch(() => "");
  const messageRows = await readJsonl(path.join(dir, "messages.jsonl"));

  const summary = summarizeDebate({ debateId, session, transcript, messageRows });
  const observability = extractDebateObservability(messageRows);
  return {
    ...summary,
    transcript,
    rounds: buildDebateDrilldown(session),
    observability
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
      if (persona?.isHidden) continue;
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
