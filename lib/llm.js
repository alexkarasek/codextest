import { sleep } from "./utils.js";
import {
  getAzureOpenAIApiKey,
  getAzureOpenAIApiVersion,
  getAzureOpenAIDeployment,
  getAzureOpenAIEndpoint,
  getLlmProvider,
  getOpenAIApiKey
} from "./config.js";

let sdkClient = null;
let sdkAttempted = false;

async function getSdkClient() {
  if (getLlmProvider() !== "openai") return null;
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

async function callWithFetch({ model, temperature, messages }) {
  const provider = getLlmProvider();
  const isAzure = provider === "azure";
  const deployment = getAzureOpenAIDeployment() || model;
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
    body: JSON.stringify({
      ...(isAzure ? {} : { model }),
      temperature,
      messages
    })
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

export async function chatCompletion({ model, temperature, messages }) {
  const provider = getLlmProvider();
  const missing =
    provider === "azure"
      ? !getAzureOpenAIApiKey() || !getAzureOpenAIEndpoint() || !(getAzureOpenAIDeployment() || model)
      : !getOpenAIApiKey();
  if (missing) {
    const err = new Error(
      provider === "azure"
        ? "Missing Azure OpenAI configuration (api key, endpoint, and deployment or model)."
        : "Missing OPENAI_API_KEY"
    );
    err.code = "MISSING_API_KEY";
    throw err;
  }

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const client = await getSdkClient();
      if (client) {
        const completion = await client.chat.completions.create({
          model,
          temperature,
          messages
        });
        return {
          text: completion.choices?.[0]?.message?.content || "",
          raw: completion
        };
      }

      return await callWithFetch({ model, temperature, messages });
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      const delay = 500 * 2 ** attempt;
      await sleep(delay);
    }
  }

  throw lastError;
}

export async function imageGeneration({
  model = "gpt-image-1",
  prompt,
  size = "1024x1024",
  quality = "auto"
}) {
  if (getLlmProvider() !== "openai") {
    const err = new Error("Image generation currently supports OpenAI provider only.");
    err.code = "UNSUPPORTED_PROVIDER";
    throw err;
  }
  if (!getOpenAIApiKey()) {
    const err = new Error("Missing OPENAI_API_KEY");
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
