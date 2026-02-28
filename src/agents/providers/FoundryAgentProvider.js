import {
  getFoundryApiKey,
  getFoundryProjectEndpoint,
  isFoundryEnabled
} from "../../../lib/config.js";
import { AgentProvider, availableHealth, manifestWithAvailability, unavailableHealth } from "./AgentProvider.js";

function trimEndpoint(url = "") {
  return String(url || "").trim().replace(/\/+$/, "");
}

function createFoundryManifest(health) {
  return manifestWithAvailability(
    {
      id: "foundry-model-router",
      displayName: "Model Router Agent",
      provider: "foundry",
      description: "Azure AI Foundry-hosted model router agent placeholder for future model selection workflows.",
      tags: ["routing", "foundry", "models"],
      capabilities: {
        routes_models: true,
        tool_calling: false,
        structured_output: true
      }
    },
    health
  );
}

export class FoundryAgentProvider extends AgentProvider {
  constructor({ fetchImpl } = {}) {
    super({ id: "foundry", displayName: "Foundry Agents" });
    this.fetchImpl = typeof fetchImpl === "function" ? fetchImpl : fetch;
  }

  isEnabled() {
    return isFoundryEnabled();
  }

  async healthCheck() {
    if (!this.isEnabled()) {
      return unavailableHealth("Foundry is disabled.");
    }

    const endpoint = trimEndpoint(getFoundryProjectEndpoint());
    const apiKey = String(getFoundryApiKey() || "").trim();
    if (!endpoint || !apiKey) {
      return unavailableHealth("Foundry is enabled but project endpoint or API key is missing.");
    }

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "GET",
        headers: {
          "api-key": apiKey
        }
      });

      if (response.ok) {
        return availableHealth({ reason: "Foundry project endpoint reachable." });
      }

      if (response.status === 404) {
        return availableHealth({ reason: "Foundry endpoint reachable (no root health route)." });
      }

      if (response.status === 401 || response.status === 403) {
        return unavailableHealth(`Foundry credentials rejected (HTTP ${response.status}).`);
      }

      if (response.status < 500) {
        return availableHealth({ reason: `Foundry endpoint reachable (HTTP ${response.status}).` });
      }

      return unavailableHealth(`Foundry health check failed (HTTP ${response.status}).`);
    } catch (error) {
      return unavailableHealth(`Foundry health check failed: ${error.message}`);
    }
  }

  async listAgents() {
    const health = await this.healthCheck();
    return [createFoundryManifest(health)];
  }

  async invoke(agentId, _messages, _context = {}) {
    const err = new Error(
      `Foundry agent '${String(agentId || "").trim() || "unknown"}' invocation is not implemented in Phase 1.`
    );
    err.code = "NOT_IMPLEMENTED";
    throw err;
  }
}
