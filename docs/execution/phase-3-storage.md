# Phase 3: Storage Split (Metadata vs Payload)

This phase introduces repository abstractions and a dedicated run metadata store while preserving existing file-based payload outputs.

## What Changed

## Canonical Domain Models + Repository Interfaces
- Added model contracts (typedefs):
  - `packages/core/repositories/models.js`
  - `Run`, `RunArtifact`, `Persona`, `Scenario`, `Workflow`, `WorkflowRun`, `Event`
- Added repository interfaces:
  - `packages/core/repositories/interfaces.js`
  - `RunRepository`, `EventRepository`, `PersonaRepository`, `WorkflowRepository`

## Run Metadata Repository (File Adapter)
- Added `FileRunRepository`:
  - `packages/core/repositories/file/runRepository.js`
- Metadata storage path:
  - `data/runs/meta/<runId>.json`
- Supports:
  - `upsert(run)`
  - `getById(runId)`
  - `list({limit})`
  - `migrateFromLegacyDebates()`

## Runtime Integration
- Added singleton accessor:
  - `lib/runRepository.js`
- Worker now writes run metadata lifecycle:
  - running/completed/failed states
- `/runs` views now include repository-backed metadata:
  - `packages/core/events/index.js` merges repository + event summaries
  - `server/routes/runs.js` can return repository summary even when no events exist yet

## Data Directory Updates
- `lib/storage.js` now ensures:
  - `data/runs/`
  - `data/runs/meta/`
  - `data/runs/artifacts/`

## Migration + Backward Compatibility
- Added migration utility:
  - `lib/runMigration.js`
  - Seeds run metadata from legacy debate sessions when repository is empty.
- Startup hook:
  - `server/index.js` calls `ensureRunMetadataSeeded()`.
- Manual script:
  - `npm run migrate:runs`
  - script file: `scripts/migrate-runs-metadata.js`

## Behavior Preservation
- Existing debate/session/transcript payload files remain unchanged:
  - `data/debates/<id>/session.json`
  - `data/debates/<id>/transcript.md`
  - `data/debates/<id>/messages.jsonl`
- Existing API contracts remain compatible.
