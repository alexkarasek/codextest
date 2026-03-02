import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";
import { safeJsonParse } from "./utils.js";
import { foundryApplicationsSchema } from "./validators.js";

const FOUNDRY_APPS_PATH = path.join(SETTINGS_DIR, "foundry-applications.json");

function normalizeFoundryApplications(candidate) {
  const parsed = foundryApplicationsSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, data: [], error: parsed.error };
  }
  const normalized = parsed.data.map((row) => {
    const id = String(row.id || "").trim();
    const applicationName = String(row.applicationName || "").trim();
    const displayName = String(row.displayName || applicationName).trim();
    const description = String(row.description || "").trim();
    const tags = Array.isArray(row.tags)
      ? row.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];
    return {
      id,
      applicationName,
      displayName,
      description,
      tags,
      routesModels: Boolean(row.routesModels),
      version: String(row.version || "").trim()
    };
  });
  return { ok: true, data: normalized, error: null };
}

export async function getFoundryApplications() {
  try {
    const raw = await fsp.readFile(FOUNDRY_APPS_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return [];
    const normalized = normalizeFoundryApplications(parsed.value);
    return normalized.ok ? normalized.data : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function getFoundryApplicationsOverrideSync() {
  try {
    if (!fs.existsSync(FOUNDRY_APPS_PATH)) return { found: false, value: [] };
    const raw = fs.readFileSync(FOUNDRY_APPS_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return { found: true, value: [] };
    const normalized = normalizeFoundryApplications(parsed.value);
    return { found: true, value: normalized.ok ? normalized.data : [] };
  } catch {
    return { found: true, value: [] };
  }
}

export async function saveFoundryApplications(applications) {
  const normalized = normalizeFoundryApplications(applications);
  if (!normalized.ok) {
    const error = new Error("Invalid Foundry applications payload.");
    error.code = "VALIDATION_ERROR";
    error.details = normalized.error;
    throw error;
  }
  await fsp.mkdir(SETTINGS_DIR, { recursive: true });
  await fsp.writeFile(FOUNDRY_APPS_PATH, JSON.stringify(normalized.data, null, 2), "utf8");
  return normalized.data;
}
