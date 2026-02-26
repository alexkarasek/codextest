# Production Checklist

Use this checklist before deploying beyond local/demo use.

## 1) Security baseline
- Rotate bootstrap admin credentials and remove default/demo users.
- Regenerate API keys and revoke stale keys in `Admin & Config -> Users & Access`.
- Confirm request auth works for both browser sessions and `x-api-key` API clients.
- Verify secrets are provided via environment or `settings.local.json` on host only (never commit keys).

## 2) Data + storage
- Mount persistent host volumes for `/app/data` and settings files when using containers.
- Confirm write access to `data/` subfolders (`personas`, `knowledge`, `debates`, `simple-chats`, `persona-chats`, `settings`, `agentic`).
- Back up `data/settings` (users, api keys, governance settings) before upgrades.

## 3) Runtime health
- Validate `GET /health` is `200` after startup.
- Run app + worker together for queued workloads (`npm start` + `npm run worker`).
- Confirm logs do not include raw secrets or raw API keys.

## 4) LLM/provider settings
- Confirm `llmProvider` is correct (`openai` or `azure`) and required fields are present.
- For Azure, validate endpoint, deployment, and API version before traffic.
- Run a smoke test for simple chat, persona chat, and debate execution.

## 5) Governance + safety
- Review Responsible AI keyword policy under `Settings` and test red/yellow flagging.
- Confirm governance analytics include expected conversation types (simple, persona, debate, support).
- Verify support concierge replies include citations to in-repo docs.

## 6) API/docs parity
- Open `http://localhost:3000/docs/api` and verify Swagger loads.
- Check `/docs/openapi.yaml` includes active routes used by integrations.
- Re-run tests after route/schema changes: `npm test --silent`.

## 7) Container release readiness
- Build image from current commit and tag semantically.
- Start container with mounted `data` volume and settings file.
- Validate login, API key auth, workflow runs, and run history on the containerized instance.
