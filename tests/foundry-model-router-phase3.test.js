import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRouterDecision, routeModelSelection } from "../src/agents/modelRouter.js";

function withEnv(overrides, fn) {
  const keys = [
    "FOUNDRY_ENABLED",
    "FOUNDRY_PROJECT_ENDPOINT",
    "FOUNDRY_ROUTER_APPLICATION_NAME",
    "AZURE_FOUNDRY_BEARER_TOKEN",
    "FOUNDRY_API_VERSION"
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const value = overrides[key];
      if (value === undefined || value === null) delete process.env[key];
      else process.env[key] = String(value);
    } else {
      delete process.env[key];
    }
  });

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("normalizeRouterDecision falls back when selected model is invalid", () => {
  const decision = normalizeRouterDecision(
    { selected_model_id: "not-real", rationale: "bad response" },
    { availableModelIds: ["gpt-5-mini", "gpt-4o"], defaultModel: "gpt-5-mini" }
  );
  assert.equal(decision.selectedModelId, "gpt-5-mini");
  assert.equal(decision.usedFallback, true);
  assert.equal(decision.parseOk, false);
});

test("routeModelSelection uses foundry application output when available", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://foundry.local/api/projects/proj-default",
      FOUNDRY_ROUTER_APPLICATION_NAME: "model-router",
      AZURE_FOUNDRY_BEARER_TOKEN: "token",
      FOUNDRY_API_VERSION: "2025-11-15-preview"
    },
    async () => {
      const fetchImpl = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output_text: JSON.stringify({
            selected_model_id: "gpt-4o-mini",
            rationale: "Latency-sensitive prompt.",
            scores: { latency: 9, cost: 8 }
          })
        })
      });

      const result = await routeModelSelection({
        userPrompt: "Give me a fast answer",
        defaultModel: "gpt-5-mini",
        candidateModels: ["gpt-5-mini", "gpt-4o-mini"],
        fetchImpl
      });

      assert.equal(result.selectedModelId, "gpt-4o-mini");
      assert.equal(result.usedFallback, false);
      assert.equal(result.source, "foundry");
      assert.equal(result.agentId, "foundry-router-application");
    }
  );
});

test("routeModelSelection falls back when foundry is disabled", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "false",
      FOUNDRY_PROJECT_ENDPOINT: "https://foundry.local/api/projects/proj-default",
      FOUNDRY_ROUTER_APPLICATION_NAME: "model-router",
      AZURE_FOUNDRY_BEARER_TOKEN: "token"
    },
    async () => {
      const result = await routeModelSelection({
        userPrompt: "hello",
        defaultModel: "gpt-5-mini",
        candidateModels: ["gpt-5-mini", "gpt-4o-mini"]
      });

      assert.equal(result.selectedModelId, "gpt-5-mini");
      assert.equal(result.usedFallback, true);
      assert.equal(result.source, "disabled");
    }
  );
});

test("routeModelSelection falls back cleanly when foundry application call fails", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://foundry.local/api/projects/proj-default",
      FOUNDRY_ROUTER_APPLICATION_NAME: "model-router",
      AZURE_FOUNDRY_BEARER_TOKEN: "token"
    },
    async () => {
      const fetchImpl = async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            message: "PermissionDenied"
          }
        })
      });

      const result = await routeModelSelection({
        userPrompt: "hello",
        defaultModel: "gpt-5-mini",
        candidateModels: ["gpt-5-mini", "gpt-4o-mini"],
        fetchImpl
      });

      assert.equal(result.selectedModelId, "gpt-5-mini");
      assert.equal(result.usedFallback, true);
      assert.equal(result.source, "invoke-error");
      assert.match(String(result.warning || ""), /PermissionDenied/);
    }
  );
});
