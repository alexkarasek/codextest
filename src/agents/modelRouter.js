import { getTextModelDefinitions } from "../../lib/modelCatalog.js";
import { createAgentProviderRegistry } from "./agentProviderRegistry.js";

export const AUTO_ROUTER_MODEL_ID = "auto-router";
const DEFAULT_ROUTER_MODEL = "gpt-5-mini";

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizePriority(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["cost", "latency", "quality", "balanced"].includes(normalized)) {
    return normalized;
  }
  return "balanced";
}

function inferIntent(userPrompt = "", context = {}) {
  const text = String(userPrompt || "").toLowerCase();
  if (context.forceJson || /\bjson|schema|structured\b/.test(text)) return "structured-output";
  if (context.needsTools || /\bfetch|tool|api|http|current|latest\b/.test(text)) return "tool-assisted";
  if (/\bcompare|evaluate|tradeoff|analyze|analysis\b/.test(text)) return "analysis";
  if (/\bwrite|draft|rewrite|summarize|explain\b/.test(text)) return "composition";
  return "general-chat";
}

function inferConstraints(userPrompt = "", context = {}) {
  const text = String(userPrompt || "").toLowerCase();
  const priority = normalizePriority(
    context.priority ||
      (/\bcheap|cheapest|low cost|save money\b/.test(text)
        ? "cost"
        : /\bfast|quick|lowest latency|speed\b/.test(text)
          ? "latency"
          : /\bbest|highest quality|best answer|most accurate\b/.test(text)
            ? "quality"
            : "balanced")
  );
  return {
    priority,
    needs_json: Boolean(context.forceJson || /\bjson|schema|structured\b/.test(text)),
    needs_tools: Boolean(context.needsTools || /\bfetch|tool|api|http|current|latest\b/.test(text))
  };
}

function modelTier(modelId = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("mini")) return "mini";
  if (id.includes("llama") || id.includes("oss")) return "oss";
  if (id.includes("5.2") || id.includes("4o")) return "premium";
  return "standard";
}

function buildAvailableModels(modelIds = []) {
  const known = getTextModelDefinitions();
  const rows = (modelIds.length ? modelIds : known.map((row) => row.id))
    .filter((id) => id && id !== AUTO_ROUTER_MODEL_ID)
    .map((id) => {
      const info = known.find((row) => row.id === id) || { id };
      return {
        model_id: id,
        provider: "dynamic",
        tier: modelTier(id),
        label: info.label || id
      };
    });
  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.model_id)) continue;
    seen.add(row.model_id);
    deduped.push(row);
  }
  return deduped;
}

function parseMaybeJsonString(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
}

function extractDecisionPayload(response = {}) {
  if (!response || typeof response !== "object") return null;
  const direct = response.raw && typeof response.raw === "object" ? response.raw : response;
  const candidates = [
    direct,
    direct.result,
    direct.output,
    direct.data,
    direct.response
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && candidate.selected_model_id) return candidate;
  }
  const textCandidates = [direct.content, direct.text, direct.output_text, direct.message];
  for (const entry of textCandidates) {
    const parsed = parseMaybeJsonString(entry);
    if (parsed?.selected_model_id) return parsed;
  }
  return null;
}

export function normalizeRouterDecision(rawDecision, { availableModelIds = [], defaultModel = DEFAULT_ROUTER_MODEL } = {}) {
  const allowed = new Set(uniqueStrings(availableModelIds));
  const baseDefault = String(defaultModel || DEFAULT_ROUTER_MODEL).trim() || DEFAULT_ROUTER_MODEL;
  const fallbackDefault = allowed.has(baseDefault) ? baseDefault : (availableModelIds[0] || DEFAULT_ROUTER_MODEL);
  const decision = rawDecision && typeof rawDecision === "object" ? rawDecision : {};
  const selected = String(decision.selected_model_id || "").trim();
  const fallback = String(decision.fallback_model_id || "").trim();

  if (!selected || !allowed.has(selected)) {
    return {
      selectedModelId: fallbackDefault,
      fallbackModelId: fallback || null,
      rationale: "Router output was missing or invalid. Falling back to the default model.",
      scores: null,
      usedFallback: true,
      parseOk: false
    };
  }

  return {
    selectedModelId: selected,
    fallbackModelId: fallback && allowed.has(fallback) ? fallback : null,
    rationale: String(decision.rationale || "").trim() || "Model selected by router agent.",
    scores: decision.scores && typeof decision.scores === "object" ? decision.scores : null,
    usedFallback: false,
    parseOk: true
  };
}

export async function routeModelSelection({
  userPrompt,
  defaultModel = DEFAULT_ROUTER_MODEL,
  candidateModels = [],
  context = {},
  fetchImpl
} = {}) {
  const availableModels = buildAvailableModels(candidateModels);
  const availableIds = availableModels.map((row) => row.model_id);
  const baseDefault = availableIds.includes(defaultModel) ? defaultModel : (availableIds[0] || DEFAULT_ROUTER_MODEL);

  const registry = createAgentProviderRegistry({ fetchImpl });
  const provider = registry.getProvider("foundry");
  if (!provider || !provider.isEnabled()) {
    return {
      selectedModelId: baseDefault,
      fallbackModelId: null,
      rationale: "Foundry router is disabled. Using the default model.",
      scores: null,
      usedFallback: true,
      source: "disabled",
      warning: "Router unavailable; used default model."
    };
  }

  const health = await provider.healthCheck();
  if (health.status !== "available") {
    return {
      selectedModelId: baseDefault,
      fallbackModelId: null,
      rationale: "Foundry router is unavailable. Using the default model.",
      scores: null,
      usedFallback: true,
      source: "unavailable",
      warning: health.reason || "Router unavailable; used default model."
    };
  }

  try {
    const response =
      typeof provider.routeModels === "function"
        ? await provider.routeModels({
            user_prompt: String(userPrompt || ""),
            intent: inferIntent(userPrompt, context),
            constraints: inferConstraints(userPrompt, context),
            available_models: availableModels
          })
        : null;

    if (!response?.ok) {
      return {
        selectedModelId: baseDefault,
        fallbackModelId: null,
        rationale: "Router invocation failed. Using the default model.",
        scores: null,
        usedFallback: true,
        source: "invoke-error",
        warning: response?.error?.message || "Router invocation failed; used default model."
      };
    }

    const parsed = extractDecisionPayload(response);
    const normalized = normalizeRouterDecision(parsed, {
      availableModelIds: availableIds,
      defaultModel: baseDefault
    });

    return {
      ...normalized,
      source: normalized.usedFallback ? "invalid-router-output" : "foundry",
      agentId: "foundry-router-application",
      usedConfiguredAgent: true
    };
  } catch (error) {
    return {
      selectedModelId: baseDefault,
      fallbackModelId: null,
      rationale: "Router execution failed unexpectedly. Using the default model.",
      scores: null,
      usedFallback: true,
      source: "router-exception",
      warning: error?.message || "Router unavailable; used default model."
    };
  }
}
