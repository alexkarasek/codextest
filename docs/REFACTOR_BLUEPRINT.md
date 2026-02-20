# Refactor Blueprint: Agentic AI Workbench

## Purpose
Stabilize and modularize the current local-first workbench so it is easier to maintain, safer to extend, and ready for future enhancements (multimodal, broader deployment, richer agentic orchestration) without breaking current API/UI behavior.

## Current Strengths (Preserve)
- Local-first persistence and inspectable artifacts under `data/`
- Broad feature coverage: simple chat, persona chat, debates, governance, support, agentic tasks/tools/MCP
- Clear route segmentation in `server/routes/*`
- Strong practical governance signals (risk/sentiment/cost/tokens/user usage)
- Good docs and support grounding patterns

## Current Constraints (Refactor Drivers)
- `client/app.js` is too large and couples UI rendering, state, data fetching, and orchestration behavior.
- Cross-cutting logic exists in route handlers (validation + business logic + persistence + response shaping interleaved).
- Chat/debate/persona orchestration policies are hard to tune consistently due to dispersed logic.
- Tool execution UX state is not fully unified with backend telemetry semantics.
- Scaling new capabilities (voice/multimodal, richer workflows) will increase complexity quickly.

## New Requirements (Approved)
- Re-evaluate dedicated Debate module and consolidate into a unified conversation model where "debate" is a mode of multi-persona chat, alongside simple chat, group chat, and panel/work-order styles.
- Relabel UI screens/tabs/modules to reflect conversation modes rather than separate debate silos.
- Expand governance/admin visibility to include deeper operational data:
  - orchestration decisions and activities
  - prompt/payload traces (with masking/redaction)
  - per-turn token consumption and estimated cost details
  - tool execution linkage to conversation exchanges

## Target Architecture

### 1) Layered backend modules
- `server/routes/*`: HTTP adapters only (parse request, call service, map response/errors)
- `src/services/*`: business workflows (chat run, debate run, governance queries, task execution control)
- `src/domain/*`: pure domain policies/rules (speaker selection, scope checks, risk scoring, routing heuristics)
- `src/repositories/*`: file persistence adapters over `lib/storage.js`-style primitives
- `src/integrations/*`: OpenAI/Azure clients, web fetch, MCP connectors, tool adapters

### 2) Shared contracts
- `src/contracts/*`: canonical request/response DTO schemas (zod), shared by routes/services/docs generation
- Central error taxonomy:
  - `VALIDATION_ERROR`
  - `NOT_FOUND`
  - `FORBIDDEN`
  - `CONFLICT`
  - `DEPENDENCY_ERROR`
  - `INTERNAL_ERROR`

### 3) Frontend modularization
- Split `client/app.js` into feature modules:
  - `client/js/core/` (state store, API client, auth/session, router/nav)
  - `client/js/features/simpleChat/`
  - `client/js/features/personaChat/`
  - `client/js/features/debates/`
  - `client/js/features/governance/`
  - `client/js/features/config/` (personas/knowledge/rai/theme/security/agentic)
  - `client/js/features/support/`
- Add a light pub/sub or event bus for cross-feature updates (history refresh, tool events, auth changes)
- Keep existing HTML/CSS mostly intact initially; refactor behavior first, layout second.

### 4) Unified conversation model
- Normalize conversation entities across simple/group/debate/support:
  - `session`
  - `message/exchange`
  - `annotations` (risk, sentiment, citations, tool runs)
- Add one internal “conversation read model” for governance/conversation explorer to avoid per-type ad hoc mapping.
- Treat `debate` as `conversationMode = "debate"` under a unified conversation engine rather than a separate product surface.
- Keep compatibility adapters so existing debate routes/files remain readable during migration.

### 5) Unified tool lifecycle
- Standardize tool run states:
  - `queued` -> `running` -> `succeeded|failed|timeout|cancelled`
- Ensure every tool attempt emits:
  - start event
  - end event
  - structured input/output metadata (masked)
- Add consistent UI affordance for in-flight and completed tool runs.

### 6) Governance-grade observability model
- Introduce per-exchange telemetry envelope:
  - `orchestration` (selector rationale, candidate scores, chosen speakers)
  - `llmTrace` (model, temperature, token usage, latency, retry count)
  - `payloadTrace` (sanitized request/response excerpts, prompt hash, trace ids)
  - `toolTrace` (tool id, args hash, status, duration, source URL when allowed)
- Add role-aware visibility policy:
  - default users: summaries and safe excerpts
  - governance/admin: deeper traces with secret masking
- Persist observability records in file-based JSONL compatible with current local-first storage.

## Proposed Folder Evolution

Phase-safe additions (without breaking existing imports):
- `src/services/`
- `src/domain/`
- `src/repositories/`
- `src/contracts/`
- `src/integrations/`
- `client/js/` modular frontend code

Legacy modules remain during migration:
- `lib/*` and `server/routes/*` continue to work until each feature is ported.

## Phased Refactor Plan

## Phase 0: Baseline and guardrails
Goal: Freeze behavior and reduce migration risk.
- Add baseline integration tests for high-value flows:
  - auth/login/api-key
  - simple chat create/message
  - persona chat create/message with tool usage
  - debate create/run/transcript fetch
  - governance overview/detail
- Capture representative golden fixtures in `tests/fixtures/`
- Add lightweight architecture decision records in `docs/adr/`

Exit criteria:
- Existing behavior covered by tests before major moves.

## Phase 1: Backend service extraction (no API changes)
Goal: Move business logic out of route files.
- Introduce service modules per domain:
  - `chatService`, `personaChatService`, `debateService`, `governanceService`, `supportService`, `agenticService`
- Route handlers become thin wrappers.
- Standardize error mapping utility.
- Keep `lib/*` as adapters during transition.

Exit criteria:
- No endpoint/schema changes.
- Route files reduced to orchestration + response mapping.

## Phase 1.5: Conversation mode convergence design
Goal: Define and land the compatibility-first merge of Debate into unified conversation modes.
- Introduce canonical `conversationMode` taxonomy:
  - `simple`
  - `group-chat`
  - `panel`
  - `debate`
  - `debate-work-order`
  - `support`
- Build compatibility adapter:
  - existing debate APIs map internally to `conversationMode = debate`
  - existing debate artifacts still readable/exportable
- Draft UI relabel map:
  - emphasize "Conversations" and "Modes"
  - "Formal Debate" becomes a mode/preset under multi-persona conversation setup
- Confirm migration path for conversation explorer and governance filters to mode-first grouping.

Exit criteria:
- Debate behavior available as a mode without requiring separate internal engines.
- No user data loss, no API regressions.

## Phase 2: Domain policy consolidation
Goal: Make agent behavior tunable and testable.
- Extract and centralize:
  - responder selection policy
  - scope enforcement policy
  - image-intent policy
  - tool-call/repair policy
  - risk/sentiment policy adapters
- Add policy unit tests for edge cases.

Exit criteria:
- Behavior tuning occurs in policy modules, not route files.

## Phase 3: Frontend decomposition
Goal: Make UI maintainable while preserving current UX patterns.
- Split `client/app.js` into module entry points and feature controllers.
- Introduce central state/store with typed selectors/actions.
- Normalize API client and error handling.
- Apply approved relabeling toward mode-first conversation UX.
- Keep interaction intent and key workflows intact while reducing navigation confusion.

Exit criteria:
- `client/app.js` replaced by small bootstrap entry.
- Feature logic isolated per module.
- Debate entry points represented as mode/preset within unified conversation UX.

## Phase 4: Conversation/governance unification
Goal: Improve analytics consistency and drill-through reliability.
- Build unified conversation projection pipeline:
  - ingest debates/chats/support
  - enrich with risk/sentiment/citation/tool stats
  - enrich with orchestration traces and per-turn token/cost data
- Drive conversation explorer and governance metrics from same projection layer.
- Extend governance/admin chat retrieval context to include these enriched traces (subject to visibility policy).

Exit criteria:
- Governance and explorer read from same normalized source.
- Fewer inconsistencies across views.
- Admin/governance users can trace why/when/how a response was produced.

## Phase 5: Agentic platform scaffolding hardening
Goal: Prepare for richer autonomous workflows.
- Formalize task/step schema versions.
- Add dependency-aware step output references (`step.outputRef`) for chaining.
- Improve approval UX and state synchronization.
- Harden MCP integration boundaries and capability descriptors.

Exit criteria:
- Reliable multi-step plans with clear observability and approvals.

## Phase 6: Extension readiness (future enhancements)
Goal: Enable next wave features with low rework.
- Multimodal abstraction layer (text/image/audio adapters)
- External storage strategy interface (while keeping local-first default)
- Optional provider plugin model for tools/knowledge connectors

Exit criteria:
- New capabilities added via extension points, not monolithic edits.

## Non-Breaking Constraints During Refactor
- Do not change existing API routes or payload schemas unless explicitly versioned.
- Keep all current data folder structures and file formats readable.
- Preserve auth semantics (`session` and `x-api-key`) and permission checks.
- Preserve governance signal visibility and auditability.
- Mask secrets/sensitive values in all payload/prompt observability surfaces.

## Technical Debt Backlog (Prioritized)
1. Split `server/routes/personaChats.js` orchestration logic into service + policy modules.
2. Split `client/app.js` into feature modules and central store.
3. Converge debate execution under unified conversation mode engine with compatibility adapters.
4. Normalize tool/orchestration/prompt telemetry and UI state mapping.
5. Add stronger integration tests around dynamic persona selection and fallback behavior.
6. Generate OpenAPI from shared contracts to avoid drift.

## Suggested Execution Sequence (Practical)
1. Phase 0 baseline tests
2. Phase 1 service extraction: support, simple chat, governance (lowest coupling first)
3. Phase 1 service extraction: persona chat + debates
4. Phase 1.5 conversation mode convergence design and adapters
5. Phase 2 domain policy extraction
6. Phase 3 frontend split + relabeling
7. Phase 4 governance/history projection unification + deep observability
8. Phase 5 agentic hardening

## Acceptance Criteria for “Refactor Complete”
- Same user-visible capabilities as today.
- No route/payload regressions.
- Smaller route files and modular frontend footprint.
- Improved consistency between chat/debate/governance signals.
- Clear extension points for multimodal and broader deployment.
- Debate fully supported as a conversation mode, not a disconnected module.
- Governance/admin can drill into orchestration/prompt/token/tool traces with proper redaction controls.

## Review Checklist
- Does phase ordering match your priority (stability vs feature velocity)?
- Do you want frontend decomposition earlier/later than backend extraction?
- Should governance unification happen before or after agentic hardening?
- Any modules that must stay untouched for demos in the near term?
