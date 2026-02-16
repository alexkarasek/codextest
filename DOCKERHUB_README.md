# Persona Debate Orchestrator

Local-first Node.js app for persona management, multi-round debates, and transcript Q&A with citations.

## Run

```bash
docker run --rm -p 3000:3000 \
  -e OPENAI_API_KEY="sk-..." \
  -v "$(pwd)/data:/app/data" \
  <dockerhub-username>/persona-debate-app:latest
```

Open: `http://localhost:3000`

## Persist Data

Mount host storage so files survive container restarts:

- `./data -> /app/data`

Saved output:
- Personas: `/app/data/personas/*.json`, `/app/data/personas/*.md`
- Debates: `/app/data/debates/<id>/session.json`, `transcript.md`, `messages.jsonl`, `chat.jsonl`

## Config

Provide API key with either:
1. `OPENAI_API_KEY` env var, or
2. `settings.local.json` mount:

```bash
docker run --rm -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/settings.local.json:/app/settings.local.json:ro" \
  <dockerhub-username>/persona-debate-app:latest
```

Azure OpenAI option:

```bash
docker run --rm -p 3000:3000 \
  -e LLM_PROVIDER="azure" \
  -e AZURE_OPENAI_API_KEY="..." \
  -e AZURE_OPENAI_ENDPOINT="https://<resource>.openai.azure.com" \
  -e AZURE_OPENAI_DEPLOYMENT="<deployment-name>" \
  -v "$(pwd)/data:/app/data" \
  <dockerhub-username>/persona-debate-app:latest
```

## Notes

- Container port: `3000`
- For cloud, mount persistent storage to `/app/data`
