import {
  getFoundryProviderHealth,
  invokeFoundryApplicationByName,
  listFoundryAgentManifests,
  routeModelsWithFoundryApplication
} from "../providerService.js";
import {
  getFoundryRouterApplicationName,
  getFoundryRouterApplicationVersion,
  isFoundryEnabled
} from "../../../lib/config.js";
import { AgentProvider, manifestWithAvailability, unavailableHealth } from "./AgentProvider.js";

export class FoundryAgentProvider extends AgentProvider {
  constructor({ fetchImpl, credentialFactory } = {}) {
    super({ id: "foundry", displayName: "Foundry Agents" });
    this.fetchImpl = typeof fetchImpl === "function" ? fetchImpl : undefined;
    this.credentialFactory = typeof credentialFactory === "function" ? credentialFactory : undefined;
  }

  providerOptions() {
    return {
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      ...(this.credentialFactory ? { credentialFactory: this.credentialFactory } : {})
    };
  }

  isEnabled() {
    return isFoundryEnabled();
  }

  async healthCheck() {
    if (!this.isEnabled()) {
      return unavailableHealth("Foundry provider is disabled.");
    }
    return getFoundryProviderHealth(this.providerOptions());
  }

  async listAgents() {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return [];
    }

    return listFoundryAgentManifests().map((manifest) =>
      manifestWithAvailability(manifest, health)
    );
  }

  async routeModels(payload = {}) {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return {
        ok: false,
        provider: "foundry",
        error: {
          code: "FOUNDRY_UNAVAILABLE",
          message: health.reason || "Foundry provider is unavailable."
        }
      };
    }

    return routeModelsWithFoundryApplication(payload, this.providerOptions());
  }

  async invoke(agentId, messages = [], context = {}) {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return {
        ok: false,
        provider: "foundry",
        error: {
          code: "FOUNDRY_UNAVAILABLE",
          message: health.reason || "Foundry provider is unavailable."
        }
      };
    }

    try {
      const result = await invokeFoundryApplicationByName(
        agentId,
        {
          messages,
          context,
          ...this.providerOptions()
        }
      );
      return {
        ok: true,
        provider: "foundry",
        content: result.text,
        raw: result.raw
      };
    } catch (error) {
      return {
        ok: false,
        provider: "foundry",
        error: {
          code: "FOUNDRY_INVOKE_FAILED",
          message: error?.message || "Foundry agent invocation failed."
        }
      };
    }
  }

  getConfiguredRouting() {
    return {
      configuredRouterApplicationName: String(getFoundryRouterApplicationName() || "").trim(),
      configuredRouterApplicationVersion: String(getFoundryRouterApplicationVersion() || "").trim()
    };
  }
}
