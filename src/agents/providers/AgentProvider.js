export class AgentProvider {
  constructor({ id, displayName } = {}) {
    this.id = String(id || "provider");
    this.displayName = String(displayName || this.id);
  }

  isEnabled() {
    throw new Error("AgentProvider.isEnabled() must be implemented.");
  }

  async healthCheck() {
    throw new Error("AgentProvider.healthCheck() must be implemented.");
  }

  async listAgents() {
    throw new Error("AgentProvider.listAgents() must be implemented.");
  }

  async invoke(_agentId, _messages, _context) {
    throw new Error("AgentProvider.invoke() must be implemented.");
  }
}

export function availableHealth(details = {}) {
  return {
    status: "available",
    reason: String(details.reason || "").trim() || undefined,
    checkedAt: new Date().toISOString()
  };
}

export function unavailableHealth(reason = "Unavailable") {
  return {
    status: "unavailable",
    reason: String(reason || "Unavailable"),
    checkedAt: new Date().toISOString()
  };
}

export function manifestWithAvailability(manifest, health) {
  return {
    id: String(manifest?.id || ""),
    displayName: String(manifest?.displayName || manifest?.id || ""),
    provider: String(manifest?.provider || "local"),
    description: String(manifest?.description || ""),
    tags: Array.isArray(manifest?.tags) ? manifest.tags : [],
    capabilities: {
      routes_models: Boolean(manifest?.capabilities?.routes_models),
      tool_calling: Boolean(manifest?.capabilities?.tool_calling),
      structured_output: Boolean(manifest?.capabilities?.structured_output)
    },
    availability: {
      status: health?.status === "available" ? "available" : "unavailable",
      ...(health?.reason ? { reason: String(health.reason) } : {})
    }
  };
}
