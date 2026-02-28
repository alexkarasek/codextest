import test from "node:test";
import assert from "node:assert/strict";
import { FoundryAgentProvider } from "../src/agents/providers/FoundryAgentProvider.js";
import { normalizeRouterDecision, routeModelSelection } from "../src/agents/modelRouter.js";

function withEnv(overrides, fn) {
  const original = {
    FOUNDRY_ENABLED: process.env.FOUNDRY_ENABLED,
    FOUNDRY_PROJECT_ENDPOINT: process.env.FOUNDRY_PROJECT_ENDPOINT,
    FOUNDRY_API_KEY: process.env.FOUNDRY_API_KEY
  };

  Object.keys(original).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const value = overrides[key];
      if (value === undefined || value === null || value === "") {
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
      Object.entries(original).forEach(([key, value]) => {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    });
}

test("normalizeRouterDecision falls back when selected model is invalid", () => {
  const decision = normalizeRouterDecision(
    {
      selected_model_id: "not-real",
      rationale: "bad response"
    },
    {
      availableModelIds: ["gpt-5-mini", "gpt-4o"],
      defaultModel: "gpt-5-mini"
    }
  );

  assert.equal(decision.selectedModelId, "gpt-5-mini");
  assert.equal(decision.usedFallback, true);
  assert.equal(decision.parseOk, false);
});

test("foundry provider invoke returns structured success payload", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://example.foundry.azure.com",
      FOUNDRY_API_KEY: "test-key"
    },
    async () => {
      const provider = new FoundryAgentProvider({
        fetchImpl: async (url, options) => {
          if (options?.method === "GET") {
            return {
              ok: false,
              status: 404,
              json: async () => ({})
            };
          }
          if (String(url).includes(":invoke")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                selected_model_id: "gpt-4o",
                rationale: "Higher quality requested."
              })
            };
          }
          return {
            ok: false,
            status: 404,
            json: async () => ({})
          };
        }
      });

      const result = await provider.invoke("router-1", [{ role: "user", content: "help" }], { user_prompt: "help" });
      assert.equal(result.ok, true);
      assert.equal(result.agentId, "router-1");
      assert.equal(result.raw.selected_model_id, "gpt-4o");
    }
  );
});

test("routeModelSelection uses foundry router decision when available", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://example.foundry.azure.com",
      FOUNDRY_API_KEY: "test-key"
    },
    async () => {
      const fetchImpl = async (url, options) => {
        if (options?.method === "GET") {
          if (String(url).includes("/agents")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                agents: [
                  {
                    id: "router-1",
                    displayName: "Model Router Agent",
                    description: "Routes models.",
                    tags: ["router"],
                    status: "active"
                  }
                ]
              })
            };
          }
          return {
            ok: false,
            status: 404,
            json: async () => ({})
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            selected_model_id: "gpt-4o-mini",
            rationale: "Latency-sensitive prompt.",
            scores: {
              latency: 9,
              cost: 8
            }
          })
        };
      };

      const result = await routeModelSelection({
        userPrompt: "Give me a fast answer",
        defaultModel: "gpt-5-mini",
        candidateModels: ["gpt-5-mini", "gpt-4o-mini"],
        fetchImpl
      });

      assert.equal(result.selectedModelId, "gpt-4o-mini");
      assert.equal(result.usedFallback, false);
      assert.equal(result.source, "foundry");
      assert.equal(result.agentId, "router-1");
    }
  );
});

test("routeModelSelection falls back cleanly when foundry is disabled", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "false",
      FOUNDRY_PROJECT_ENDPOINT: "",
      FOUNDRY_API_KEY: ""
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
