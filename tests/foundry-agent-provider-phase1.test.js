import test from "node:test";
import assert from "node:assert/strict";
import { createAgentProviderRegistry } from "../src/agents/agentProviderRegistry.js";
import { LocalAgentProvider } from "../src/agents/providers/LocalAgentProvider.js";
import { FoundryAgentProvider } from "../src/agents/providers/FoundryAgentProvider.js";

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

test("local provider exposes normalized support concierge manifest", async () => {
  const provider = new LocalAgentProvider();
  const manifests = await provider.listAgents();
  assert.equal(provider.isEnabled(), true);
  assert.equal(manifests.length, 1);
  const agent = manifests[0];
  assert.equal(agent.id, "support-concierge");
  assert.equal(agent.provider, "local");
  assert.equal(agent.availability.status, "available");
  assert.equal(typeof agent.capabilities.routes_models, "boolean");
  assert.equal(typeof agent.capabilities.tool_calling, "boolean");
  assert.equal(typeof agent.capabilities.structured_output, "boolean");
});

test("registry excludes foundry provider when disabled", async () => {
  await withEnv({ FOUNDRY_ENABLED: "false", FOUNDRY_PROJECT_ENDPOINT: "", FOUNDRY_API_KEY: "" }, async () => {
    const registry = createAgentProviderRegistry();
    const ids = registry.providers.map((provider) => provider.id);
    assert.deepEqual(ids, ["local"]);
  });
});

test("foundry provider registers but is unavailable when config is incomplete", async () => {
  await withEnv({ FOUNDRY_ENABLED: "true", FOUNDRY_PROJECT_ENDPOINT: "", FOUNDRY_API_KEY: "" }, async () => {
    const registry = createAgentProviderRegistry();
    const ids = registry.providers.map((provider) => provider.id);
    assert.deepEqual(ids, ["foundry", "local"]);
    const statuses = await registry.listProviderStatuses();
    const foundry = statuses.find((row) => row.id === "foundry");
    assert.ok(foundry);
    assert.equal(foundry.health.status, "unavailable");
    assert.match(String(foundry.health.reason || ""), /missing/i);
  });
});

test("foundry health check treats reachable endpoint as available and list failure degrades to empty array", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://example.foundry.azure.com",
      FOUNDRY_API_KEY: "test-key"
    },
    async () => {
      const provider = new FoundryAgentProvider({
        fetchImpl: async () => ({
          ok: false,
          status: 404
        })
      });
      const health = await provider.healthCheck();
      assert.equal(health.status, "available");

      const agents = await provider.listAgents();
      assert.deepEqual(agents, []);
    }
  );
});

test("foundry listAgents normalizes remote agent payloads", async () => {
  await withEnv(
    {
      FOUNDRY_ENABLED: "true",
      FOUNDRY_PROJECT_ENDPOINT: "https://example.foundry.azure.com",
      FOUNDRY_API_KEY: "test-key"
    },
    async () => {
      const provider = new FoundryAgentProvider({
        fetchImpl: async (url) => {
          if (String(url).includes("/agents")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                agents: [
                  {
                    id: "router-1",
                    displayName: "Model Router Agent",
                    description: "Routes prompts to the best model.",
                    tags: ["router", "models"],
                    toolCalling: false,
                    structuredOutput: true,
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
      });

      const agents = await provider.listAgents();
      assert.equal(agents.length, 1);
      assert.equal(agents[0].id, "router-1");
      assert.equal(agents[0].provider, "foundry");
      assert.equal(agents[0].availability.status, "available");
      assert.equal(agents[0].capabilities.routes_models, true);
      assert.equal(agents[0].capabilities.structured_output, true);
    }
  );
});
