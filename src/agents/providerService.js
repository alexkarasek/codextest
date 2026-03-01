import { ClientSecretCredential } from "@azure/identity";
import { availableHealth, unavailableHealth } from "./providers/AgentProvider.js";
import { listModelCatalog } from "../../lib/modelCatalog.js";
import {
  getFoundryApiVersion,
  getFoundryApplications,
  getFoundryBearerToken,
  getFoundryClientId,
  getFoundryClientSecret,
  getFoundryProjectEndpoint,
  getFoundryRouterApplicationName,
  getFoundryRouterApplicationVersion,
  getFoundryTenantId,
  isFoundryConfigured,
  isFoundryEnabled
} from "../../lib/config.js";

const FOUNDRY_SCOPE = "https://ai.azure.com/.default";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function trimUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function parseMaybeJsonObject(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildPromptFromMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => {
      const role = String(message?.role || "user").trim() || "user";
      const content = String(message?.content || "").trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function extractResponseText(body = {}) {
  const direct = String(body?.output_text || body?.outputText || "").trim();
  if (direct) return direct;

  const rows = Array.isArray(body?.output) ? body.output : [];
  const parts = [];
  for (const row of rows) {
    const content = Array.isArray(row?.content) ? row.content : [];
    for (const item of content) {
      const text = String(item?.text || item?.output_text || item?.content || "").trim();
      if (text) parts.push(text);
    }
  }
  if (parts.length) return parts.join("\n\n");
  return "";
}

function normalizeFoundryApps() {
  const configured = getFoundryApplications();
  const routerApplicationName = String(getFoundryRouterApplicationName() || "").trim();
  const routerVersion = String(getFoundryRouterApplicationVersion() || "").trim();
  const rows = [...configured];

  if (routerApplicationName && !rows.some((row) => row.applicationName === routerApplicationName)) {
    rows.push({
      id: routerApplicationName,
      applicationName: routerApplicationName,
      displayName: routerApplicationName,
      description: "Configured Foundry router application.",
      tags: ["foundry", "router"],
      routesModels: true,
      version: routerVersion
    });
  }

  return rows.map((row) => ({
    ...row,
    version: String(row.version || routerVersion || "").trim()
  }));
}

async function getFoundryAccessToken({ credentialFactory } = {}) {
  const configuredToken = String(getFoundryBearerToken() || "").trim();
  if (configuredToken) return configuredToken;

  const tenantId = String(getFoundryTenantId() || "").trim();
  const clientId = String(getFoundryClientId() || "").trim();
  const clientSecret = String(getFoundryClientSecret() || "").trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Foundry credentials are incomplete. Set tenantId, clientId, and clientSecret.");
  }

  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt - 60_000 > now) {
    return cachedToken;
  }

  const factory =
    typeof credentialFactory === "function"
      ? credentialFactory
      : () => new ClientSecretCredential(tenantId, clientId, clientSecret);
  const credential = factory();
  const token = await credential.getToken(FOUNDRY_SCOPE);
  if (!token?.token) {
    throw new Error("Failed to acquire Foundry bearer token.");
  }
  cachedToken = token.token;
  cachedTokenExpiresAt = Number(token.expiresOnTimestamp || now + 5 * 60_000);
  return cachedToken;
}

export async function getFoundryProviderHealth(options = {}) {
  if (!isFoundryEnabled()) {
    return unavailableHealth("Foundry provider is disabled.");
  }

  const endpoint = trimUrl(getFoundryProjectEndpoint());
  if (!endpoint) {
    return unavailableHealth("Foundry project endpoint is missing.");
  }

  const applicationName = String(getFoundryRouterApplicationName() || "").trim();
  if (!applicationName) {
    return unavailableHealth("Foundry router application name is missing.");
  }

  if (!isFoundryConfigured()) {
    return unavailableHealth("Foundry credentials are incomplete.");
  }

  try {
    await getFoundryAccessToken(options);
    return availableHealth({
      reason: `Foundry application provider configured for ${applicationName}.`
    });
  } catch (error) {
    return unavailableHealth(`Foundry authentication failed: ${error?.message || "Unknown error."}`);
  }
}

export function listFoundryAgentManifests() {
  return normalizeFoundryApps().map((row) => ({
    id: row.id,
    displayName: row.displayName,
    provider: "foundry",
    description: row.description,
    tags: [...new Set(["foundry", ...(row.tags || [])])],
    capabilities: {
      routes_models: Boolean(row.routesModels),
      tool_calling: false,
      structured_output: true
    }
  }));
}

export function listProviderTargets() {
  const modelTargets = listModelCatalog().map((row) => ({
    id: row.id,
    type: "model",
    provider: row.effectiveProvider,
    providerLabel: row.providerLabel,
    label: row.label || row.id,
    deployment: row.deployment || null
  }));

  const agentTargets = normalizeFoundryApps().map((row) => ({
    id: row.id,
    type: "agent",
    provider: "foundry",
    providerLabel: "Azure AI Foundry",
    label: row.displayName,
    applicationName: row.applicationName,
    version: row.version || null,
    routesModels: Boolean(row.routesModels)
  }));

  return [...modelTargets, ...agentTargets];
}

export function getProviderTargetById({ type, provider, id } = {}) {
  const targetType = String(type || "").trim().toLowerCase();
  const targetProvider = String(provider || "").trim().toLowerCase();
  const targetId = String(id || "").trim();
  if (!targetType || !targetId) return null;
  return (
    listProviderTargets().find(
      (row) =>
        String(row.type || "").trim().toLowerCase() === targetType &&
        String(row.provider || "").trim().toLowerCase() === targetProvider &&
        String(row.id || "").trim() === targetId
    ) || null
  );
}

export async function invokeFoundryApplicationByName(
  applicationName,
  { input, messages = [], context = {}, fetchImpl, credentialFactory } = {}
) {
  const resolvedName = String(applicationName || "").trim();
  if (!resolvedName) {
    throw new Error("Foundry application name is required.");
  }

  const endpoint = trimUrl(getFoundryProjectEndpoint());
  if (!endpoint) {
    throw new Error("Foundry project endpoint is missing.");
  }

  const token = await getFoundryAccessToken({ credentialFactory });
  const transport = typeof fetchImpl === "function" ? fetchImpl : fetch;
  const url =
    `${endpoint}/applications/${encodeURIComponent(resolvedName)}/protocols/openai/responses` +
    `?api-version=${encodeURIComponent(getFoundryApiVersion())}`;

  const promptText = String(input || "").trim() || buildPromptFromMessages(messages);
  if (!promptText) {
    throw new Error("Foundry application input is required.");
  }

  const response = await transport(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input: promptText,
      ...(context && Object.keys(context).length ? { metadata: context } : {})
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(body?.error?.message || body?.detail?.message || body?.message || "").trim();
    throw new Error(
      message || `Foundry application request failed with HTTP ${response.status}.`
    );
  }

  return {
    text: extractResponseText(body),
    raw: body
  };
}

export async function routeModelsWithFoundryApplication(payload = {}, options = {}) {
  const applicationName = String(getFoundryRouterApplicationName() || "").trim();
  if (!applicationName) {
    return {
      ok: false,
      provider: "foundry",
      error: {
        code: "FOUNDRY_ROUTER_APP_MISSING",
        message: "Foundry router application is not configured."
      }
    };
  }

  const promptText = [
    String(payload.user_prompt || "").trim() || "Select the best model for the current request.",
    payload.intent ? `Intent: ${String(payload.intent).trim()}` : "",
    payload.constraints ? `Constraints: ${JSON.stringify(payload.constraints)}` : "",
    payload.available_models ? `Available models: ${JSON.stringify(payload.available_models)}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const started = Date.now();

  try {
    const result = await invokeFoundryApplicationByName(
      applicationName,
      {
        input: promptText,
        context: {
          purpose: "model-routing",
          requestedBy: "auto-router"
        },
        ...options
      }
    );
    const parsed = parseMaybeJsonObject(result.text);
    return {
      ok: true,
      provider: "foundry",
      raw: parsed || { text: result.text },
      content: result.text,
      latencyMs: Date.now() - started,
      applicationName
    };
  } catch (error) {
    return {
      ok: false,
      provider: "foundry",
      error: {
        code: "FOUNDRY_ROUTER_FAILED",
        message: error?.message || "Foundry router call failed."
      }
    };
  }
}
