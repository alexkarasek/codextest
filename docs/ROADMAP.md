# AI Workbench Hybrid Roadmap (Hardening + Workflow Automation)
You are Codex acting as a senior full-stack engineer + platform architect.
Goal: execute the roadmap in small, safe, testable increments with minimal behavior change.

## Non-Negotiables
- Preserve existing external behavior (UI flows, API contracts) unless explicitly noted.
- Every step must compile/run locally via Docker/Node dev flow.
- Add tests where practical; at minimum add smoke tests and one integration path per milestone.
- Add structured logging + correlation IDs as early as possible.
- No breaking changes to existing data files without a migration.

## Repo Discovery Tasks (do first)
1) Inventory architecture
   - Identify: app server, UI, LLM client, persona store, debate engine, tool runner (if any), file persistence model.
   - Document in `/docs/architecture/current.md` (1–2 pages).
2) Identify current persistence locations and data shapes:
   - Personas, scenarios, run outputs, logs, configs, user prefs, tool results.
   - Document in `/docs/data/current-data-model.md`.
3) Identify current execution model:
   - Are debates synchronous HTTP request lifecycle or background?
   - Document in `/docs/execution/current-execution.md`.

Deliverable: 3 docs + a diagram (mermaid OK).

---

# Phase 1: Event Log + Correlation IDs (foundation)
## Objective
Introduce an event model that can power “runs dashboard” and later heatmaps; doesn’t change behavior.

## Tasks
1) Add correlation IDs
   - Generate/requestId per incoming request and per “run”
   - Propagate through LLM calls and tool calls
2) Add structured logging
   - Use JSON logs
   - Include {timestamp, level, requestId, runId, component, eventType, latencyMs, error}
3) Implement Event Store (initially local)
   - Create `/packages/core/events/` (or similar)
   - Define Event schema (RunStarted, RunFinished, ToolInvoked, ToolFinished, LLMCallStarted, LLMCallFinished, Error)
   - Persist to a local file or lightweight DB (keep simple first)
4) Add minimal “Run History” UI/endpoint
   - Endpoint: GET /runs (recent), GET /runs/:id (details)
   - UI: simple list + detail view (or CLI output if no UI)

## Acceptance Criteria
- Running a debate generates events with a runId and requestId.
- Can view last N runs and their status, duration, estimated cost/tokens if available.
- Zero changes to debate results.

---

# Phase 2: Background Job Runner (queue + worker)
## Objective
Move long-running work (debates, ingestion, batch) off the request thread.
Keep API behavior: request returns a runId immediately and can poll.

## Tasks
1) Introduce a queue abstraction
   - Interface: enqueue(jobType, payload, opts) / dequeue / ack / fail
   - Start with Redis-based queue (BullMQ) OR a simple local queue for dev; choose one and document.
2) Create Worker service
   - New process/container: `worker`
   - Worker consumes jobs: `RUN_DEBATE`, `RUN_WORKFLOW`, `INGEST_DOCS`
3) Update API server
   - POST /debates/run -> enqueues job, returns runId
   - GET /runs/:id -> returns status + results when finished
4) Add idempotency + retries (basic)
   - Ensure re-processing doesn’t create duplicate run records
   - Retry policy: 3 attempts with backoff for transient errors

## Acceptance Criteria
- Debate runs execute in worker, not in web request.
- API responds quickly with runId and status becomes `completed` with same results as before.
- Worker failures are recorded in event log.

---

# Phase 3: Storage Split (metadata vs payload vs blobs)
## Objective
Break storage into best-practice modules without changing functional outputs.

## Target Storage (dev-friendly first)
- Relational (Postgres recommended): users/projects/runs metadata/events indexes
- Document store (optional initially): run payloads/persona/scenario JSON
- Object storage (local fs in dev): large outputs, exports, attachments
- Vector store: abstraction only in this phase (implementation later)

## Tasks
1) Define canonical domain models
   - `Run`, `RunArtifact`, `Persona`, `Scenario`, `Workflow`, `WorkflowRun`, `Event`
2) Implement repository interfaces
   - `RunRepository`, `EventRepository`, `PersonaRepository`, `WorkflowRepository`
3) Implement Postgres adapter (preferred)
   - Docker compose: add postgres + migrations (Prisma/Knex/Drizzle—pick one)
   - Store metadata + event indexes
4) Keep payloads in JSON (initially)
   - Option A: store payload JSON in Postgres JSONB
   - Option B: store payload JSON as files in `/data/runs/<runId>.json` and store pointer in Postgres
   - Choose A unless payload size becomes problematic
5) Migrate existing data
   - Write migration script to import existing personas/runs from file storage
   - Maintain backward compatibility: if DB empty, load from old storage once.

## Acceptance Criteria
- Existing personas still load; existing run outputs still accessible.
- Runs list uses DB-backed metadata.
- No user-visible behavior change.

---

# Phase 4: Tool Execution Sandbox (security boundary)
## Objective
Reduce vulnerability risk from tool calls while preserving tool functionality.

## Tasks
1) Introduce Tool Runner boundary
   - All tool executions routed through a “tool-runner” module/process
2) Implement allowlists and timeouts
   - Network allowlist (domains)
   - File system allowlist (paths)
   - Timeout per tool call
3) Secrets scoping
   - Tools only receive the secrets they need (capability tokens)
4) Add audit events
   - Log ToolInvoked/ToolFinished with args redaction and error details

## Acceptance Criteria
- All tool calls still work for existing demos.
- Tools cannot access arbitrary FS paths or external domains outside allowlist.
- Timeouts fail gracefully and are observable.

---

# Phase 5: Workflow Automation (MVP)
## Objective
Add standard automation workflows (Trigger → Conditions → Actions) integrated with run system.

## Core Concepts
- Workflow: {id, name, enabled, trigger, steps[]}
- Triggers: cron, webhook, runCompleted (debate finished), manual
- Steps: condition, httpRequest, sendMessage(slack/teams placeholder), runDebate, transform, persistRecord

## Tasks
1) Add Workflow model + storage
   - CRUD: create/update/enable/disable/list
2) Add Trigger engine
   - Cron scheduler (node-cron or similar)
   - Webhook endpoint: POST /workflows/:id/trigger
   - Event-driven trigger: on RunFinished fire workflow(s)
3) Add Action runner (in worker)
   - Workflow executes as a job type: `RUN_WORKFLOW`
4) Add Human approval step (optional but recommended)
   - A step that pauses and requires manual approve/reject in UI
5) UI
   - Simple workflow list + details + run history
   - Buttons: “Run now”, “Enable”, “Disable”

## Acceptance Criteria
- Can create a cron workflow that runs a debate daily and posts results to a log (or stub connector).
- Can trigger workflow via webhook.
- Workflow runs show up as runs/events like debates.

---

# Phase 6: Evaluation Scorecard (non-GenAI, high value)
## Objective
Add run scoring and regression detection to support iteration and demos.

## Tasks
1) Define evaluation metrics
   - latency, cost/tokens, tool success rate, refusal rate, groundedness heuristic (basic)
2) Store scores per run
3) UI: scorecard panel on run details
4) Basic comparison view: run A vs run B diff

## Acceptance Criteria
- Every run gets a score object stored and viewable.
- Can compare last 2 runs of the same scenario.

---

# Execution Instructions for Codex
For each phase:
1) Create a phase branch (phase-1-events, phase-2-worker, etc.)
2) Make small commits per logical unit.
3) After each commit:
   - run lint + tests + local smoke
   - update docs for changed components
4) Provide a short PR-style summary at end:
   - What changed
   - How to run/test
   - Any migrations

## Smoke Test Checklist (automate if possible)
- `npm test` or equivalent
- Start stack: `docker compose up`
- Create persona → run debate → see run in /runs
- Run workflow manually → verify run/events

## IMPORTANT: Ask Me Only If Blocked
If a decision is required and repo evidence is insufficient:
- Present 2–3 options with tradeoffs, choose a default, proceed.