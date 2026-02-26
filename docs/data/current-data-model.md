# Current Data Model and Persistence Locations

## Persistence Strategy
The system uses file-based persistence only. Core data is stored under `data/` using:
- JSON files for entity/session records
- JSONL append logs for message/event-like streams
- Markdown transcripts/summaries where useful
- Binary/image files for generated media and logo assets

## Top-Level Data Paths
- `data/personas/`
  - `<id>.json`: canonical persona object
  - `<id>.md`: human-readable persona summary
- `data/knowledge/`
  - `<id>.json`: knowledge pack content + metadata
- `data/debates/<debateId>/`
  - `session.json`: debate session metadata/settings/status
  - `transcript.md`: debate transcript
  - `messages.jsonl`: raw LLM request/response diagnostics
  - `chat.jsonl`: follow-up debate chat exchanges
- `data/persona-chats/<chatId>/`
  - `session.json`
  - `messages.jsonl`
- `data/simple-chats/<chatId>/`
  - `session.json`
  - `messages.jsonl`
- `data/agentic/`
  - `tasks/*.json`: task definitions + execution state
  - `approvals/*.json`: manual approval records
  - `jobs/*.json`: job records
  - `watchers/*.json`: watcher configs
  - `task-events.jsonl`: task-level event stream
  - `tool-usage.jsonl`: tool invocation stream
  - `task-templates.json`: reusable task templates
  - `reports/*`, `autonomy/*`, `notes/*`: generated outputs
- `data/support/`
  - `messages.jsonl`: support concierge conversation logs
- `data/images/`
  - `<imageId>.json`: image metadata
  - `<imageId>.png`: generated image binary
  - `logo/*`: uploaded logo assets
- `data/settings/`
  - app settings and governance artifacts (theme, deletion audit, etc.)

## Important Entity Shapes (Current)

### Persona (`data/personas/<id>.json`)
Common fields:
- `id`, `displayName`, `role`, `description`, `systemPrompt`
- `speakingStyle` `{ tone, verbosity, quirks[] }`
- `expertiseTags[]`, `biasValues[]|string`, `debateBehavior`
- optional `knowledgePackIds[]`, `toolIds[]`, `avatar`
- lifecycle flags: `isHidden`, `isArchived`, delete metadata

### Debate Session (`data/debates/<debateId>/session.json`)
Common fields:
- identity/mode: `debateId`, `conversationMode`
- inputs: `topic`, `context`, `personas[]`, `knowledgePacks[]`
- settings: rounds/model/temperature/max words/moderation/source grounding
- state: `status`, `progress`, `turns[]`, timestamps
- selection metadata for dynamic persona selection

### Chat Sessions (`simple` and `persona`)
- `session.json` captures title/context/settings/user metadata/status
- `messages.jsonl` captures ordered messages with role-specific fields
- persona chats may include orchestration traces and tool execution annotations

### Knowledge Pack (`data/knowledge/<id>.json`)
Common fields:
- `id`, `title`, `description`, `tags[]`, `content`
- optional source and ingestion metadata
- lifecycle flags (`isHidden`, `isArchived`) when applicable

### Agentic Task (`data/agentic/tasks/*.json`)
Common fields:
- task metadata: `id`, `title`, `objective`, `status`, timestamps
- settings/team/routing
- `steps[]` with type (`tool|llm|job`), dependencies, result/error, approval state
- optional summary/output fields

## Config and Preferences
- Runtime settings are loaded from `settings.local.json` and/or env (see `lib/config.js`).
- UI theme settings persisted in `data/settings/`.
- Auth/users/API keys/session state persisted via `lib/auth.js` in `data/settings/`.

## Logs and Diagnostics
- Debate diagnostic logs: `messages.jsonl` per debate
- Task/tool logs: `data/agentic/task-events.jsonl`, `data/agentic/tool-usage.jsonl`
- Usage audit: auth middleware appends usage logs via `lib/auth.js`
- Support interactions: `data/support/messages.jsonl`
