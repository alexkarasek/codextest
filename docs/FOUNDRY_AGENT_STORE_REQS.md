# Foundry Agent Store Integration

## 1. Overview

Add Azure AI Foundry as an OPTIONAL Agent Store provider in the workbench platform.

Foundry must:
- Be completely optional
- Never be required for core functionality
- Be discoverable and configurable
- Gracefully degrade if unavailable

Initial Foundry-hosted agent to support:
- Model Router Agent

---

## 2. Goals

1. Introduce a pluggable `AgentProvider` abstraction.
2. Implement `FoundryAgentProvider` as an optional provider.
3. Allow discovery and selection of Foundry-hosted agents.
4. Implement invocation of a Foundry-hosted Model Router agent.
5. Preserve full local-only execution when Foundry is not configured.

---

## 3. Non-Goals (Phase 1)

- No migration of existing concierge agent to Foundry.
- No requirement that any feature depend on Foundry.
- No publishing of local agents to Foundry.
- No advanced auth (Managed Identity) in Phase 1.
- No knowledge ingestion pipeline integration.

---

## 4. Configuration

Foundry integration is enabled ONLY when:


FOUNDRY_ENABLED=true
FOUNDRY_PROJECT_ENDPOINT=<endpoint>
FOUNDRY_API_KEY=<key>


Default behavior:
- If `FOUNDRY_ENABLED` is missing or false → provider not registered.
- If endpoint or key missing → provider registered but unavailable.
- No application crash allowed due to misconfiguration.

---

## 5. Architecture Changes

### 5.1 Introduce AgentProvider Interface

All agent providers must implement:

- `isEnabled(): boolean`
- `healthCheck(): Promise<HealthStatus>`
- `listAgents(): Promise<AgentManifest[]>`
- `invoke(agentId, messages, context): Promise<AgentResponse>`

Existing local agents must be refactored behind `LocalAgentProvider`.

---

### 5.2 Agent Manifest (Normalized Format)

All agents (local and Foundry) must map to:


{
id: string,
displayName: string,
provider: "local" | "foundry",
description: string,
tags: string[],
capabilities: {
routes_models?: boolean,
tool_calling?: boolean,
structured_output?: boolean
},
availability: {
status: "available" | "unavailable",
reason?: string
}
}


UI must rely only on this normalized format.

---

## 6. FoundryAgentProvider (Phase 1 Scope)

### 6.1 Behavior

- Registers only if `FOUNDRY_ENABLED=true`.
- Uses API key auth in Phase 1.
- Implements health check using project endpoint.
- Lists agents from Foundry project.
- Normalizes Foundry agent metadata into AgentManifest.
- Implements invocation.

### 6.2 Failure Handling

- If health check fails → mark provider unavailable.
- If list fails → return empty array with error logged.
- If invoke fails → return structured error; do not crash runtime.

---

## 7. Model Router Agent (Foundry Hosted)

### 7.1 Purpose

Select the most appropriate model from available models based on:

- User prompt
- Intent
- Constraints (cost, latency, quality, JSON, tools)
- Available model metadata

### 7.2 Input Contract

Workbench sends:


{
user_prompt: string,
intent: string,
constraints: {
priority: "cost" | "latency" | "quality" | "balanced",
needs_json: boolean,
needs_tools: boolean
},
available_models: [
{
model_id: string,
provider: string,
tier: "mini" | "standard" | "premium" | "oss"
}
]
}


### 7.3 Output Contract

Router returns structured JSON:


{
selected_model_id: string,
fallback_model_id?: string,
rationale: string,
scores?: {
cost?: number,
latency?: number,
quality?: number,
json_reliability?: number
}
}


Application must:
- Attempt JSON parse.
- If parse fails → fall back to default routing logic.
- Never block user interaction.

---

## 8. UI Requirements

### 8.1 Agent Picker

- Display two sections:
  - Local Agents
  - Foundry Agents (if enabled)

- If Foundry not configured:
  - Show “Connect Foundry” informational panel.

### 8.2 Router Integration

Add model selection option:
- “Auto (Router Agent)”

If selected:
1. Invoke Router agent.
2. Select model.
3. Execute request using chosen model provider.
4. Display selected model and rationale.

If Router unavailable:
- Fall back to default model selection.
- Display non-blocking warning.

---

## 9. Observability

Log:
- Provider registration state
- Health check results
- Agent invocation timing
- Routing decisions

Never log:
- API keys
- Raw sensitive prompts in production mode

---

## 10. Testing Requirements

### Unit Tests
- Manifest normalization
- Provider gating behavior
- Router JSON parsing
- Fallback routing logic

### Integration (Optional Phase 1.5)
- Mock Foundry endpoint for list + invoke
- Validate graceful failure behavior

---

## 11. Acceptance Criteria

1. App runs normally with no Foundry config.
2. Foundry agents appear only when configured.
3. Router agent can be selected and invoked.
4. Router successfully selects between GPT-5-mini, GPT-4o-mini, Llama 3.3, etc.
5. Failure of Foundry does not break local functionality.
6. No hard dependency on Foundry in core runtime.

---

## 12. Implementation Phases

Phase 1:
- Introduce AgentProvider abstraction
- Refactor LocalAgentProvider
- Add FoundryAgentProvider skeleton (config + health)

Phase 2:
- Implement listAgents + manifest normalization

Phase 3:
- Implement invoke + Router integration

Phase 4:
- UI polish + fallback behavior + logging