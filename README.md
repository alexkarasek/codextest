# Persona Debate Orchestrator (Local-First Node.js)

A local-first web application to create/edit personas and run multi-round debate sessions with OpenAI Chat Completions.

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
- Debate Orchestrator
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
    - Ask questions from the Debate Viewer using the loaded transcript as knowledge
    - Responses are grounded in transcript excerpts
    - Citation excerpts appear in a separate side pop-out so chat flow stays clean
- Persona Collaboration Chat
  - Create free-form chat sessions with one or more personas (no moderator rounds)
  - Engagement mode is configurable per group session: `chat`, `panel`, `debate-work-order`
  - Sends each user message through a transparent turn orchestrator that selects only the most relevant personas for that turn
  - Scope guardrails prevent personas from answering outside their defined expertise/knowledge
  - Supports inline persona-routed image generation (`Generate Image` button or `/image ...`)
  - Persists chat sessions and message history to `data/persona-chats/<chatId>/`
- Simple Chat
  - Standard assistant chat with selectable model and optional knowledge pack grounding
  - Supports inline image generation (`Generate Image` button or `/image ...`)
  - Persists chat sessions to `data/simple-chats/<chatId>/`
- Topic Discovery + Persona Generation
  - Search current events and select a topic from live web results
  - Generate topic-appropriate persona drafts and add/save them directly to debates
  - Persona generation also works from manually entered topic/context (without discovery results)
- Knowledge Studio (Upload -> Knowledge Pack)
  - Upload `.txt`, `.pdf`, `.jpg/.jpeg/.png`, `.doc`, or `.docx`
  - Convert extracted content into structured knowledge pack format
  - Manage knowledge pack library from dedicated tab
- Safety and reliability
  - Runtime prompt guardrail: do not reveal system prompts
  - API retries with exponential backoff (max 2 retries)
  - Corrupted persona JSON handling
  - Persona creation is strict: if optimization fails or returns weak output, creation returns an error and does not save
- Admin Governance View
  - Toggle between Debate View and Persona View
  - Summary metrics for conversations, participants, outcomes, tokens, and estimated costs
  - Drill-down round-by-round debate inspection

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

3. Edit `settings.local.json` and configure an LLM provider:

```json
{
  "llmProvider": "openai",
  "openaiApiKey": "sk-your-key-here",
  "azureOpenAIApiKey": "",
  "azureOpenAIEndpoint": "",
  "azureOpenAIDeployment": "",
  "azureOpenAIApiVersion": "2024-10-21",
  "port": 3000,
  "newsProvider": "google",
  "newsApiKey": ""
}
```

You can still override via environment variables if needed, but it is not required.

Notes:
- `llmProvider`:
  - `openai`: uses `openaiApiKey` or `OPENAI_API_KEY`
  - `azure`: uses `azureOpenAIApiKey` / `AZURE_OPENAI_API_KEY`, `azureOpenAIEndpoint` / `AZURE_OPENAI_ENDPOINT`, and `azureOpenAIDeployment` / `AZURE_OPENAI_DEPLOYMENT`
- `newsProvider`: `google` (default, no API key) or `newsapi`.
- If using `newsapi`, set `newsApiKey`.

## Run

Development mode (auto-reload):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

Open in browser:

- `http://localhost:3000`

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

### Admin

- `GET /api/admin/overview`
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

## Manual Test Plan

1. Start the app with `npm start`.
2. Open `http://localhost:3000`.
3. In **Personas**:
   - Create a new persona with a unique slug id.
   - Edit it and save again.
   - Duplicate it with a different id.
   - Delete the duplicate.
   - Confirm files appear/remove in `data/personas/`.
4. In **New Debate**:
   - Set a topic and optional context.
   - Optionally use **Topic Discovery** to search current events and select one result.
   - Optionally click **Generate Personas from Topic** and add/save generated drafts.
   - Add at least 2 saved personas.
   - Optionally add one ad-hoc persona (with and without save enabled).
   - Reorder personas with Up/Down controls.
   - Click **Run Debate**.
5. In **Debate Viewer**:
   - Verify progress updates show round and current speaker.
   - Verify transcript updates while running.
   - Download transcript using the download link.
6. Verify disk outputs:
   - A new folder in `data/debates/<timestamp>-<slug>/`
   - `session.json`, `transcript.md`, and `messages.jsonl` exist and contain data.
7. Failure checks:
   - Remove LLM credentials and run debate: verify clear error/failure state.
   - Introduce malformed JSON in one persona file and refresh persona list: verify corrupted file warning.
