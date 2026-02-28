import { AgentProvider, availableHealth, manifestWithAvailability } from "./AgentProvider.js";
import { answerSupportMessage } from "../../support/supportAgent.js";

const LOCAL_AGENT_MANIFESTS = [
  {
    id: "support-concierge",
    displayName: "Support Concierge",
    provider: "local",
    description: "Grounded documentation support agent powered by local docs retrieval and local runtime orchestration.",
    tags: ["support", "docs", "grounded"],
    capabilities: {
      routes_models: false,
      tool_calling: false,
      structured_output: false
    }
  }
];

function latestUserMessage(messages = []) {
  const rows = Array.isArray(messages) ? messages : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (String(row?.role || "").toLowerCase() === "user") {
      return String(row?.content || "").trim();
    }
  }
  return "";
}

export class LocalAgentProvider extends AgentProvider {
  constructor() {
    super({ id: "local", displayName: "Local Agents" });
  }

  isEnabled() {
    return true;
  }

  async healthCheck() {
    return availableHealth({ reason: "Local provider is always available." });
  }

  async listAgents() {
    const health = await this.healthCheck();
    return LOCAL_AGENT_MANIFESTS.map((manifest) => manifestWithAvailability(manifest, health));
  }

  async invoke(agentId, messages, context = {}) {
    const id = String(agentId || "").trim();
    if (id !== "support-concierge") {
      const err = new Error(`Local agent '${id}' is not available.`);
      err.code = "AGENT_NOT_FOUND";
      throw err;
    }

    const message = latestUserMessage(messages);
    if (!message) {
      const err = new Error("A user message is required to invoke the local support concierge.");
      err.code = "VALIDATION_ERROR";
      throw err;
    }

    const result = await answerSupportMessage({
      message,
      user: context.user || null
    });

    return {
      agentId: id,
      provider: "local",
      ok: true,
      content: String(result.reply || ""),
      citations: Array.isArray(result.citations) ? result.citations : [],
      raw: result
    };
  }
}
