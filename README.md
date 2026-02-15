# Persona Debate Orchestrator (Local-First Node.js)

A local-first web application to create/edit personas and run multi-round debate sessions with OpenAI Chat Completions.

## Features

- Persona Manager
  - Create, edit, duplicate, delete personas
  - Search/filter by tag
  - On create: runs an LLM optimization pass using existing personas as collective context to expand/improve the new persona for debate usefulness
  - File-based persistence to:
    - `data/personas/<id>.json`
    - `data/personas/<id>.md`
- Debate Orchestrator
  - Configure topic, context, persona order, rounds, max words, moderation, temperature, model
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
- Safety and reliability
  - Runtime prompt guardrail: do not reveal system prompts
  - API retries with exponential backoff (max 2 retries)
  - Corrupted persona JSON handling
  - Persona creation is strict: if optimization fails or returns weak output, creation returns an error and does not save

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

3. Edit `settings.local.json` and set your API key:

```json
{
  "openaiApiKey": "sk-your-key-here",
  "port": 3000
}
```

You can still override via environment variables if needed, but it is not required.

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
- You can provide API key either via `settings.local.json` or `OPENAI_API_KEY`.
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
- Set `OPENAI_API_KEY` as a platform secret.
- Mount persistent storage for `/app/data` if you want debate/persona persistence across restarts.
- If your platform does not support file mounts (ephemeral filesystem), exported data will be lost on redeploy/restart.

## Publish to Docker Hub

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

## API Endpoints

### Personas

- `GET /api/personas`
- `GET /api/personas/:id`
- `POST /api/personas`
- `PUT /api/personas/:id`
- `DELETE /api/personas/:id`
- `POST /api/personas/:id/duplicate` (extra helper)

### Debates

- `POST /api/debates` (creates + queues run)
- `GET /api/debates`
- `GET /api/debates/:debateId`
- `GET /api/debates/:debateId/transcript`
- `POST /api/debates/:debateId/chat`

## Data Folder Behavior

- Personas are saved as both JSON and Markdown.
- Debate runs create timestamped folders under `data/debates`.
- `messages.jsonl` stores request/response logs for debugging each LLM turn.
- `chat.jsonl` stores persisted transcript-chat follow-up messages per debate.

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
   - Unset `OPENAI_API_KEY` and run debate: verify clear error/failure state.
   - Introduce malformed JSON in one persona file and refresh persona list: verify corrupted file warning.
