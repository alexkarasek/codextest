import {
  getAzureOpenAIDeployment,
  getLlmProviderForModel,
  getOpenAIApiKey
} from "./config.js";

const TEXT_MODELS = [
  {
    id: "gpt-5-mini",
    label: "gpt-5-mini",
    compareEligible: true,
    supportsTemperature: false,
    providerHints: ["openai", "azure"]
  },
  {
    id: "llama-3.3-70b-instruct",
    label: "llama-3.3-70b-instruct",
    compareEligible: true,
    supportsTemperature: true,
    providerHints: ["openai", "azure"]
  },
  {
    id: "gpt-5.2",
    label: "gpt-5.2",
    compareEligible: true,
    supportsTemperature: false,
    providerHints: ["openai", "azure"]
  },
  {
    id: "gpt-4.1",
    label: "gpt-4.1",
    compareEligible: true,
    supportsTemperature: true,
    providerHints: ["openai", "azure"]
  },
  {
    id: "gpt-4o-mini",
    label: "gpt-4o-mini",
    compareEligible: true,
    supportsTemperature: true,
    providerHints: ["openai", "azure"]
  },
  {
    id: "gpt-4o",
    label: "gpt-4o",
    compareEligible: true,
    supportsTemperature: true,
    providerHints: ["openai", "azure"]
  }
];

const IMAGE_MODELS = [
  {
    id: "gpt-image-1",
    label: "gpt-image-1"
  }
];

function fallbackModel(model = "") {
  const value = String(model || "").trim();
  return {
    id: value || "gpt-5-mini",
    label: value || "gpt-5-mini",
    compareEligible: true,
    supportsTemperature: true,
    providerHints: ["openai", "azure"]
  };
}

export function getTextModelDefinitions() {
  return TEXT_MODELS.map((entry) => ({ ...entry }));
}

export function getImageModelDefinitions() {
  return IMAGE_MODELS.map((entry) => ({ ...entry }));
}

export function getModelDefinition(model = "") {
  const modelId = String(model || "").trim();
  if (!modelId) return fallbackModel("gpt-5-mini");
  const direct = TEXT_MODELS.find((entry) => entry.id === modelId);
  if (direct) return { ...direct };
  const normalized = modelId.toLowerCase();
  const match = TEXT_MODELS.find((entry) => entry.id.toLowerCase() === normalized);
  return match ? { ...match } : fallbackModel(modelId);
}

export function modelSupportsTemperature(model = "") {
  return getModelDefinition(model).supportsTemperature !== false;
}

export function describeModelExecution(model = "") {
  const definition = getModelDefinition(model);
  const effectiveProvider = getLlmProviderForModel(definition.id);
  const deployment = effectiveProvider === "azure" ? getAzureOpenAIDeployment(definition.id) || definition.id : "";
  return {
    ...definition,
    effectiveProvider,
    providerLabel: effectiveProvider === "azure" ? "Azure OpenAI" : "OpenAI",
    deployment: deployment || null
  };
}

export function listModelCatalog() {
  return getTextModelDefinitions().map((entry) => describeModelExecution(entry.id));
}

export function getImageGenerationStatus() {
  const configured = Boolean(getOpenAIApiKey());
  return {
    available: configured,
    provider: "openai",
    providerLabel: "OpenAI",
    model: IMAGE_MODELS[0].id,
    requirement: configured
      ? "Image generation uses the OpenAI Images API."
      : "Set openaiApiKey (or OPENAI_API_KEY) to use image generation."
  };
}
