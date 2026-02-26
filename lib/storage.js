import fs from "fs/promises";
import path from "path";
import { safeJsonParse } from "./utils.js";

const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const PERSONAS_DIR = path.join(DATA_DIR, "personas");
export const DEBATES_DIR = path.join(DATA_DIR, "debates");
export const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");
export const PERSONA_CHATS_DIR = path.join(DATA_DIR, "persona-chats");
export const SIMPLE_CHATS_DIR = path.join(DATA_DIR, "simple-chats");
export const SETTINGS_DIR = path.join(DATA_DIR, "settings");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const SUPPORT_DIR = path.join(DATA_DIR, "support");
export const EVENTS_DIR = path.join(DATA_DIR, "events");
export const RUNS_DIR = path.join(DATA_DIR, "runs");
export const RUNS_META_DIR = path.join(RUNS_DIR, "meta");
export const RUNS_ARTIFACTS_DIR = path.join(RUNS_DIR, "artifacts");
export const AGENTIC_DIR = path.join(DATA_DIR, "agentic");
export const AGENTIC_TASKS_DIR = path.join(AGENTIC_DIR, "tasks");
export const AGENTIC_APPROVALS_DIR = path.join(AGENTIC_DIR, "approvals");
export const AGENTIC_JOBS_DIR = path.join(AGENTIC_DIR, "jobs");
export const AGENTIC_WATCHERS_DIR = path.join(AGENTIC_DIR, "watchers");
export const DELETION_AUDIT_PATH = path.join(SETTINGS_DIR, "deletion-audit.jsonl");

export async function ensureDataDirs() {
  await fs.mkdir(PERSONAS_DIR, { recursive: true });
  await fs.mkdir(DEBATES_DIR, { recursive: true });
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  await fs.mkdir(PERSONA_CHATS_DIR, { recursive: true });
  await fs.mkdir(SIMPLE_CHATS_DIR, { recursive: true });
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(SUPPORT_DIR, { recursive: true });
  await fs.mkdir(EVENTS_DIR, { recursive: true });
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.mkdir(RUNS_META_DIR, { recursive: true });
  await fs.mkdir(RUNS_ARTIFACTS_DIR, { recursive: true });
  await fs.mkdir(AGENTIC_DIR, { recursive: true });
  await fs.mkdir(AGENTIC_TASKS_DIR, { recursive: true });
  await fs.mkdir(AGENTIC_APPROVALS_DIR, { recursive: true });
  await fs.mkdir(AGENTIC_JOBS_DIR, { recursive: true });
  await fs.mkdir(AGENTIC_WATCHERS_DIR, { recursive: true });
}

export function personaJsonPath(id) {
  return path.join(PERSONAS_DIR, `${id}.json`);
}

export function personaMdPath(id) {
  return path.join(PERSONAS_DIR, `${id}.md`);
}

export function debatePath(debateId) {
  return path.join(DEBATES_DIR, debateId);
}

export function knowledgePackPath(id) {
  return path.join(KNOWLEDGE_DIR, `${id}.json`);
}

export function personaChatPath(chatId) {
  return path.join(PERSONA_CHATS_DIR, chatId);
}

export function simpleChatPath(chatId) {
  return path.join(SIMPLE_CHATS_DIR, chatId);
}

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) {
    const err = new Error(`Invalid JSON in ${path.basename(filePath)}`);
    err.code = "INVALID_JSON";
    throw err;
  }
  return parsed.value;
}

export async function writeJsonFile(filePath, value) {
  const content = JSON.stringify(value, null, 2);
  await fs.writeFile(filePath, content, "utf8");
}

export async function writeTextFile(filePath, value) {
  await fs.writeFile(filePath, value, "utf8");
}

export async function appendJsonl(filePath, value) {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function appendDeletionAudit(entry) {
  await ensureDataDirs();
  await appendJsonl(DELETION_AUDIT_PATH, {
    ts: new Date().toISOString(),
    ...entry
  });
}

export function personaToMarkdown(persona) {
  const bias = Array.isArray(persona.biasValues)
    ? persona.biasValues.join(", ")
    : String(persona.biasValues || "");
  const quirks = (persona.speakingStyle?.quirks || []).join(", ");
  const tags = (persona.expertiseTags || []).join(", ");
  const knowledgePackIds = (persona.knowledgePackIds || []).join(", ");
  const toolIds = (persona.toolIds || []).join(", ");

  return `# ${persona.displayName}\n\n- id: ${persona.id}\n- avatar: ${persona.avatar || ""}\n- role: ${persona.role || ""}\n- description: ${persona.description}\n- tone: ${persona.speakingStyle?.tone || ""}\n- verbosity: ${persona.speakingStyle?.verbosity || ""}\n- quirks: ${quirks}\n- expertiseTags: ${tags}\n- bias/values: ${bias}\n- toolIds: ${toolIds}\n- knowledgePackIds: ${knowledgePackIds}\n\n## Debate Behavior\n${persona.debateBehavior || ""}\n\n## System Prompt\n${persona.systemPrompt}\n`;
}

export async function listPersonas({ includeHidden = false, includeArchived = false } = {}) {
  await ensureDataDirs();
  const files = await fs.readdir(PERSONAS_DIR);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const personas = [];
  const errors = [];

  for (const file of jsonFiles) {
    const fullPath = path.join(PERSONAS_DIR, file);
    try {
      const persona = await readJsonFile(fullPath);
      if (!includeHidden && persona?.isHidden) continue;
      if (!includeArchived && persona?.isArchived) continue;
      personas.push(persona);
    } catch (error) {
      errors.push({
        file,
        message: error.message
      });
    }
  }

  personas.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  return { personas, errors };
}

export async function getPersona(id) {
  const filePath = personaJsonPath(id);
  return readJsonFile(filePath);
}

export async function savePersona(persona, { withMarkdown = true } = {}) {
  await ensureDataDirs();
  await writeJsonFile(personaJsonPath(persona.id), persona);
  if (withMarkdown) {
    await writeTextFile(personaMdPath(persona.id), personaToMarkdown(persona));
  }
  return persona;
}

export async function deletePersona(id) {
  const jsonPath = personaJsonPath(id);
  const mdPath = personaMdPath(id);
  await fs.rm(jsonPath, { force: true });
  await fs.rm(mdPath, { force: true });
}

export async function archivePersona(id, { actor = null, reason = "" } = {}) {
  const existing = await getPersona(id);
  const now = new Date().toISOString();
  const next = {
    ...existing,
    isArchived: true,
    deletedAt: now,
    deletedBy: actor?.id || null,
    deletedByUsername: actor?.username || null,
    deleteMode: "archive",
    deleteReason: String(reason || ""),
    updatedAt: now
  };
  await savePersona(next, { withMarkdown: true });
  await appendDeletionAudit({
    entityType: "persona",
    entityId: id,
    mode: "archive",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
  return next;
}

export async function hardDeletePersona(id, { actor = null, reason = "" } = {}) {
  await deletePersona(id);
  await appendDeletionAudit({
    entityType: "persona",
    entityId: id,
    mode: "hard",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
}

export async function createDebateFiles(debateId, session) {
  const dir = debatePath(debateId);
  await fs.mkdir(dir, { recursive: true });
  await writeJsonFile(path.join(dir, "session.json"), session);
  await writeTextFile(path.join(dir, "transcript.md"), "# Debate Transcript\n\n");
  await fs.writeFile(path.join(dir, "messages.jsonl"), "", "utf8");
  await fs.writeFile(path.join(dir, "chat.jsonl"), "", "utf8");
  return dir;
}

export async function updateDebateSession(debateId, updater) {
  const dir = debatePath(debateId);
  const sessionPath = path.join(dir, "session.json");
  const current = await readJsonFile(sessionPath);
  const next = typeof updater === "function" ? updater(current) : updater;
  await writeJsonFile(sessionPath, next);
  return next;
}

export async function appendTranscript(debateId, markdownChunk) {
  const filePath = path.join(debatePath(debateId), "transcript.md");
  await fs.appendFile(filePath, markdownChunk, "utf8");
}

export async function appendDebateLog(debateId, payload) {
  const filePath = path.join(debatePath(debateId), "messages.jsonl");
  await appendJsonl(filePath, payload);
}

export async function listDebates({ includeArchived = false } = {}) {
  await ensureDataDirs();
  const entries = await fs.readdir(DEBATES_DIR, { withFileTypes: true });
  const debates = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionPath = path.join(DEBATES_DIR, entry.name, "session.json");
    try {
      const session = await readJsonFile(sessionPath);
      if (!includeArchived && session?.isArchived) continue;
      debates.push({
        debateId: entry.name,
        topic: session.topic,
        createdAt: session.createdAt,
        status: session.status,
        rounds: session.settings?.rounds,
        participants: (session.personas || []).map((p) => p.displayName)
      });
    } catch {
      // Skip malformed debate folders.
    }
  }

  debates.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return debates;
}

export async function getDebate(debateId) {
  const dir = debatePath(debateId);
  const session = await readJsonFile(path.join(dir, "session.json"));
  const transcript = await fs.readFile(path.join(dir, "transcript.md"), "utf8");
  return { session, transcript, dir };
}

export async function archiveDebate(debateId, { actor = null, reason = "" } = {}) {
  const next = await updateDebateSession(debateId, (current) => ({
    ...current,
    isArchived: true,
    deletedAt: new Date().toISOString(),
    deletedBy: actor?.id || null,
    deletedByUsername: actor?.username || null,
    deleteMode: "archive",
    deleteReason: String(reason || "")
  }));
  await appendDeletionAudit({
    entityType: "debate",
    entityId: debateId,
    mode: "archive",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
  return next;
}

export async function hardDeleteDebate(debateId, { actor = null, reason = "" } = {}) {
  await fs.rm(debatePath(debateId), { recursive: true, force: true });
  await appendDeletionAudit({
    entityType: "debate",
    entityId: debateId,
    mode: "hard",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
}

export async function listKnowledgePacks({ includeHidden = false, includeArchived = false } = {}) {
  await ensureDataDirs();
  const files = await fs.readdir(KNOWLEDGE_DIR).catch(() => []);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const packs = [];
  const errors = [];

  for (const file of jsonFiles) {
    const fullPath = path.join(KNOWLEDGE_DIR, file);
    try {
      const pack = await readJsonFile(fullPath);
      if (!includeHidden && pack?.isHidden) continue;
      if (!includeArchived && pack?.isArchived) continue;
      packs.push(pack);
    } catch (error) {
      errors.push({ file, message: error.message });
    }
  }

  packs.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  return { packs, errors };
}

export async function getKnowledgePack(id) {
  return readJsonFile(knowledgePackPath(id));
}

export async function saveKnowledgePack(pack) {
  await ensureDataDirs();
  await writeJsonFile(knowledgePackPath(pack.id), pack);
  return pack;
}

export async function archiveKnowledgePack(id, { actor = null, reason = "" } = {}) {
  const existing = await getKnowledgePack(id);
  const now = new Date().toISOString();
  const next = {
    ...existing,
    isArchived: true,
    deletedAt: now,
    deletedBy: actor?.id || null,
    deletedByUsername: actor?.username || null,
    deleteMode: "archive",
    deleteReason: String(reason || ""),
    updatedAt: now
  };
  await saveKnowledgePack(next);
  await appendDeletionAudit({
    entityType: "knowledge-pack",
    entityId: id,
    mode: "archive",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
  return next;
}

export async function hardDeleteKnowledgePack(id, { actor = null, reason = "" } = {}) {
  await fs.rm(knowledgePackPath(id), { force: true });
  await appendDeletionAudit({
    entityType: "knowledge-pack",
    entityId: id,
    mode: "hard",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
}

export async function appendDebateChat(debateId, payload) {
  const filePath = path.join(debatePath(debateId), "chat.jsonl");
  await appendJsonl(filePath, payload);
}

export async function listDebateChat(debateId) {
  const filePath = path.join(debatePath(debateId), "chat.jsonl");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter((row) => row.ok && row.value)
      .map((row) => row.value);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function createPersonaChatFiles(chatId, session) {
  const dir = personaChatPath(chatId);
  await fs.mkdir(dir, { recursive: true });
  await writeJsonFile(path.join(dir, "session.json"), session);
  await fs.writeFile(path.join(dir, "messages.jsonl"), "", "utf8");
  return dir;
}

export async function getPersonaChat(chatId) {
  const dir = personaChatPath(chatId);
  const session = await readJsonFile(path.join(dir, "session.json"));
  return { session, dir };
}

export async function updatePersonaChatSession(chatId, updater) {
  const dir = personaChatPath(chatId);
  const sessionPath = path.join(dir, "session.json");
  const current = await readJsonFile(sessionPath);
  const next = typeof updater === "function" ? updater(current) : updater;
  await writeJsonFile(sessionPath, next);
  return next;
}

export async function appendPersonaChatMessage(chatId, payload) {
  const filePath = path.join(personaChatPath(chatId), "messages.jsonl");
  await appendJsonl(filePath, payload);
}

export async function listPersonaChatMessages(chatId) {
  const filePath = path.join(personaChatPath(chatId), "messages.jsonl");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter((row) => row.ok && row.value)
      .map((row) => row.value);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function listPersonaChats({ includeHidden = false } = {}) {
  await ensureDataDirs();
  const entries = await fs.readdir(PERSONA_CHATS_DIR, { withFileTypes: true });
  const chats = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionPath = path.join(PERSONA_CHATS_DIR, entry.name, "session.json");
    try {
      const session = await readJsonFile(sessionPath);
      if (!includeHidden && session?.isHidden) continue;
      if (session?.isArchived) continue;
      chats.push({
        chatId: entry.name,
        title: session.title || session.topic || "Persona Chat",
        createdAt: session.createdAt,
        participants: (session.personas || []).map((p) => p.displayName),
        messageCount: session.messageCount || 0,
        engagementMode: session.settings?.engagementMode || "chat",
        governanceAdmin: Boolean(session.governanceAdmin),
        isHidden: Boolean(session.isHidden)
      });
    } catch {
      // Skip malformed chat folders.
    }
  }

  chats.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return chats;
}

export async function createSimpleChatFiles(chatId, session) {
  const dir = simpleChatPath(chatId);
  await fs.mkdir(dir, { recursive: true });
  await writeJsonFile(path.join(dir, "session.json"), session);
  await fs.writeFile(path.join(dir, "messages.jsonl"), "", "utf8");
  return dir;
}

export async function getSimpleChat(chatId) {
  const dir = simpleChatPath(chatId);
  const session = await readJsonFile(path.join(dir, "session.json"));
  return { session, dir };
}

export async function updateSimpleChatSession(chatId, updater) {
  const dir = simpleChatPath(chatId);
  const sessionPath = path.join(dir, "session.json");
  const current = await readJsonFile(sessionPath);
  const next = typeof updater === "function" ? updater(current) : updater;
  await writeJsonFile(sessionPath, next);
  return next;
}

export async function appendSimpleChatMessage(chatId, payload) {
  const filePath = path.join(simpleChatPath(chatId), "messages.jsonl");
  await appendJsonl(filePath, payload);
}

export async function listSimpleChatMessages(chatId) {
  const filePath = path.join(simpleChatPath(chatId), "messages.jsonl");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter((row) => row.ok && row.value)
      .map((row) => row.value);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function listSimpleChats() {
  await ensureDataDirs();
  const entries = await fs.readdir(SIMPLE_CHATS_DIR, { withFileTypes: true });
  const chats = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionPath = path.join(SIMPLE_CHATS_DIR, entry.name, "session.json");
    try {
      const session = await readJsonFile(sessionPath);
      if (session?.isArchived) continue;
      chats.push({
        chatId: entry.name,
        title: session.title || "Simple Chat",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        model: session.settings?.model || "unknown",
        messageCount: session.messageCount || 0,
        knowledgePackIds: session.knowledgePackIds || []
      });
    } catch {
      // Skip malformed chat folders.
    }
  }

  chats.sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
  );
  return chats;
}

export async function archivePersonaChat(chatId, { actor = null, reason = "" } = {}) {
  const next = await updatePersonaChatSession(chatId, (current) => ({
    ...current,
    isArchived: true,
    deletedAt: new Date().toISOString(),
    deletedBy: actor?.id || null,
    deletedByUsername: actor?.username || null,
    deleteMode: "archive",
    deleteReason: String(reason || "")
  }));
  await appendDeletionAudit({
    entityType: "persona-chat",
    entityId: chatId,
    mode: "archive",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
  return next;
}

export async function hardDeletePersonaChat(chatId, { actor = null, reason = "" } = {}) {
  await fs.rm(personaChatPath(chatId), { recursive: true, force: true });
  await appendDeletionAudit({
    entityType: "persona-chat",
    entityId: chatId,
    mode: "hard",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
}

export async function archiveSimpleChat(chatId, { actor = null, reason = "" } = {}) {
  const next = await updateSimpleChatSession(chatId, (current) => ({
    ...current,
    isArchived: true,
    deletedAt: new Date().toISOString(),
    deletedBy: actor?.id || null,
    deletedByUsername: actor?.username || null,
    deleteMode: "archive",
    deleteReason: String(reason || "")
  }));
  await appendDeletionAudit({
    entityType: "simple-chat",
    entityId: chatId,
    mode: "archive",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
  return next;
}

export async function hardDeleteSimpleChat(chatId, { actor = null, reason = "" } = {}) {
  await fs.rm(simpleChatPath(chatId), { recursive: true, force: true });
  await appendDeletionAudit({
    entityType: "simple-chat",
    entityId: chatId,
    mode: "hard",
    actorId: actor?.id || null,
    actorUsername: actor?.username || null,
    reason: String(reason || "")
  });
}
