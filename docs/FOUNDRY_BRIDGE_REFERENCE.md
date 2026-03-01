# Foundry Bridge Integration (New Foundry Project Model)

## 1. Objective
Implement Foundry Agents integration in the Workbench WITHOUT hard dependency on Foundry assets/config.

Because the JS SDK and REST routes differ across tenants/preview versions, use a small Python service
("Foundry Bridge") that follows the Foundry portal’s working sample pattern:

- AIProjectClient(project endpoint, Entra OAuth credential)
- openai_client = project_client.get_openai_client()
- openai_client.responses.create(... extra_body.agent = {name, version, type:"agent_reference"})

Workbench will call the bridge over HTTP.

This enables:
- stable agent invocation today
- optional Foundry support (local-first)
- later upgrade to agent discovery via SDK

---

## 2. Architecture

### 2.1 Components
1) Workbench (Node/TS):
   - continues to own UI + local agents + local model providers
   - adds FoundryProvider that talks to bridge
   - remains fully runnable with Foundry disabled

2) Foundry Bridge (Python FastAPI):
   - only runs when Foundry config is provided
   - handles OAuth client credential token flow via Azure Identity
   - invokes Foundry agents using “Responses + agent_reference”
   - exposes simple REST endpoints to Workbench

### 2.2 Design principles
- Foundry is OPTIONAL.
- Workbench must run fully without bridge/Foundry.
- Bridge provides stable interface regardless of Foundry API churn.
- Agent listing can start as STATIC registry, then upgraded to SDK discovery.

---

## 3. Configuration

### 3.1 Workbench env
- FOUNDRY_BRIDGE_ENABLED=true|false (default false)
- FOUNDRY_BRIDGE_URL=http://localhost:8787

### 3.2 Bridge env (OAuth / Service Principal)
- FOUNDRY_PROJECT_ENDPOINT=https://<account>.services.ai.azure.com/api/projects/<project>
- AZURE_TENANT_ID=...
- AZURE_CLIENT_ID=...
- AZURE_CLIENT_SECRET=...

### 3.3 Router agent config (bridge)
- FOUNDRY_ROUTER_AGENT_NAME=model-router
- FOUNDRY_ROUTER_AGENT_VERSION=2

Optional:
- FOUNDRY_AGENT_REGISTRY_PATH=./agents.registry.json

---

## 4. Bridge API Contract (HTTP)

### 4.1 Health
GET /health
Returns:
{
  "ok": true|false,
  "details": { ... }
}

Health check MUST:
- acquire credential
- perform a minimal call to verify access (either list agents if supported, or a no-op invoke to router agent)

### 4.2 List Agents (MVP)
GET /foundry/agents
Returns:
{
  "ok": true,
  "data": {
    "agents": [ AgentManifest... ]
  }
}

MVP behavior:
- read from static registry file (agents.registry.json)
- do NOT attempt dynamic listing until confirmed in SDK

### 4.3 Invoke Router (MVP)
POST /foundry/router
Body:
{
  "user_prompt": "...",
  "intent": "...",
  "constraints": { "priority": "...", "needs_json": true|false, "needs_tools": true|false },
  "available_models": [ { "model_id": "...", "provider":"...", "tier":"mini|standard|premium|oss" } ]
}

Returns:
{
  "ok": true,
  "data": {
    "router_output": { "selected_model_id": "...", "fallback_model_id": "...", "rationale": "...", "scores": {...} },
    "raw_text": "..." (optional),
    "latency_ms": 123
  }
}

### 4.4 Invoke Any Agent (Phase 2)
POST /foundry/agents/{name}/{version}/invoke
Body:
{
  "messages": [ { "role": "user|assistant|system", "content": "..." } ]
}

Returns:
{
  "ok": true,
  "data": {
    "output_text": "...",
    "raw": { ... }
  }
}

---

## 5. Foundry Invocation Implementation (Bridge)

### 5.1 Python packages
- azure-ai-projects (>= 2.x beta series matching portal samples)
- azure-identity
- fastapi + uvicorn

### 5.2 Invocation pattern (MUST follow portal sample)
- Create AIProjectClient(endpoint, credential)
- openai_client = project_client.get_openai_client()
- openai_client.responses.create(
    input=[{"role":"user","content": "..."}],
    extra_body={"agent": {"name": NAME, "version": VERSION, "type": "agent_reference"}}
  )

Important:
- Use Entra OAuth credential (ClientSecretCredential recommended).
- Do not implement classic assistants/threads unless explicitly needed.

---

## 6. Workbench Integration Requirements

### 6.1 Provider inventory
Workbench /api/providers should include:
- local provider
- foundry provider (enabled=FOUNDRY_BRIDGE_ENABLED)
- foundry health derived from bridge /health

### 6.2 Agent picker
- Show "Foundry Agents" section only if foundry provider enabled
- listAgents uses bridge /foundry/agents

### 6.3 Router feature
- Add model selection “Auto (Router Agent)”
- When selected:
  1) POST /foundry/router
  2) parse JSON; if invalid -> fallback to default routing
  3) run model call using selected model provider

### 6.4 Local-first behavior
If bridge disabled/unreachable:
- Workbench must function normally
- Foundry provider shows unavailable
- Router falls back to default

---

## 7. Agent Registry (MVP)
Create file: agents.registry.json

Example:
[
  {
    "id": "foundry:model-router:2",
    "displayName": "Model Router",
    "provider": "foundry",
    "description": "Selects the best model based on prompt + constraints.",
    "tags": ["router","demo"],
    "agentName": "model-router",
    "agentVersion": "2",
    "capabilities": { "routes_models": true, "structured_output": true }
  }
]

Bridge will return these as AgentManifest.

---

## 8. Testing Plan (Step-by-step)

### 8.1 Bridge local test
1) Start bridge
2) GET /health -> ok true
3) POST /foundry/router with sample payload -> returns selected model

### 8.2 Workbench test
1) Run workbench with bridge disabled -> normal behavior
2) Enable bridge -> providers show foundry available
3) Agent picker shows foundry agents
4) Use Auto Router -> selects model and runs chat

---

## 9. Implementation Phases for Codex

Phase 1 (MVP):
- Add Python FastAPI bridge with /health, /foundry/agents (static registry), /foundry/router
- Add docker-compose to run bridge locally
- Add Workbench FoundryProvider that calls bridge
- Implement Auto Router feature

Phase 2:
- Add generic /invoke endpoint for any foundry agent
- Improve registry + caching

Phase 3:
- Replace static registry with SDK-based agent discovery IF confirmed stable
- Add optional tool support, logging, metrics