# Phase 1: Event Log + Correlation IDs

This document describes the Phase 1 observability foundation added on branch `phase-1-events`.

## What Was Added

## 1) Correlation IDs
- Request correlation id middleware: `lib/observability.js`
  - `requestCorrelationMiddleware` sets/propagates `x-request-id`.
  - `req.requestId` is attached to incoming requests.
- Async context propagation uses `AsyncLocalStorage`.
  - `runWithObservabilityContext(...)` carries `requestId` and `runId` across async boundaries.

## 2) Structured JSON Logging
- `logEvent(level, fields)` in `lib/observability.js` outputs JSON logs.
- Includes standard fields:
  - `timestamp`, `level`, `requestId`, `runId`, `component`, `eventType`, `latencyMs`, `error`
- HTTP lifecycle logs:
  - `request.started`
  - `request.finished`

## 3) Event Store (local file)
- New module: `packages/core/events/index.js`
- Persistence file: `data/events/events.jsonl`
- Event types:
  - `RunStarted`
  - `RunFinished`
  - `ToolInvoked`
  - `ToolFinished`
  - `LLMCallStarted`
  - `LLMCallFinished`
  - `Error`
- Includes simple run summarization:
  - status, start/end, duration
  - LLM calls/tool calls/event count
  - token totals
  - estimated cost (model-price map)

## 4) Run History Endpoints + Minimal UI
- New routes: `server/routes/runs.js`
  - `GET /runs?limit=25`
  - `GET /runs/:runId`
- Mounted as authenticated endpoints in `server/index.js`.
- Minimal browser view:
  - `GET /runs/ui` -> `client/runs.html`

## Instrumentation Coverage
- Debate run lifecycle events are emitted in `server/routes/debates.js`:
  - queued debate gets `runId` (currently debateId)
  - emits `RunStarted` and `RunFinished` (+ `Error` on failure)
- LLM calls instrumented in `lib/llm.js`:
  - `LLMCallStarted` + `LLMCallFinished` with usage/timing
- Tool calls instrumented in `lib/agenticTools.js`:
  - `ToolInvoked` + `ToolFinished` (+ `Error`)

## Notes / Current Limits
- Run coverage is currently strongest for debate runs.
- In-process debate queue remains unchanged (no worker yet); this phase is observability-only.
- Event store is append-only JSONL for local-first simplicity.
