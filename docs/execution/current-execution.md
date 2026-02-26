# Current Execution Model

## API Request Lifecycle
1. Request enters Express app (`server/index.js`).
2. Auth context is attached (`attachAuth`) and usage audit hooks are registered.
3. Route handler validates payload (usually Zod schemas in `lib/validators.js`).
4. Route calls domain/service/storage modules.
5. Route returns JSON envelope `{ok:true|false,...}`.

## Conversation Modes

### Simple Chat
- Trigger: `POST /api/simple-chats/:chatId/messages`
- Execution: synchronous within request lifecycle.
- Behavior: prompt assembly + optional knowledge grounding + LLM call + response persistence.

### Persona Chat (Group/Panel/Debate-work-order style)
- Trigger: `POST /api/persona-chats/:chatId/messages`
- Execution: synchronous within request lifecycle.
- Behavior: orchestrator chooses responders, persona prompts are built, optional tool use may occur, responses persisted.

### Debate Run
- Trigger: `POST /api/debates`
- Creation + queuing happens in route.
- Actual debate execution is asynchronous from the initial response but still in-process:
  - Route appends debate work onto a process-local promise chain (`runQueue`) in `server/routes/debates.js`.
  - Worker model is **not** separate yet; no external queue backend is used.
  - Debate steps run sequentially in `lib/orchestrator.js` and update `session.json` progress while appending transcript/messages.

## Agentic Tasks
- Trigger: `/api/agentic` routes.
- Execution model:
  - Task definitions are persisted.
  - `runTask` executes steps sequentially with dependency checks.
  - Approval-gated steps pause execution until approved.
  - Tool and task event artifacts are appended to JSON/JSONL stores.
- This is currently app-process execution; no dedicated background worker container yet.

## Concurrency Characteristics
- Debate runs are serialized through one in-memory queue in the web process.
- Other operations are request-driven and may run concurrently depending on Node event loop and I/O.
- File writes are append/update operations without central transaction manager.

## Reliability Implications (Current)
- Restarting server clears in-memory queue state but persisted sessions/logs remain on disk.
- No distributed lock/queue means scale-out across multiple server processes is not coordinated.
- Per-feature append logs (JSONL) provide recoverable traces for diagnostics.
