# Agentic AI Workbench (Local-First Node.js)

A local-first web application to create/edit personas and run conversation modes (simple chat, multi-persona collaboration, and debate mode) with OpenAI Chat Completions.

## Docs Index

- User Guide: `docs/USER_GUIDE.md`
- First 10 Minutes: `docs/FIRST_10_MINUTES.md`
- UI Navigation Map: `docs/UI_NAVIGATION.md`
- Refactor Blueprint: `docs/REFACTOR_BLUEPRINT.md`
- Current Architecture: `docs/architecture/current.md`
- Current Data Model: `docs/data/current-data-model.md`
- Current Execution Model: `docs/execution/current-execution.md`
- Phase 1 Events Foundation: `docs/execution/phase-1-events.md`
- Phase 2 Worker Queue: `docs/execution/phase-2-worker.md`
- Phase 3 Storage Split: `docs/execution/phase-3-storage.md`
- Phase 4 Tool Boundary: `docs/execution/phase-4-tool-boundary.md`
- Phase 5 Workflow MVP: `docs/execution/phase-5-workflows.md`
- Phase 6 Evaluation Scorecard: `docs/execution/phase-6-scorecard.md`
- API Guide: `docs/API_GUIDE.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- FAQ: `docs/FAQ.md`
- Production Checklist: `docs/PRODUCTION_CHECKLIST.md`
- OpenAPI spec: `docs/openapi.yaml`
- Browser API docs: `http://localhost:3000/docs/api`
- Documentation module (rendered guides): `http://localhost:3000/documentation`
- Run History API: `http://localhost:3000/runs`
- Run History UI: `http://localhost:3000/runs/ui`

## Features

- Security Baseline (local-first)
  - Username/password authentication with file-based users
  - First-run bootstrap flow to create initial admin user
  - Basic roles/permissions (`admin`, `user`) with route-level enforcement
  - API key generation/revocation per user for external clients (Postman/Copilot integrations)
  - Per-request usage audit log with user attribution in `data/settings/usage.jsonl`
  - User/session/API key administration from `Admin & Config -> Users & Access`

- Persona Manager
  - Create, edit, duplicate, delete personas
  - Search/filter by tag
  - On create: runs an LLM optimization pass using existing personas as collective context to expand/improve the new persona for debate usefulness
  - File-based persistence to:
    - `data/personas/<id>.json`
    - `data/personas/<id>.md`
- Debate Mode Orchestrator
  - Configure topic, context, persona order, rounds, max words, moderation, temperature, model
  - Source grounding modes: `off`, `light`, `strict`
  - Optional knowledge pack attachments at two levels:
    - Persona profile knowledge (specialized per agent)
    - Debate setup knowledge (global to all agents + moderator)
  - Supports saved personas and ad-hoc personas
  - If no personas are manually selected, server dynamically selects personas from saved profiles based on topic/context
  - Sequential turn execution with progress reporting
  - Moderator summaries each round + final synthesis
  - Debate persistence to:
    - `data/debates/<timestamp>-<slug>/session.json`
    - `data/debates/<timestamp>-<slug>/transcript.md`
    - `data/debates/<timestamp>-<slug>/messages.jsonl`
  - Transcript Chat
    - Ask questions from the Conversation Explorer using the loaded transcript as knowledge
    - Responses are grounded in transcript excerpts
    - Citation excerpts appear in a separate side pop-out so chat flow stays clean
  - Internally modeled as `conversationMode: "debate"` for convergence with other conversation modes
- Persona Collaboration Chat
  - Create free-form chat sessions with one or more personas (no moderator rounds)
  - Engagement mode is configurable per group session: `chat` (directed), `panel` (moderated), `debate-work-order` (decision-oriented)
  - Optional side-by-side model comparison per persona turn for prompt-only responses
  - Attach knowledge packs at the chat session level to ground all personas
  - Sends each user message through a transparent moderator/orchestrator that routes directed turns in chat mode and facilitates multi-agent turns in panel/debate modes
  - Scope guardrails prevent personas from answering outside their defined expertise/knowledge
  - Supports inline persona-routed image generation by intent (e.g., `generate an image of ...` or `/image ...`)
  - One-click Debate Mode Template to carry personas/knowledge/context into debate setup
  - Persists chat sessions and message history to `data/persona-chats/<chatId>/`
- Simple Chat
  - Standard assistant chat with selectable model and optional knowledge pack grounding
  - Optional side-by-side model comparison in the same session (primary response remains unchanged; alternate model outputs appear in a separate comparison panel)
  - Supports inline image generation (automatic intent detection, `Force Image`, or `/image ...`)
  - Persists chat sessions to `data/simple-chats/<chatId>/`
- Topic Discovery + Persona Generation
  - Search current events and select a topic from live web results
  - Generate topic-appropriate persona drafts and add/save them directly to debates
  - Persona generation also works from manually entered topic/context (without discovery results)
- Knowledge Studio (Upload + Web Ingest -> Knowledge Pack)
  - Upload `.txt`, `.pdf`, `.jpg/.jpeg/.png`, `.doc`, or `.docx`
  - Ingest web pages into knowledge packs (create/append/overwrite)
  - Convert extracted content into structured knowledge pack format
  - Manage knowledge pack library from dedicated tab
- UI Theme Settings
  - Theme variables and typography are configurable via `data/settings/theme.json` or `PUT /api/settings/theme`
- Agentic + MCP (Scaffold + Demo)
  - Embedded MCP server exposes platform tools (knowledge, personas, events)
  - MCP tool registry and runner UI in Agentic workspace
  - MCP calls appear in tool usage events
  - Includes built-in one-click preset: `Autonomous Persona -> Image`
  - New tool: `persona.autonomous_image_brainstorm` for unattended multi-persona discussion -> image generation -> persisted run files
- Safety and reliability
  - Runtime prompt guardrail: do not reveal system prompts
  - API retries with exponential backoff (max 2 retries)
  - Corrupted persona JSON handling
  - Persona creation is strict: if optimization fails or returns weak output, creation returns an error and does not save
- Admin Governance View
  - Toggle between conversation-centric and persona-centric views
  - Summary metrics for conversations, participants, outcomes, tokens, and estimated costs
  - Drill-down round-by-round debate inspection
  - Observability summaries for LLM calls, payload traces, orchestration events, and tool runs
  - Backed by a unified internal conversation projection layer across debate/chat/support records

## Tech Stack

- Node.js + Express
- OpenAI Chat Completions (`openai` SDK with fetch fallback)
- Zod validation
- Plain HTML/CSS/JS frontend served from Express
- Filesystem persistence only (no database)

## Prerequisites

- Node.js `>= 20` (tested with modern Node, including built-in `fetch`)
- An OpenAI API key

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local settings file:

```bash
cp settings.example.json settings.local.json
```

3. Edit `settings.local.json` and configure an LLM provider.

Minimal OpenAI setup:

```json
{
  "llmProvider": "openai",
  "openaiApiKey": "sk-your-key-here"
}
```

Recommended Azure setup for model-to-deployment mapping:

```json
{
  "llmProvider": "azure",
  "azureInference": {
    "apiKey": "",
    "endpoint": "https://your-resource.openai.azure.com",
    "apiVersion": "2024-10-21",
    "defaultDeployment": "gpt-5-mini",
    "deployments": {
      "gpt-5-mini": "gpt-5-mini",
      "gpt-5.2": "gpt-5.2",
      "gpt-4.1": "gpt-4.1",
      "gpt-4o": "gpt-4o",
      "gpt-4o-mini": "gpt-4o-mini",
      "claude-sonnet": "claude-sonnet"
    }
  }
}
```

Hybrid routing example (OpenAI by default, but route `gpt-5-mini` to Azure):

```json
{
  "llmProvider": "openai",
  "openaiApiKey": "sk-your-key-here",
  "modelRouting": {
    "gpt-5-mini": "azure"
  },
  "azureInference": {
    "apiKey": "",
    "endpoint": "https://your-resource.openai.azure.com",
    "apiVersion": "2024-10-21",
    "defaultDeployment": "gpt-5-mini",
    "deployments": {
      "gpt-5-mini": "gpt-5-mini"
    }
  }
}
```

You can still override via environment variables if needed, but it is not required.

Notes:
- `llmProvider`:
  - `openai`: uses `openaiApiKey` or `OPENAI_API_KEY`
  - `azure`: prefers `azureInference.apiKey`, `azureInference.endpoint`, `azureInference.apiVersion`, and `azureInference.deployments`
- `modelRouting` is optional. It maps a model label to the provider to use for `chatCompletion` calls. Example: `"gpt-5-mini": "azure"`.
- `newsProvider`: `google` (default, no API key) or `newsapi`.
- If using `newsapi`, set `newsApiKey`.
- `openaiBaseUrl` is optional and reserved for future OpenAI-compatible endpoint routing; the current runtime still uses the standard OpenAI API base URL.
- `azureInference.deployments` maps UI/runtime model labels to Azure deployment names. This is the recommended way to support Azure-hosted model comparisons.
- Optional Foundry provider settings can be stored under `foundry.enabled`, `foundry.projectEndpoint`, and `foundry.apiKey`. If Foundry is disabled or misconfigured, the app continues running local-first with no hard dependency.
- `GET /api/settings/agent-providers` returns registered providers plus normalized agent manifests. When Foundry is enabled and reachable, it now attempts remote agent discovery and normalizes the results.
- Legacy top-level Azure fields (`azureOpenAIApiKey`, `azureOpenAIEndpoint`, `azureOpenAIDeployment`, `azureOpenAIApiVersion`) are still supported for backward compatibility.
- Environment overrides still work:
  - `LLM_MODEL_ROUTING_JSON` (JSON object mapping model labels to `openai` or `azure`)
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_OPENAI_ENDPOINT`
  - `AZURE_OPENAI_DEPLOYMENT`
  - `AZURE_OPENAI_API_VERSION`
  - `AZURE_OPENAI_DEPLOYMENTS_JSON` (JSON object mapping model labels to deployment names)
  - `FOUNDRY_ENABLED`
  - `FOUNDRY_PROJECT_ENDPOINT`
  - `FOUNDRY_API_KEY`

## Run

Development mode (auto-reload):

```bash
npm run dev
```

Run background worker (required for queued debate execution in Phase 2):

```bash
npm run dev:worker
```

Production mode:

```bash
npm start
```

Worker process (production/local):

```bash
npm run worker
```

Run metadata migration (legacy debate folders -> run metadata store):

```bash
npm run migrate:runs
```

Open in browser:

- `http://localhost:3000`
- `http://localhost:3000/docs/api` (Swagger/OpenAPI docs)
- `http://localhost:3000/documentation` (rendered user/API/troubleshooting docs)

## Authentication Quick Start

1. Open the app in browser.
2. On first run, create the bootstrap admin account in the sign-in panel.
3. After login, go to `Admin & Config -> Users & Access` to:
   - create additional users
   - generate/revoke API keys
   - inspect per-user usage summary

For API clients (Postman/Copilot), send:

- Header: `x-api-key: <your-generated-key>`

All authenticated API requests are logged with user attribution in:

- `data/settings/usage.jsonl`

Support Chat API (requires authentication: session or API key):

```bash
curl -X POST http://localhost:3000/api/support/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_KEY>' \
  -d '{"message":"How do I create a persona chat?"}'
```

## Run with Docker

### Option A: `docker run`

1. Build image:

```bash
docker build -t persona-debate-app:latest .
```

2. Run container:

```bash
docker run --rm -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/settings.local.json:/app/settings.local.json:ro" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  persona-debate-app:latest
```

Notes:
- You can configure LLM via `settings.local.json` or environment variables.
- OpenAI env: `OPENAI_API_KEY`
- Azure env: `LLM_PROVIDER=azure`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` (optional `AZURE_OPENAI_API_VERSION`)
- `./data` is mounted so personas/debates persist on host disk.

### Dev container with hot reload (`Dockerfile.dev`)

```bash
docker build -f Dockerfile.dev -t persona-debate-app:dev .
docker run --rm -it -p 3000:3000 \
  -v "$(pwd)/server:/app/server" \
  -v "$(pwd)/client:/app/client" \
  -v "$(pwd)/lib:/app/lib" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/settings.local.json:/app/settings.local.json:ro" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  persona-debate-app:dev
```

This runs `npm run dev` inside the container (nodemon auto-reload).

### Option B: `docker compose`

```bash
docker compose up --build
```

This uses `docker-compose.yml` and mounts:
- `./data -> /app/data`
- `./settings.local.json -> /app/settings.local.json` (read-only)

Stop:

```bash
docker compose down
```

## Cloud Deployment Notes

- Container listens on `PORT` (default `3000`).
- Set either OpenAI or Azure OpenAI secrets as platform secrets.
- Mount persistent storage for `/app/data` if you want debate/persona persistence across restarts.
- If your platform does not support file mounts (ephemeral filesystem), exported data will be lost on redeploy/restart.

## Publish to Docker Hub

### Single-command release (recommended)

This project includes a release script that automatically:
1. increments Docker image version
2. builds image
3. tags version + `latest`
4. pushes both tags to Docker Hub

Run:

```bash
DOCKERHUB_USER=<dockerhub-username> npm run docker:release
```

Optional:

```bash
# bump minor instead of patch
npm run docker:release -- --user <dockerhub-username> --bump minor

# explicit version
npm run docker:release -- --user <dockerhub-username> --version 1.4.0

# dry run (build/tag only, no push)
npm run docker:release -- --user <dockerhub-username> --no-push
```

Version tracking:
- Script persists release version in `.docker-release-version`.
- If missing, it starts from `package.json` version, then increments.

### Manual release

1. Log in:

```bash
docker login
```

2. Build with OCI metadata labels:

```bash
docker build \
  --build-arg IMAGE_SOURCE="https://github.com/<you>/<repo>" \
  --build-arg IMAGE_DOCUMENTATION="https://github.com/<you>/<repo>#readme" \
  --build-arg IMAGE_REVISION="$(git rev-parse --short HEAD)" \
  --build-arg IMAGE_CREATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t <dockerhub-username>/persona-debate-app:latest .
```

3. Push:

```bash
docker push <dockerhub-username>/persona-debate-app:latest
```

4. Optional version tag:

```bash
docker tag <dockerhub-username>/persona-debate-app:latest <dockerhub-username>/persona-debate-app:v1
docker push <dockerhub-username>/persona-debate-app:v1
```

5. Publish detailed instructions in Docker Hub UI:
- Open your Docker Hub repository.
- Go to Description/README editor.
- Paste contents of `DOCKERHUB_README.md`.

## Folder Structure

- `server/` Express server and API routes
- `client/` static UI
- `lib/` storage, validation, LLM wrapper, orchestrator
- `data/personas/` persona JSON/MD files
- `data/debates/` debate session output folders
- `data/persona-chats/` free-form persona chat sessions
- `data/simple-chats/` simple assistant chat sessions
- `data/agentic/` task runner, approvals, jobs, and agentic event logs

## API Endpoints

### Personas

- `GET /api/personas`
- `GET /api/personas/:id`
- `POST /api/personas`
- `PUT /api/personas/:id`
- `DELETE /api/personas/:id`
- `POST /api/personas/:id/duplicate` (extra helper)
- `POST /api/personas/generate-from-topic`

### Topics

- `GET /api/topics/current-events?query=<text>&limit=<n>&recencyDays=<n>`

### Debates

- `POST /api/debates` (creates + queues run)
- `GET /api/debates`
- `GET /api/debates/:debateId`
- `GET /api/debates/:debateId/transcript`
- `POST /api/debates/:debateId/chat`

### Persona Chats

- `GET /api/persona-chats`
- `POST /api/persona-chats`
- `GET /api/persona-chats/:chatId`
- `POST /api/persona-chats/:chatId/messages`

### Simple Chats

- `GET /api/simple-chats`
- `POST /api/simple-chats`
- `GET /api/simple-chats/:chatId`
- `POST /api/simple-chats/:chatId/messages`

### Knowledge Packs

- `GET /api/knowledge`
- `GET /api/knowledge/:id`
- `POST /api/knowledge`
- `PUT /api/knowledge/:id`
- `DELETE /api/knowledge/:id`
- `POST /api/knowledge/ingest` (multipart file upload + conversion)
- `POST /api/knowledge/ingest-url` (web URL ingest)
- `POST /api/knowledge/preview-url` (web URL preview)

### Settings

- `GET /api/settings/responsible-ai`
- `PUT /api/settings/responsible-ai`
- `GET /api/settings/web`
- `PUT /api/settings/web`
- `GET /api/settings/theme`
- `PUT /api/settings/theme`
 - `GET /theme` (public, read-only theme)

### Admin

- `GET /api/admin/overview`
- `GET /api/admin/heatmap?mode=capability|topic&limit=300&maxColumns=8`
- `GET /api/admin/personas`
- `GET /api/admin/debates/:debateId`
- `GET /api/admin/chats`
- `GET /api/admin/chats/:chatId`
- `POST /api/admin/governance-chat/session`
- `GET /api/admin/governance-chat`
- `GET /api/admin/governance-chat/:chatId`
- `POST /api/admin/governance-chat/:chatId/messages`
- `POST /api/admin/governance-chat/refresh-assets`

### Agentic (Scaffold)

- `GET /api/agentic/tools`
- `POST /api/agentic/plan`
- `POST /api/agentic/router/preview`
- `GET /api/agentic/templates`
- `POST /api/agentic/templates`
- `DELETE /api/agentic/templates/:templateId`
- `GET /api/agentic/tasks`
- `GET /api/agentic/tasks/:taskId`
- `POST /api/agentic/tasks`
- `POST /api/agentic/tasks/:taskId/run`
- `GET /api/agentic/approvals`
- `POST /api/agentic/approvals/:approvalId/decision`
- `GET /api/agentic/jobs`
- `GET /api/agentic/events?type=task|tool&limit=<n>`
- `GET /api/agentic/metrics/overview`
- `GET /api/agentic/mcp/status`
- `GET /api/agentic/mcp/servers?includeTools=true`
- `GET /api/agentic/mcp/servers/:serverId/tools`
- `POST /api/agentic/mcp/servers/:serverId/call`

### Images

- `POST /api/images/generate`
- `GET /api/images/:imageId`

## Data Folder Behavior

- Personas are saved as both JSON and Markdown.
- Knowledge packs are saved in `data/knowledge/*.json`.
- Internal governance assets are auto-managed:
  - hidden pack: `data/knowledge/governance-admin-dataset.json`
  - hidden persona: `data/personas/governance-admin-agent.json`
- Debate runs create timestamped folders under `data/debates`.
- `messages.jsonl` stores request/response logs for debugging each LLM turn.
- `chat.jsonl` stores persisted transcript-chat follow-up messages per debate.
- Generated images are stored under `data/images/` and served via `/api/images/:imageId`.
- `data/agentic/tasks/*.json` stores task runner state.
- `data/agentic/approvals/*.json` stores approval requests and decisions.
- `data/agentic/jobs/*.json` stores queued/background job metadata.
- `data/agentic/task-events.jsonl` stores orchestration lifecycle events.
- `data/agentic/tool-usage.jsonl` stores tool execution telemetry.
- `data/agentic/autonomy/*` stores autonomous multi-persona image run outputs.
- Delete behavior:
  - archive (default): hides from normal UI lists while preserving governance visibility
  - hard delete (admin): permanently removes content
- Admin demo reset is available in `Users & Access` to clear usage-only data or run full reseed.

## Manual Test Plan

1. Start the app with `npm start`.
2. Open `http://localhost:3000`.
3. In **Personas**:
   - Create a new persona with a unique slug id.
   - Edit it and save again.
   - Duplicate it with a different id.
   - Delete the duplicate.
   - Confirm files appear/remove in `data/personas/`.
4. In **Knowledge Studio**:
   - Upload a small `.txt` file.
   - Use **Web Ingest** with a public URL.
   - Confirm both packs appear in the library.
5. In **Agentic**:
   - Run the MCP tool runner to list knowledge packs.
   - Confirm tool usage appears in events.
   - Load preset **Autonomous Persona -> Image**.
   - Create task with **Run immediately** checked.
   - Confirm output in task detail includes `image.url` and `files.*`.
   - Confirm persisted files under `data/agentic/autonomy/` and `data/agentic/reports/autonomous-persona-image.md`.
6. In **Persona Chat** (Structured Debate Run):
   - Set topic using **Chat Title** and optional **Shared Context**.
   - Optionally use **Topic Discovery** to search current events and select one result.
   - Optionally click **Generate Personas from Topic** and add/save generated drafts.
   - Add at least 2 saved personas.
   - Optionally add one ad-hoc persona (with and without save enabled).
   - Reorder personas with Up/Down controls.
   - Click **Run Structured Debate**.
7. In **Conversation Explorer**:
   - Verify progress updates show round and current speaker.
   - Verify transcript updates while running.
   - Download transcript using the download link.
8. Verify disk outputs:
   - A new folder in `data/debates/<timestamp>-<slug>/`
   - `session.json`, `transcript.md`, and `messages.jsonl` exist and contain data.
9. Failure checks:
   - Remove LLM credentials and run debate: verify clear error/failure state.
   - Introduce malformed JSON in one persona file and refresh persona list: verify corrupted file warning.
