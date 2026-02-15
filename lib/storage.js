import fs from "fs/promises";
import path from "path";
import { safeJsonParse } from "./utils.js";

const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const PERSONAS_DIR = path.join(DATA_DIR, "personas");
export const DEBATES_DIR = path.join(DATA_DIR, "debates");

export async function ensureDataDirs() {
  await fs.mkdir(PERSONAS_DIR, { recursive: true });
  await fs.mkdir(DEBATES_DIR, { recursive: true });
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

export function personaToMarkdown(persona) {
  const bias = Array.isArray(persona.biasValues)
    ? persona.biasValues.join(", ")
    : String(persona.biasValues || "");
  const quirks = (persona.speakingStyle?.quirks || []).join(", ");
  const tags = (persona.expertiseTags || []).join(", ");

  return `# ${persona.displayName}\n\n- id: ${persona.id}\n- role: ${persona.role || ""}\n- description: ${persona.description}\n- tone: ${persona.speakingStyle?.tone || ""}\n- verbosity: ${persona.speakingStyle?.verbosity || ""}\n- quirks: ${quirks}\n- expertiseTags: ${tags}\n- bias/values: ${bias}\n\n## Debate Behavior\n${persona.debateBehavior || ""}\n\n## System Prompt\n${persona.systemPrompt}\n`;
}

export async function listPersonas() {
  await ensureDataDirs();
  const files = await fs.readdir(PERSONAS_DIR);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const personas = [];
  const errors = [];

  for (const file of jsonFiles) {
    const fullPath = path.join(PERSONAS_DIR, file);
    try {
      const persona = await readJsonFile(fullPath);
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

export async function createDebateFiles(debateId, session) {
  const dir = debatePath(debateId);
  await fs.mkdir(dir, { recursive: true });
  await writeJsonFile(path.join(dir, "session.json"), session);
  await writeTextFile(path.join(dir, "transcript.md"), "# Debate Transcript\n\n");
  await fs.writeFile(path.join(dir, "messages.jsonl"), "", "utf8");
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

export async function listDebates() {
  await ensureDataDirs();
  const entries = await fs.readdir(DEBATES_DIR, { withFileTypes: true });
  const debates = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionPath = path.join(DEBATES_DIR, entry.name, "session.json");
    try {
      const session = await readJsonFile(sessionPath);
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
