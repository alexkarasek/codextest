import { sleep } from "./utils.js";
import { getOpenAIApiKey } from "./config.js";

let sdkClient = null;
let sdkAttempted = false;

async function getSdkClient() {
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
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIApiKey()}`
    },
    body: JSON.stringify({
      model,
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

export async function chatCompletion({ model, temperature, messages }) {
  if (!getOpenAIApiKey()) {
    const err = new Error("Missing OPENAI_API_KEY");
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
