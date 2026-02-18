import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { SETTINGS_DIR } from "./storage.js";
import { safeJsonParse } from "./utils.js";

const THEME_PATH = path.join(SETTINGS_DIR, "theme.json");

const DEFAULT_THEME = {
  variables: {
    "--bg": "#f7f4ee",
    "--bg-soft": "#fffdf8",
    "--ink": "#1f2933",
    "--ink-soft": "#4b5563",
    "--line": "#d9d7d1",
    "--card": "#fffefb",
    "--card-strong": "#f7f4eb",
    "--accent": "#0f766e",
    "--accent-strong": "#115e59",
    "--accent-soft": "#e7faf5",
    "--warning": "#d97706",
    "--info": "#0f5d6d",
    "--shadow": "0 14px 36px rgba(23, 32, 43, 0.09)",
    "--radius": "14px",
    "--hero-start": "#d7f4ef",
    "--hero-mid": "#ffefcc",
    "--hero-end": "#f2f4f8"
  },
  typography: {
    body: "\"Work Sans\", \"Avenir Next\", \"Segoe UI\", sans-serif",
    display: "\"Fraunces\", Georgia, serif"
  }
};

function normalizeTheme(candidate) {
  if (!candidate || typeof candidate !== "object") return structuredClone(DEFAULT_THEME);
  const variables = candidate.variables && typeof candidate.variables === "object" ? candidate.variables : {};
  const typography = candidate.typography && typeof candidate.typography === "object" ? candidate.typography : {};
  return {
    variables: {
      ...DEFAULT_THEME.variables,
      ...variables
    },
    typography: {
      ...DEFAULT_THEME.typography,
      ...typography
    }
  };
}

export async function getThemeSettings() {
  try {
    const raw = await fsp.readFile(THEME_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return structuredClone(DEFAULT_THEME);
    return normalizeTheme(parsed.value);
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(DEFAULT_THEME);
    throw error;
  }
}

export function getThemeSettingsSync() {
  try {
    if (!fs.existsSync(THEME_PATH)) return structuredClone(DEFAULT_THEME);
    const raw = fs.readFileSync(THEME_PATH, "utf8");
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return structuredClone(DEFAULT_THEME);
    return normalizeTheme(parsed.value);
  } catch {
    return structuredClone(DEFAULT_THEME);
  }
}

export async function saveThemeSettings(theme) {
  const normalized = normalizeTheme(theme);
  await fsp.mkdir(SETTINGS_DIR, { recursive: true });
  await fsp.writeFile(THEME_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
