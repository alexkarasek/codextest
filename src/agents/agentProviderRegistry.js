import { FoundryAgentProvider } from "./providers/FoundryAgentProvider.js";
import { LocalAgentProvider } from "./providers/LocalAgentProvider.js";

function sortProviders(providers = []) {
  return [...providers].sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
}

export function createAgentProviderRegistry({ fetchImpl, credentialFactory } = {}) {
  const providers = [new LocalAgentProvider()];
  const foundry = new FoundryAgentProvider({ fetchImpl, credentialFactory });
  if (foundry.isEnabled()) {
    providers.push(foundry);
  }

  return {
    providers: sortProviders(providers),
    getProvider(providerId) {
      const id = String(providerId || "").trim().toLowerCase();
      return providers.find((provider) => String(provider.id || "").trim().toLowerCase() === id) || null;
    },
    async listProviderStatuses() {
      const rows = [];
      for (const provider of sortProviders(providers)) {
        const health = await provider.healthCheck();
        rows.push({
          id: provider.id,
          displayName: provider.displayName,
          enabled: provider.isEnabled(),
          health
        });
      }
      return rows;
    },
    async listAgents() {
      const manifests = [];
      for (const provider of sortProviders(providers)) {
        const rows = await provider.listAgents();
        manifests.push(...(Array.isArray(rows) ? rows : []));
      }
      return manifests;
    }
  };
}
