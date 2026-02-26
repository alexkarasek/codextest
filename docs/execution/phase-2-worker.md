# Phase 2: Background Job Runner (Queue + Worker)

This phase moves long-running debate execution off the API request thread.

## What Changed

## Queue Abstraction
- Added local file-backed queue: `packages/core/queue/index.js`
- Interface:
  - `enqueue(jobType, payload, opts)`
  - `dequeue({ workerId, jobTypes })`
  - `ack(jobId, result)`
  - `fail(jobId, error, opts)`
- Queue persistence:
  - `data/queue/jobs/<jobId>.json`

## Worker Service
- Added worker process entrypoint: `worker/index.js`
- Worker polls queue and processes job types:
  - `RUN_DEBATE` (implemented)
  - `RUN_WORKFLOW` (scaffold)
  - `INGEST_DOCS` (scaffold)
- Debate work now executes from worker process, not from HTTP request thread.

## API Server Updates
- Debate routes (`server/routes/debates.js`):
  - `POST /api/debates` now enqueues `RUN_DEBATE` and returns immediately with `runId` + `jobId`.
  - Added alias: `POST /api/debates/run` (same behavior).
- Run routes (`server/routes/runs.js`):
  - If no events exist yet for a `runId`, it falls back to queue job state (`pending/running/failed/completed`).

## Idempotency + Retries
- Queue idempotency key used for debate jobs: `RUN_DEBATE:<debateId>`.
  - Repeated enqueue for same key returns existing active/completed job.
- Retry policy:
  - Default `maxAttempts: 3`
  - Exponential backoff in `fail(...)`
  - Terminal failure marked as `failed` with `lastError`.

## Observability Integration
- Worker emits run lifecycle events:
  - `RunStarted`
  - `RunFinished`
  - `Error` (via `recordErrorEvent`)
- Existing `/runs` endpoint now reflects both:
  - event-backed completed runs
  - queue-backed queued/running runs

## Docker/Runtime
- Added worker scripts:
  - `npm run worker`
  - `npm run dev:worker`
- Docker changes:
  - `docker-compose.yml` now includes `worker` service.
  - `Dockerfile` / `Dockerfile.dev` now copy `worker/` and `packages/`.

## Usage
- Start web + worker in Docker:
  - `docker compose up --build`
- Local dev with two terminals:
  - terminal 1: `npm run dev`
  - terminal 2: `npm run dev:worker`
