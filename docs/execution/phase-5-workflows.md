# Phase 5: Workflow Automation MVP

This phase adds trigger-based automation workflows integrated with queue/worker and run observability.

## Added Concepts
- Workflow: `{id, name, enabled, trigger, steps[]}`
- Workflow Run: execution instance with status, step outputs, trigger metadata
- Trigger types (MVP):
  - `manual`
  - `cron` (lightweight patterns: `* * * * *` and `*/N * * * *`)
  - `webhook`
  - `runCompleted` (event-driven)

## Backend Changes

## Storage
- `lib/agenticStorage.js` now supports:
  - workflows CRUD (`saveWorkflow`, `getWorkflow`, `listWorkflows`, `updateWorkflow`, `deleteWorkflow`)
  - workflow runs (`saveWorkflowRun`, `getWorkflowRun`, `listWorkflowRuns`)
  - workflow event log (`appendWorkflowEvent`, `listWorkflowEvents`)
- Files persist under:
  - `data/agentic/workflows/*.json`
  - `data/agentic/workflow-runs/*.json`
  - `data/agentic/workflow-events.jsonl`

## Engine
- New module: `lib/workflowEngine.js`
- Functions:
  - `createWorkflow(...)`
  - `queueWorkflowRun(...)`
  - `executeWorkflowRun(...)`
  - `pollAndQueueCronWorkflows(...)`
  - `queueRunCompletedWorkflows(...)`
  - `getWorkflowOverview(...)`

## Worker Integration
- `worker/index.js` now executes `RUN_WORKFLOW` jobs.
- Cron polling happens in worker loop.
- Non-workflow run completions can fan out to `runCompleted` workflows.

## Step Types (MVP)
- `condition`
- `httpRequest`
- `sendMessage` (connector stub; logs intent)
- `runDebate` (enqueue debate job)
- `transform` (template or LLM transform)
- `persistRecord` (write/append local file)

## API Endpoints
Under `/api/agentic`:
- `GET /workflows`
- `POST /workflows`
- `PUT /workflows/:workflowId`
- `DELETE /workflows/:workflowId`
- `POST /workflows/:workflowId/run`
- `POST /workflows/:workflowId/trigger`

## UI (Agentic tab)
- New Workflow section:
  - create workflow from form + steps JSON
  - refresh workflow state
  - run now
  - enable/disable
  - webhook trigger
  - delete
  - workflow run list

## Notes
- Existing task/watcher APIs remain intact.
- This is an MVP scaffolding intended for iterative connector and policy hardening in later phases.
