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

function getAzureInferenceSettings() {
  const settings = getSettings();
  const block = settings.azureInference;
  return block && typeof block === "object" ? block : {};
}

function getModelRoutingSettings() {
  const settings = getSettings();
  const block = settings.modelRouting;
  return block && typeof block === "object" ? block : {};
}

function parseJsonObject(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function resolveMappedValue(map, key) {
  if (!map || typeof map !== "object") return "";
  const direct = String(map[key] || "").trim();
  if (direct) return direct;
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized) return "";
  const matchKey = Object.keys(map).find((entry) => String(entry || "").trim().toLowerCase() === normalized);
  if (!matchKey) return "";
  return String(map[matchKey] || "").trim();
}

export function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY || getSettings().openaiApiKey || "";
}

export function getLlmProvider() {
  const provider = (process.env.LLM_PROVIDER || getSettings().llmProvider || "openai").toLowerCase();
  return provider === "azure" ? "azure" : "openai";
}

export function getLlmProviderForModel(model = "") {
  const envMap = parseJsonObject(process.env.LLM_MODEL_ROUTING_JSON || "");
  const settingsMap = getModelRoutingSettings();
  const modelKey = String(model || "").trim();
  const mapped = resolveMappedValue(envMap, modelKey) || resolveMappedValue(settingsMap, modelKey);
  if (mapped) {
    const normalized = String(mapped).trim().toLowerCase();
    return normalized === "azure" ? "azure" : "openai";
  }
  return getLlmProvider();
}

export function getAzureOpenAIApiKey() {
  const azure = getAzureInferenceSettings();
  return process.env.AZURE_OPENAI_API_KEY || azure.apiKey || getSettings().azureOpenAIApiKey || "";
}

export function getAzureOpenAIEndpoint() {
  const azure = getAzureInferenceSettings();
  return process.env.AZURE_OPENAI_ENDPOINT || azure.endpoint || getSettings().azureOpenAIEndpoint || "";
}

export function getAzureOpenAIDeployment(model = "") {
  const azure = getAzureInferenceSettings();
  const envMap = parseJsonObject(process.env.AZURE_OPENAI_DEPLOYMENTS_JSON || "");
  const settingsMap = azure.deployments && typeof azure.deployments === "object" ? azure.deployments : null;
  const modelKey = String(model || "").trim();

  if (process.env.AZURE_OPENAI_DEPLOYMENT) {
    return String(process.env.AZURE_OPENAI_DEPLOYMENT || "").trim();
  }

  const envMapped = resolveMappedValue(envMap, modelKey) || resolveMappedValue(envMap, "default");
  if (envMapped) return envMapped;

  const settingsMapped = resolveMappedValue(settingsMap, modelKey) || resolveMappedValue(settingsMap, "default");
  if (settingsMapped) return settingsMapped;

  const nestedDefault = String(azure.defaultDeployment || "").trim();
  if (nestedDefault) return nestedDefault;

  return String(getSettings().azureOpenAIDeployment || "").trim();
}

export function getAzureOpenAIApiVersion() {
  const azure = getAzureInferenceSettings();
  return process.env.AZURE_OPENAI_API_VERSION || azure.apiVersion || getSettings().azureOpenAIApiVersion || "2024-10-21";
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

export function isFoundryEnabled() {
  const settings = getSettings();
  const foundry = settings.foundry && typeof settings.foundry === "object" ? settings.foundry : {};
  return parseBoolean(process.env.FOUNDRY_ENABLED, parseBoolean(foundry.enabled, parseBoolean(settings.foundryEnabled, false)));
}

export function getFoundryProjectEndpoint() {
  const settings = getSettings();
  const foundry = settings.foundry && typeof settings.foundry === "object" ? settings.foundry : {};
  return process.env.FOUNDRY_PROJECT_ENDPOINT || foundry.projectEndpoint || settings.foundryProjectEndpoint || "";
}

export function getFoundryApiKey() {
  const settings = getSettings();
  const foundry = settings.foundry && typeof settings.foundry === "object" ? settings.foundry : {};
  return process.env.FOUNDRY_API_KEY || foundry.apiKey || settings.foundryApiKey || "";
}
