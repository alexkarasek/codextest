# Foundry Agents (New Project Model) — Workbench Integration Reference (for Codex)

## 0) What problem this document solves
Implement **optional** integration between the Workbench app and **Microsoft Foundry Agents** using the **new Foundry Project model** (project endpoint + Entra auth), supporting:

1. **Provider discovery** (list Foundry agents and show them in the Workbench agent picker)
2. **Chat/invoke** a Foundry agent from the Workbench runtime
3. Local-first behavior: Workbench runs fully without Foundry configured

This doc is written so Codex can implement the integration without guessing which “agent API” variant applies.

---

## 1) Terminology (avoid the classic-vs-new confusion)

### 1.1 Foundry Project endpoint (new model)
A Foundry **Project** exposes a single endpoint shaped like:

`https://{ai-services-account-name}.services.ai.azure.com/api/projects/{project-name}` :contentReference[oaicite:0]{index=0}

Example (your tenant):
`https://akcloudlabs-ai-foundry2.services.ai.azure.com/api/projects/proj-default`

This is **not** the classic Azure OpenAI resource endpoint (`https://{resource}.openai.azure.com`).

### 1.2 “New” agent APIs: split responsibility across clients
Microsoft guidance (new agent service) is:

- **Agent creation/versioning** is performed via the **project client**.
- **Conversations/responses** (chat) are performed via an **OpenAI client** obtained from the project client:
  `project_client.get_openai_client()` :contentReference[oaicite:1]{index=1}

---

## 2) The two integration surfaces you must support

### Surface A — Recommended (New Project Model): Responses API + AgentReference
In the new model, you can “chat with an agent” by calling the **Responses API** and attaching an **agent reference** (name + version). This is the approach used throughout the new agent service guidance and SDK docs. :contentReference[oaicite:2]{index=2}

Key properties:
- Invokes agent using **name + version** (no `asst_...` required)
- Uses the **OpenAI client** from `AIProjectClient`
- Best aligned with the “new Foundry project model”

### Surface B — Agent Service REST (classic semantics): assistants/threads/runs with `asst_...`
Foundry also exposes a classic Assistants-style REST surface (threads/runs/messages) that requires `assistant_id` values typically prefixed `asst_`. Example operations include “Create Thread And Run”, “Get Run”, and message operations. :contentReference[oaicite:3]{index=3}

Key properties:
- Requires `assistant_id`
- Thread/run lifecycle
- Useful for low-level operations and explicit “assistant_id” flows

**Important:** If your code throws “assistant id must start with asst”, you are calling Surface B but do not have the id.

---

## 3) Authentication reality (what to implement)
Foundry project endpoints and the new agent service are designed for **Entra ID (OAuth)** in most enterprise configurations, as reflected by official quickstarts and SDK usage via credential providers. :contentReference[oaicite:4]{index=4}

### 3.1 Workbench must support Service Principal auth (client credentials)
Implement Service Principal flow:
- Tenant ID
- Client ID
- Client Secret (or certificate later)

The quickstart guidance shows token acquisition using Azure CLI and a `.default` scope. :contentReference[oaicite:5]{index=5}

### 3.2 Do NOT assume API-key works
Do not build the provider assuming `api-key` is sufficient. Some tenant/project configs are OAuth-only.
If you support `api-key`, treat it as optional/fallback.

---

## 4) Recommended architecture in the Workbench (local-first + optional Foundry)

### 4.1 Provider model
Workbench should have a provider abstraction:
- AgentProvider: local | foundry
- ModelProvider: openai(api) | azure(openai) | foundry(models) (optional)

Foundry integration must be a **plugin**:
- If Foundry config missing → provider disabled (no crashes)
- If auth fails → provider unavailable with readable reason
- Local agents always function

### 4.2 Configuration (suggested)
Required for Foundry OAuth mode:
- `FOUNDRY_ENABLED=true`
- `FOUNDRY_PROJECT_ENDPOINT=https://.../api/projects/...` :contentReference[oaicite:6]{index=6}
- `FOUNDRY_AUTH_MODE=oauth`
- `AZURE_TENANT_ID=...`
- `AZURE_CLIENT_ID=...`
- `AZURE_CLIENT_SECRET=...`

Optional:
- `FOUNDRY_API_VERSION=v1` (only needed if you use REST Surface B)
- `FOUNDRY_AGENT_LIST_MODE=sdk|rest` (see section 6)
- `FOUNDRY_AGENT_INVOKE_MODE=responses|threads` (see section 7)
- caching TTL vars for listAgents()

---

## 5) Implementing “list agent providers” and “list agents”

### 5.1 Provider listing (Workbench-internal)
Workbench should always return a providers inventory like:
- local provider: enabled=true, available=true
- foundry provider: enabled=depends on config; health status determined by a real call

### 5.2 Listing Foundry agents (two valid methods)

#### Method 1 (Preferred): SDK-based agent listing
Use the Azure AI Projects SDK to list agents from the project.
The python package states that the `.agents` property on the client provides agent operations. :contentReference[oaicite:7]{index=7}

This avoids guessing REST routes and handles preview churn better.

**Implement:**
- Acquire credential (service principal)
- Create AIProjectClient
- Call a list function via the SDK agent operations
- Normalize each item into Workbench `AgentManifest`

#### Method 2: REST-based listing (Agent Service REST Surface B)
If you must use REST, use the AI Foundry agent service reference operations (v1).
This includes list and run/message operations with `api-version=v1`. :contentReference[oaicite:8]{index=8}

**Implement:**
- GET `{endpoint}/... ?api-version=v1`
- Use OAuth bearer token
- Extract agent/assistant ids (`asst_...`), names, and metadata

**Note:** Route naming in preview may vary; prefer SDK when possible.

---

## 6) Health checks (Foundry provider “available/unavailable”)
Health check must be more than “endpoint reachable”.

### Required health steps
1. Acquire token (OAuth mode)
2. Call “list agents” (SDK preferred)
3. If list succeeds → health=available
4. If list fails → health=unavailable with status code + message

This is required because some endpoints do not expose a root health route, but list operations prove actual functionality.

---

## 7) Chat / invoke a Foundry agent (the “new model” way)

### 7.1 Preferred invoke: Responses API + AgentReference (Surface A)
New agent service guidance states:
- conversations/responses APIs use an OpenAI client obtained via `project_client.get_openai_client()` :contentReference[oaicite:9]{index=9}
- Samples show creating an AgentReference (name + version) and using a project responses client bound to that agent reference. :contentReference[oaicite:10]{index=10}

**Implementation intent (language-agnostic):**
- Create AIProjectClient with Foundry project endpoint and OAuth credential
- Obtain OpenAI client via `get_openai_client()`
- Invoke `responses.create(...)` (or equivalent) and pass agent reference:
  - agent name
  - agent version
  - type indicating agent reference (SDK helper or extra_body, depending on language)

**Why:**
- Avoids `assistant_id asst_...` mismatch
- Aligns to “new Foundry project model” invocation

### 7.2 Alternate invoke: Threads/Runs (Surface B) when needed
If Workbench chooses the classic “threads/runs” model, it must:
- have `assistant_id` (asst_...)
- create thread and run, poll run status, fetch messages

The v1 REST reference documents run and message operations. :contentReference[oaicite:11]{index=11}

---

## 8) Workbench AgentManifest mapping
Normalize Foundry agents into:

- `id`: prefer the SDK id; if threads-mode, store `assistant_id` (asst_...)
- `displayName`: agent name
- `provider`: `"foundry"`
- `description`: optional
- `tags`: include `router`, `demo`, etc. based on name/metadata
- `capabilities`: infer from metadata or configure
- `availability`: based on health + any per-agent checks

**Store both identifiers if available:**
- `agentName` + `agentVersion` for responses-mode invocation
- `assistant_id` for threads-mode invocation

This allows Workbench to switch invoke modes without re-listing.

---

## 9) “Model Router” agent requirements (Foundry-hosted)
The router agent selects among available models and returns strict JSON.

### Input contract (Workbench → agent)

{
"user_prompt": string,
"intent": string,
"constraints": {
"priority": "cost"|"latency"|"quality"|"balanced",
"needs_json": boolean,
"needs_tools": boolean
},
"available_models": [
{ "model_id": string, "provider": string, "tier": "mini"|"standard"|"premium"|"oss" }
]
}


### Output contract (agent → Workbench)

{
"selected_model_id": string,
"fallback_model_id": string|null,
"rationale": string,
"scores": { "cost": 0-10, "latency": 0-10, "quality": 0-10, "json_reliability": 0-10 }
}


Workbench behavior:
- Parse JSON output
- If invalid/missing fields → fallback to default routing logic
- Never block user interaction

---

## 10) Testing plan (what Codex should implement)

### 10.1 Unit tests
- Config gating (provider disabled when missing)
- Token acquisition error handling (oauth)
- listAgents normalization to AgentManifest
- Router output parsing + fallback logic

### 10.2 Integration tests (recommended)
- Mock provider calls for listAgents and invoke
- Optional “live mode” test runner:
  - uses env vars
  - lists agents from Foundry project
  - invokes router agent in responses-mode

---

## 11) Key sources Codex should follow (do not guess)
- New agent service guidance: OpenAI client via `project_client.get_openai_client()` for conversations/responses; agent creation/versioning stays on project client. :contentReference[oaicite:12]{index=12}
- Foundry project endpoint format for REST reference. :contentReference[oaicite:13]{index=13}
- AI Projects SDK provides agent operations via `.agents` and uses Responses protocol extensions. :contentReference[oaicite:14]{index=14}
- v1 REST reference for run/message lifecycle if implementing threads/runs. :contentReference[oaicite:15]{index=15}
- Quickstart shows token acquisition pattern and warns about SDK major-version incompatibilities. :contentReference[oaicite:16]{index=16}

---

## 12) Implementation priorities (recommended order)
1. OAuth service principal auth + token acquisition
2. AIProjectClient creation using Foundry project endpoint
3. listAgents via SDK (preferred)
4. invoke router agent via responses-mode (AgentReference)
5. UI: Foundry provider + agent list + “Auto (Router Agent)”
6. Optional: threads/runs mode support only if required