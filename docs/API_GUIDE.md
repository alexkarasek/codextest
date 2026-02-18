# API Guide

Base URL: `http://localhost:3000`

Response envelope:
- Success: `{ "ok": true, "data": ... }`
- Error: `{ "ok": false, "error": { "code", "message", "details" } }`

## Auth patterns

### Session auth (browser / login flow)
- Login route sets cookie `pd_session`.
- Send cookie on subsequent requests.

### API key auth
- Header: `x-api-key: pk_...`
- Works for authenticated routes when key is valid.
- Optional for `POST /api/support/messages` if you are already logged in with session auth.

## Endpoint inventory and required auth/header

### Auth (`/api/auth`)
- `GET /me` - optional auth
- `GET /sso/status` - public
- `POST /bootstrap` - public (only first user)
- `POST /login` - public
- `POST /logout` - session or bearer required
- `GET /users` - auth + `manageUsers`
- `POST /users` - auth + `manageUsers`
- `PUT /users/:userId` - auth + `manageUsers`
- `DELETE /users/:userId` - auth + `manageUsers`
- `GET /api-keys` - auth
- `POST /api-keys` - auth
- `DELETE /api-keys/:keyId` - auth
- `GET /usage` - auth + `viewGovernance`

### Personas (`/api/personas`) - auth required
- `GET /`
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /:id/duplicate`
- `POST /generate-from-topic`

### Knowledge (`/api/knowledge`) - auth required
- `GET /`
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /ingest` (multipart upload)
- `POST /ingest-url`
- `POST /preview-url`

### Topics (`/api/topics`) - auth required
- `GET /current-events?query=&limit=&recencyDays=&provider=`

### Debates (`/api/debates`) - auth required
- `POST /` (create + queue run)
- `GET /`
- `GET /:debateId`
- `GET /:debateId/transcript`
- `POST /:debateId/chat`
- `GET /:debateId/chat`

### Persona chats (`/api/persona-chats`) - auth required
- `POST /`
- `GET /`
- `GET /:chatId`
- `POST /:chatId/messages`

### Simple chats (`/api/simple-chats`) - auth required
- `POST /`
- `GET /`
- `GET /:chatId`
- `POST /:chatId/messages`

### Settings (`/api/settings`) - auth required
- `GET /responsible-ai`
- `PUT /responsible-ai`
- `GET /web`
- `PUT /web`
- `GET /theme`
- `PUT /theme`

### Images (`/api/images`) - auth required
- `POST /generate`
- `GET /:imageId`

### Admin (`/api/admin`) - auth + `viewGovernance`
- `GET /overview`
- `GET /debates/:debateId`
- `GET /personas`
- `GET /chats`
- `GET /chats/:chatId`
- `POST /governance-chat/session`
- `GET /governance-chat`
- `GET /governance-chat/:chatId`
- `POST /governance-chat/:chatId/messages`
- `POST /governance-chat/refresh-assets`

### Agentic (`/api/agentic`) - auth + `viewGovernance`
- `GET /tools`
- `POST /router/preview`
- `POST /plan`
- `GET /templates`
- `POST /templates`
- `DELETE /templates/:templateId`
- `GET /tasks`
- `GET /tasks/:taskId`
- `POST /tasks`
- `POST /tasks/:taskId/run`
- `GET /approvals`
- `POST /approvals/:approvalId/decision`
- `GET /jobs`
- `GET /events`
- `GET /metrics/overview`
- `GET /mcp/status`
- `GET /mcp/servers?includeTools=true`
- `GET /mcp/servers/:serverId/tools`
- `POST /mcp/servers/:serverId/call`

### Support (`/api/support`) - auth required (session or API key)
- `POST /messages`

## Working examples (curl)

### A) Bootstrap, login, and create API key
```bash
curl -i -X POST http://localhost:3000/api/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"AdminPass123!"}'
```

If already bootstrapped, login:
```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"AdminPass123!"}'
```

Create API key (use session cookie from response):
```bash
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H 'Content-Type: application/json' \
  -H 'Cookie: pd_session=<SESSION_TOKEN>' \
  -d '{"name":"postman-key"}'
```

### B) Simple chat create + message
Create:
```bash
curl -X POST http://localhost:3000/api/simple-chats \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_KEY>' \
  -d '{
    "title":"Simple Chat",
    "context":"General support",
    "knowledgePackIds":[],
    "settings":{"model":"gpt-4.1-mini","temperature":0.4,"maxResponseWords":220}
  }'
```

Send message (note payload is `{ "message": "..." }`):
```bash
curl -X POST http://localhost:3000/api/simple-chats/<CHAT_ID>/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_KEY>' \
  -d '{"message":"hello","historyLimit":14}'
```

### C) Persona chat create + message
Create (selectedPersonas must be array of objects):
```bash
curl -X POST http://localhost:3000/api/persona-chats \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_KEY>' \
  -d '{
    "title":"Team Chat",
    "context":"Planning discussion",
    "selectedPersonas":[{"type":"saved","id":"big-tex"}],
    "settings":{"model":"gpt-4.1-mini","temperature":0.6,"maxWordsPerTurn":140,"engagementMode":"chat"}
  }'
```

Send message (payload uses `message`, not role/content pairs):
```bash
curl -X POST http://localhost:3000/api/persona-chats/<CHAT_ID>/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_KEY>' \
  -d '{"message":"Who should weigh in?","historyLimit":14}'
```

### D) Debate create/run + transcript retrieval
Create debate (returns queued + debateId):
```bash
curl -X POST http://localhost:3000/api/debates \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_KEY>' \
  -d '{
    "topic":"Risk of screen time for young people",
    "context":"Public health perspective",
    "selectedPersonas":[{"type":"saved","id":"big-tex"}],
    "knowledgePackIds":[],
    "settings":{"rounds":3,"maxWordsPerTurn":120,"moderationStyle":"neutral","sourceGroundingMode":"light","model":"gpt-4.1-mini","temperature":0.7,"includeModerator":true}
  }'
```

Get debate metadata:
```bash
curl -H 'x-api-key: <YOUR_KEY>' \
  http://localhost:3000/api/debates/<DEBATE_ID>
```

Download transcript markdown:
```bash
curl -L -H 'x-api-key: <YOUR_KEY>' \
  http://localhost:3000/api/debates/<DEBATE_ID>/transcript
```

### E) Support concierge (grounded docs)
```bash
curl -X POST http://localhost:3000/api/support/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_KEY>' \
  -d '{"message":"How do I create a persona chat?"}'
```

## Postman guidance
1. Create collection variable `baseUrl = http://localhost:3000`.
2. Add either:
- Header `x-api-key` at collection level, or
- Auth/login requests with cookie handling.
3. Use raw JSON bodies exactly matching schemas above.
4. For ingest route use `form-data` with `file` + optional `id/title/description/tags`.
