import test from "node:test";
import assert from "node:assert/strict";
import { createAgentProviderRegistry } from "../src/agents/agentProviderRegistry.js";
import { LocalAgentProvider } from "../src/agents/providers/LocalAgentProvider.js";
import { FoundryAgentProvider } from "../src/agents/providers/FoundryAgentProvider.js";

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
      if (value === undefined || value === null) {
        delete process.env[key];
      } else {
        process.env[key] = String(value);
      }
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

test("local provider exposes normalized support concierge manifest", async () => {
  const provider = new LocalAgentProvider();
  const manifests = await provider.listAgents();
  assert.equal(provider.isEnabled(), true);
  assert.equal(manifests.length, 1);
  assert.equal(manifests[0].id, "support-concierge");
});

test("registry excludes foundry provider when foundry is disabled", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "false",
      FOUNDRY_PROJECT_ENDPOINT: "https://foundry.local/api/projects/proj-default",
      FOUNDRY_ROUTER_APPLICATION_NAME: "model-router",
      AZURE_FOUNDRY_BEARER_TOKEN: "token"
    },
    async () => {
      const registry = createAgentProviderRegistry();
      const ids = registry.providers.map((provider) => provider.id);
      assert.deepEqual(ids, ["local"]);
    }
  );
});

test("foundry provider health and listAgents use configured application targets", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://foundry.local/api/projects/proj-default",
      FOUNDRY_ROUTER_APPLICATION_NAME: "model-router",
      AZURE_FOUNDRY_BEARER_TOKEN: "token"
    },
    async () => {
      const provider = new FoundryAgentProvider();
      const health = await provider.healthCheck();
      const agents = await provider.listAgents();

      assert.equal(health.status, "available");
      assert.ok(agents.length >= 1);
      const router = agents.find((agent) => agent.id === "model-router");
      assert.ok(router);
      assert.equal(router.capabilities.routes_models, true);
    }
  );
});

test("foundry provider routeModels calls application responses endpoint", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://foundry.local/api/projects/proj-default",
      FOUNDRY_ROUTER_APPLICATION_NAME: "model-router",
      AZURE_FOUNDRY_BEARER_TOKEN: "token",
      FOUNDRY_API_VERSION: "2025-11-15-preview"
    },
    async () => {
      const calls = [];
      const provider = new FoundryAgentProvider({
        fetchImpl: async (url, options) => {
          calls.push({ url: String(url), options });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              output_text: JSON.stringify({
                selected_model_id: "gpt-4o-mini",
                rationale: "Low latency."
              })
            })
          };
        }
      });

      const result = await provider.routeModels({
        user_prompt: "hello",
        intent: "general-chat",
        constraints: { priority: "latency" },
        available_models: [{ model_id: "gpt-4o-mini" }]
      });

      assert.equal(result.ok, true);
      assert.equal(result.raw.selected_model_id, "gpt-4o-mini");
      assert.equal(calls.length, 1);
      assert.match(
        calls[0].url,
        /https:\/\/foundry\.local\/api\/projects\/proj-default\/applications\/model-router\/protocols\/openai\/responses\?api-version=2025-11-15-preview/
      );
      assert.equal(calls[0].options.headers.Authorization, "Bearer token");
    }
  );
});
