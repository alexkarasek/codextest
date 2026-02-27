import { sleep } from "./utils.js";
import { appendEvent, EVENT_TYPES, recordErrorEvent } from "../packages/core/events/index.js";
import { getObservabilityContext, logEvent } from "./observability.js";
import {
  describeModelExecution,
  getImageGenerationStatus,
  modelSupportsTemperature
} from "./modelCatalog.js";
import {
  getAzureOpenAIApiKey,
  getAzureOpenAIApiVersion,
  getAzureOpenAIDeployment,
  getAzureOpenAIEndpoint,
  getLlmProvider,
  getLlmProviderForModel,
  getOpenAIApiKey
} from "./config.js";

let sdkClient = null;
let sdkAttempted = false;

async function getSdkClient(provider = "openai") {
  if (provider !== "openai") return null;
  if (sdkAttempted) return sdkClient;
  sdkAttempted = true;

  try {
    const module = await import("openai");
    const OpenAI = module.default;
    sdkClient = new OpenAI({ apiKey: getOpenAIApiKey() });
  } catch {
    sdkClient = null;
  }

  return sdkClient;
}

function isTemperatureUnsupportedError(error) {
  const msg = String(error?.message || "").toLowerCase();
  if (!msg.includes("temperature")) return false;
  return (
    msg.includes("not supported") ||
    msg.includes("unsupported") ||
    msg.includes("unknown parameter") ||
    msg.includes("invalid parameter") ||
    msg.includes("not allowed")
  );
}

function withOptionalTemperature(base, temperature, includeTemperature = true) {
  if (!includeTemperature) return base;
  if (!Number.isFinite(Number(temperature))) return base;
  return { ...base, temperature: Number(temperature) };
}

async function callWithFetch({ model, temperature, messages, includeTemperature = true, provider }) {
  const modelExecution = describeModelExecution(model);
  const activeProvider = provider || modelExecution.effectiveProvider || getLlmProviderForModel(model);
  const isAzure = activeProvider === "azure";
  const deployment = modelExecution.deployment || getAzureOpenAIDeployment(model) || model;
  const endpoint = String(getAzureOpenAIEndpoint() || "").replace(/\/+$/, "");
  const url = isAzure
    ? `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(getAzureOpenAIApiVersion())}`
    : "https://api.openai.com/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(isAzure
        ? {
            "api-key": getAzureOpenAIApiKey()
          }
        : {
            Authorization: `Bearer ${getOpenAIApiKey()}`
          })
    },
    body: JSON.stringify(
      withOptionalTemperature(
        {
          ...(isAzure ? {} : { model }),
          messages
        },
        temperature,
        includeTemperature
      )
    )
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "OpenAI API request failed");
    error.status = response.status;
    throw error;
  }

  return {
    text: body?.choices?.[0]?.message?.content || "",
    raw: body
  };
}

async function imageWithFetch({ model, prompt, size, quality }) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      quality,
      response_format: "b64_json"
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || "OpenAI image generation failed");
    error.status = response.status;
    throw error;
  }
  const first = Array.isArray(body?.data) ? body.data[0] : null;
  return {
    b64: first?.b64_json || "",
    revisedPrompt: first?.revised_prompt || "",
    raw: body
  };
}

function extractUsage(raw = {}) {
  const usage = raw?.usage || {};
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens) || 0;
  return { promptTokens, completionTokens, totalTokens };
}

export async function chatCompletion({ model, temperature, messages }) {
  const ctx = getObservabilityContext();
  const started = Date.now();
  const modelExecution = describeModelExecution(model);
  await appendEvent({
    eventType: EVENT_TYPES.LLMCallStarted,
    component: "llm.chatCompletion",
    requestId: ctx.requestId || null,
    runId: ctx.runId || null,
    data: {
      provider: getLlmProvider(),
      effectiveProvider: modelExecution.effectiveProvider,
      model,
      messageCount: Array.isArray(messages) ? messages.length : 0
    }
  });

  const provider = modelExecution.effectiveProvider;
  const azureDeployment = provider === "azure" ? modelExecution.deployment || getAzureOpenAIDeployment(model) || model : "";
  const missing =
    provider === "azure"
      ? !getAzureOpenAIApiKey() || !getAzureOpenAIEndpoint() || !azureDeployment
      : !getOpenAIApiKey();
  if (missing) {
    const err = new Error(
      provider === "azure"
        ? "Missing Azure OpenAI configuration (api key, endpoint, and deployment or model)."
        : "Missing OPENAI_API_KEY"
    );
    err.code = "MISSING_API_KEY";
    await recordErrorEvent({
      component: "llm.chatCompletion",
      requestId: ctx.requestId || null,
      runId: ctx.runId || null,
      error: err,
      data: {
        provider,
        model
      }
    });
    throw err;
  }

  const maxRetries = 2;
  let lastError = null;
  let includeTemperature = modelSupportsTemperature(model);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const client = await getSdkClient(provider);
      if (client) {
        const completion = await client.chat.completions.create(
          withOptionalTemperature(
            {
              model,
              messages
            },
            temperature,
            includeTemperature
          )
        );
        const usage = extractUsage(completion);
        const latencyMs = Date.now() - started;
        await appendEvent({
          eventType: EVENT_TYPES.LLMCallFinished,
          component: "llm.chatCompletion",
          requestId: ctx.requestId || null,
          runId: ctx.runId || null,
          latencyMs,
          data: {
            provider,
            model,
            usage: {
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
              total_tokens: usage.totalTokens
            }
          }
        });
        logEvent("info", {
          component: "llm.chatCompletion",
          eventType: "llm.call.finished",
          requestId: ctx.requestId || null,
          runId: ctx.runId || null,
          latencyMs
        });
        return {
          text: completion.choices?.[0]?.message?.content || "",
          raw: completion,
          meta: {
            model,
            effectiveProvider: provider,
            providerLabel: modelExecution.providerLabel,
            deployment: azureDeployment || null,
            temperatureApplied: includeTemperature
          }
        };
      }

      const fetched = await callWithFetch({ model, temperature, messages, includeTemperature, provider });
      const usage = extractUsage(fetched.raw);
      const latencyMs = Date.now() - started;
      await appendEvent({
        eventType: EVENT_TYPES.LLMCallFinished,
        component: "llm.chatCompletion",
        requestId: ctx.requestId || null,
        runId: ctx.runId || null,
        latencyMs,
        data: {
          provider,
          model,
          usage: {
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            total_tokens: usage.totalTokens
          }
        }
      });
      logEvent("info", {
        component: "llm.chatCompletion",
        eventType: "llm.call.finished",
        requestId: ctx.requestId || null,
        runId: ctx.runId || null,
        latencyMs
      });
      return {
        ...fetched,
        meta: {
          model,
          effectiveProvider: provider,
          providerLabel: modelExecution.providerLabel,
          deployment: azureDeployment || null,
          temperatureApplied: includeTemperature
        }
      };
    } catch (error) {
      if (includeTemperature && isTemperatureUnsupportedError(error)) {
        includeTemperature = false;
        continue;
      }
      lastError = error;
      if (attempt >= maxRetries) break;
      const delay = 500 * 2 ** attempt;
      await sleep(delay);
    }
  }

  await recordErrorEvent({
    component: "llm.chatCompletion",
    requestId: ctx.requestId || null,
    runId: ctx.runId || null,
    error: lastError,
    data: {
      provider,
      model,
      messageCount: Array.isArray(messages) ? messages.length : 0
    }
  });
  logEvent("error", {
    component: "llm.chatCompletion",
    eventType: "llm.call.error",
    requestId: ctx.requestId || null,
    runId: ctx.runId || null,
    latencyMs: Date.now() - started,
    error: {
      code: lastError?.code || "LLM_ERROR",
      message: lastError?.message || "LLM call failed."
    }
  });
  throw lastError;
}

export async function imageGeneration({
  model = "gpt-image-1",
  prompt,
  size = "1024x1024",
  quality = "auto"
}) {
  const imageStatus = getImageGenerationStatus();
  if (!imageStatus.available || !getOpenAIApiKey()) {
    const err = new Error("Image generation requires openaiApiKey because images currently use the OpenAI Images API.");
    err.code = "MISSING_API_KEY";
    throw err;
  }
  const safePrompt = String(prompt || "").trim();
  if (!safePrompt) {
    const err = new Error("Image prompt is required.");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  const normalizedQuality = (() => {
    const q = String(quality || "auto").toLowerCase().trim();
    if (q === "standard") return "auto";
    if (["low", "medium", "high", "auto"].includes(q)) return q;
    return "auto";
  })();

  const maxRetries = 2;
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const client = await getSdkClient();
      if (client?.images?.generate) {
        const result = await client.images.generate({
          model,
          prompt: safePrompt,
          size,
          quality: normalizedQuality
        });
        const first = Array.isArray(result?.data) ? result.data[0] : null;
        return {
          b64: first?.b64_json || "",
          revisedPrompt: first?.revised_prompt || "",
          raw: result
        };
      }
      return await imageWithFetch({ model, prompt: safePrompt, size, quality: normalizedQuality });
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError;
}
