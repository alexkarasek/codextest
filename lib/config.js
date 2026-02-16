import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "settings.local.json");

function readSettingsFromDisk() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadSettings() {
  return readSettingsFromDisk();
}

export function getSettings() {
  return readSettingsFromDisk();
}

export function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY || getSettings().openaiApiKey || "";
}

export function getLlmProvider() {
  const provider = (process.env.LLM_PROVIDER || getSettings().llmProvider || "openai").toLowerCase();
  return provider === "azure" ? "azure" : "openai";
}

export function getAzureOpenAIApiKey() {
  return process.env.AZURE_OPENAI_API_KEY || getSettings().azureOpenAIApiKey || "";
}

export function getAzureOpenAIEndpoint() {
  return process.env.AZURE_OPENAI_ENDPOINT || getSettings().azureOpenAIEndpoint || "";
}

export function getAzureOpenAIDeployment() {
  return process.env.AZURE_OPENAI_DEPLOYMENT || getSettings().azureOpenAIDeployment || "";
}

export function getAzureOpenAIApiVersion() {
  return process.env.AZURE_OPENAI_API_VERSION || getSettings().azureOpenAIApiVersion || "2024-10-21";
}

export function isLlmConfigured() {
  if (getLlmProvider() === "azure") {
    return Boolean(getAzureOpenAIApiKey() && getAzureOpenAIEndpoint());
  }
  return Boolean(getOpenAIApiKey());
}

export function getNewsApiKey() {
  return process.env.NEWS_API_KEY || getSettings().newsApiKey || "";
}

export function getNewsProvider() {
  return process.env.NEWS_PROVIDER || getSettings().newsProvider || "google";
}

export function getServerPort() {
  const candidate = process.env.PORT || getSettings().port;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

export function getSettingsPath() {
  return SETTINGS_PATH;
}
