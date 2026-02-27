# UI Navigation Map

## Top-level layout

- Top bar:
  - `Menu` (auth, documentation, support, help)
  - app title/subtitle
- Primary tabs:
  - `1. Chats`
  - `2. Governance`
  - `3. Admin & Config`

## Tab: Chats

### Subtab: Simple Chat
Purpose:
- Single-assistant chat with optional knowledge packs.
- Optional side-by-side model comparison for the same prompt.

Main areas:
- Left: chat history list + load controls
- Right: session setup + message composer + thread

### Subtab: Persona Chat
Purpose:
- Multi-persona collaboration and debate workflows.

Group workspace toggles:
- `Live Group Chat`: free-form multi-persona conversation
- `Conversation Explorer`: browse prior conversations and flags

In `Live Group Chat`, you can:
- attach knowledge packs to ground the entire session
- open **Structured Debate Run** inside Session Configuration
- use **Debate Mode Template** to carry selected personas/knowledge/context into those options
- choose interaction mode: `chat`, `panel`, or `debate-work-order` (orchestrator routes responses each turn)

## Tab: Governance
Purpose:
- Monitoring and analysis.

Main areas:
- KPI matrix cards
- visual charts
- drillable details by conversation/persona/model/user
- Governance Admin Chat (admin-focused QA over governance data)
- Observability overlays (LLM/orchestration/payload/tool counters)

## Tab: Admin & Config

### Personas
- Persona list with search/filter
- Create/edit form
- Preview panel

### Knowledge Studio
- Upload -> convert into knowledge pack
- Web ingest -> preview URL and convert into knowledge pack
- Web access policy -> allowlist/denylist domains
- Knowledge pack library list

### Responsible AI
- Red/yellow keyword configuration
- Sentiment keyword and threshold configuration

### Theme
- Theme editor for UI variables + typography
- Live preview of current theme tokens

### Agentic
- Task builder
- Step builder
- Task monitor
- Pending approvals
- Tool catalog
- Metrics and events

### Users & Access
- Current session summary
- Login/logout and API key generation
- User administration
- Usage-by-user summary
- Demo Reset controls (admin): usage-only reset or full reseed with keep toggles

## System menu (global)
- Login / Switch User
- Logout
- Documentation
- Support
- Help & Guides
- Users & Access shortcut

## Best-practice flow by user intent

- "I want to chat quickly":
  - `Chats` -> `Simple Chat`
- "I want multiple personas to collaborate":
  - `Chats` -> `Persona Chat` -> `Live Group Chat`
- "I want a debate mode transcript":
  - `Chats` -> `Persona Chat` -> `Live Group Chat` -> `Structured Debate Run`
- "I want to review prior conversations":
  - `Chats` -> `Persona Chat` -> `Conversation Explorer`
- "I want metrics and risk/cost views":
  - `Governance`
- "I want to edit personas/knowledge/security settings":
  - `Admin & Config`

## Related pages outside main canvas
- Documentation module: `/documentation`
- Swagger API docs: `/docs/api`
- OpenAPI spec: `/docs/openapi.yaml`
- Support Concierge: `/support`
