import {
  getFoundryApiKey,
  getFoundryProjectEndpoint,
  isFoundryEnabled
} from "../../../lib/config.js";
import { logEvent } from "../../../lib/observability.js";
import { AgentProvider, availableHealth, manifestWithAvailability, unavailableHealth } from "./AgentProvider.js";

function trimEndpoint(url = "") {
  return String(url || "").trim().replace(/\/+$/, "");
}

function parseMaybeJson(response) {
  if (typeof response?.json !== "function") return Promise.resolve({});
  return response.json().catch(() => ({}));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function guessRoutesModels(agent = {}) {
  if (agent?.capabilities?.routes_models === true) return true;
  if (agent?.routes_models === true) return true;
  if (agent?.routeModels === true) return true;
  const corpus = [
    agent.id,
    agent.displayName,
    agent.name,
    agent.description,
    ...(Array.isArray(agent.tags) ? agent.tags : [])
  ]
    .join(" ")
    .toLowerCase();
  return corpus.includes("router") || corpus.includes("route model") || corpus.includes("model-router");
}

function normalizeCapability(agent = {}) {
  const tools = Array.isArray(agent.tools) ? agent.tools : [];
  const responseFormat = String(agent.responseFormat || agent.outputFormat || "").toLowerCase();
  return {
    routes_models: guessRoutesModels(agent),
    tool_calling:
      agent?.capabilities?.tool_calling === true ||
      agent?.tool_calling === true ||
      agent?.toolCalling === true ||
      agent?.toolsEnabled === true ||
      tools.length > 0,
    structured_output:
      agent?.capabilities?.structured_output === true ||
      agent?.structured_output === true ||
      agent?.structuredOutput === true ||
      responseFormat.includes("json") ||
      responseFormat.includes("schema")
  };
}

function normalizeAvailability(agent = {}, fallbackHealth) {
  const raw = String(
    agent?.availability?.status ||
      agent?.status ||
      agent?.lifecycleState ||
      agent?.state ||
      ""
  )
    .trim()
    .toLowerCase();
  if (!raw) {
    return {
      status: fallbackHealth?.status === "available" ? "available" : "unavailable",
      ...(fallbackHealth?.reason ? { reason: String(fallbackHealth.reason) } : {})
    };
  }

  if (["available", "active", "ready", "enabled", "healthy"].includes(raw)) {
    return { status: "available" };
  }

  return {
    status: "unavailable",
    reason: String(agent?.availability?.reason || `Foundry agent status is '${raw}'.`)
  };
}

function normalizeAgentManifest(agent, fallbackHealth) {
  const id = String(agent?.id || agent?.agentId || agent?.name || agent?.slug || "").trim();
  if (!id) return null;
  const tags = uniqueStrings(
    Array.isArray(agent?.tags)
      ? agent.tags
      : Array.isArray(agent?.labels)
        ? agent.labels
        : []
  );

  return manifestWithAvailability(
    {
      id,
      displayName: String(agent?.displayName || agent?.title || agent?.name || id),
      provider: "foundry",
      description: String(agent?.description || agent?.summary || agent?.purpose || ""),
      tags,
      capabilities: normalizeCapability(agent)
    },
    normalizeAvailability(agent, fallbackHealth)
  );
}

function extractAgentRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const candidates = [payload.agents, payload.items, payload.value, payload.data, payload.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function candidateListUrls(endpoint) {
  const base = trimEndpoint(endpoint);
  const candidates = [
    `${base}/agents`,
    `${base}/api/agents`,
    `${base}/api/projects/agents`,
    `${base}/agents?api-version=2024-05-01-preview`,
    `${base}/api/agents?api-version=2024-05-01-preview`,
    `${base}/api/projects/agents?api-version=2024-05-01-preview`
  ];
  return [...new Set(candidates)];
}

function candidateInvokeUrls(endpoint, agentId) {
  const base = trimEndpoint(endpoint);
  const safeId = encodeURIComponent(String(agentId || "").trim());
  const candidates = [
    `${base}/agents/${safeId}:invoke`,
    `${base}/api/agents/${safeId}:invoke`,
    `${base}/agents/${safeId}/invoke`,
    `${base}/api/agents/${safeId}/invoke`,
    `${base}/agents/${safeId}:invoke?api-version=2024-05-01-preview`,
    `${base}/api/agents/${safeId}:invoke?api-version=2024-05-01-preview`,
    `${base}/agents/${safeId}/invoke?api-version=2024-05-01-preview`,
    `${base}/api/agents/${safeId}/invoke?api-version=2024-05-01-preview`
  ];
  return [...new Set(candidates)];
}

function createFallbackModelRouterManifest(health) {
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
    if (health.status !== "available") {
      return [];
    }

    const endpoint = trimEndpoint(getFoundryProjectEndpoint());
    const apiKey = String(getFoundryApiKey() || "").trim();
    const urls = candidateListUrls(endpoint);
    let lastError = null;

    for (const url of urls) {
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: {
            "api-key": apiKey
          }
        });
        const payload = await parseMaybeJson(response);
        if (!response.ok) {
          if (response.status === 404) {
            lastError = new Error(`List endpoint not found at ${url}`);
            continue;
          }
          throw new Error(
            String(payload?.error?.message || payload?.message || `Foundry list failed with HTTP ${response.status}`)
          );
        }

        const rows = extractAgentRows(payload);
        const normalized = rows
          .map((row) => normalizeAgentManifest(row, health))
          .filter(Boolean);

        if (normalized.length) {
          return normalized;
        }

        const hintedRouter = rows.length === 0
          ? null
          : createFallbackModelRouterManifest(health);
        if (hintedRouter) {
          return [hintedRouter];
        }
        return [];
      } catch (error) {
        lastError = error;
      }
    }

    logEvent("error", {
      component: "agents.foundry",
      eventType: "foundry.list_agents.failed",
      error: {
        code: "FOUNDRY_LIST_FAILED",
        message: lastError?.message || "Foundry agent discovery failed."
      }
    });
    return [];
  }

  async invoke(agentId, _messages, _context = {}) {
    const id = String(agentId || "").trim();
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return {
        ok: false,
        agentId: id || "unknown",
        provider: "foundry",
        error: {
          code: "FOUNDRY_UNAVAILABLE",
          message: health.reason || "Foundry is unavailable."
        }
      };
    }

    const endpoint = trimEndpoint(getFoundryProjectEndpoint());
    const apiKey = String(getFoundryApiKey() || "").trim();
    const urls = candidateInvokeUrls(endpoint, id);
    const requestBody = {
      agent_id: id,
      messages: Array.isArray(_messages) ? _messages : [],
      context: _context && typeof _context === "object" ? _context : {}
    };
    let lastError = null;

    for (const url of urls) {
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": apiKey
          },
          body: JSON.stringify(requestBody)
        });
        const payload = await parseMaybeJson(response);
        if (!response.ok) {
          if (response.status === 404) {
            lastError = new Error(`Invoke endpoint not found at ${url}`);
            continue;
          }
          return {
            ok: false,
            agentId: id,
            provider: "foundry",
            error: {
              code: "FOUNDRY_INVOKE_FAILED",
              message: String(
                payload?.error?.message ||
                  payload?.message ||
                  `Foundry invoke failed with HTTP ${response.status}`
              )
            },
            raw: payload
          };
        }

        return {
          ok: true,
          agentId: id,
          provider: "foundry",
          raw: payload,
          content:
            String(
              payload?.content ||
                payload?.text ||
                payload?.output_text ||
                payload?.message ||
                ""
            ) || ""
        };
      } catch (error) {
        lastError = error;
      }
    }

    logEvent("error", {
      component: "agents.foundry",
      eventType: "foundry.invoke.failed",
      error: {
        code: "FOUNDRY_INVOKE_FAILED",
        message: lastError?.message || "Foundry agent invoke failed."
      }
    });

    return {
      ok: false,
      agentId: id || "unknown",
      provider: "foundry",
      error: {
        code: "FOUNDRY_INVOKE_FAILED",
        message: lastError?.message || "Foundry agent invoke failed."
      }
    };
  }
}
