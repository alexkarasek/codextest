# User Guide

## Audience and scope
This guide is for day-to-day use of the web UI. It focuses on how to navigate the app and complete common tasks without calling APIs directly.

## Start here
1. Open `http://localhost:3000`.
2. If this is first run, create the bootstrap admin account.
3. Sign in.
4. Use the top navigation:
- `1. Chats`
- `2. Governance`
- `3. Admin & Config`

Use `Menu` (top-left area) for:
- Login / switch user
- Logout
- Documentation
- Support Concierge
- Help & Guides
- Users & Access quick jump

## UI navigation model

### 1) Chats
Primary work area for conversations.

Sub-views:
- `Simple Chat`: one assistant + optional knowledge packs.
- `Group Chat`: multi-persona conversation.

Inside `Group Chat`, use workspace toggles:
- `Live Group Chat`: conversational multi-persona orchestration.
- `Conversation Explorer`: browse and inspect prior conversations.

Inside `Live Group Chat`, use **Structured Debate Run** (in Session Configuration) for structured, round-based debate runs.

### 2) Governance
Monitoring and analytics:
- Matrix and visual charts for usage/cost/risk/sentiment.
- Agent coverage heat map (`Agent x Capability` or `Agent x Topic`) with weighted intensity:
  - message contribution
  - token share
  - novelty
  - citations/tool usage
  - user follow-up engagement
- Drilldowns and filters.
- Governance Admin Chat (internal governance assistant).
- Observability signals per conversation:
  - orchestration activity counts
  - LLM call counts
  - payload trace counts (sanitized)
  - tool run counts

### 3) Admin & Config
Configuration workspace with subtabs:
- `Personas`
- `Knowledge Studio`
- `Responsible AI`
- `Agentic`
- `Users & Access`

## Common workflows

## A) Start a Simple Chat
1. Go to `Chats` -> `Simple Chat`.
2. Enter title/context (optional).
3. Choose model/settings.
4. Optionally select knowledge packs.
5. Click create/start.
6. Send messages in chat.

Tips:
- Use history panel on the left to load previous sessions.
- Start a new session from the create controls to avoid continuing old context.

## B) Start a Group Chat with Personas
1. Go to `Chats` -> `Group Chat` -> `Live Group Chat`.
2. Create a session title/context.
3. Optionally select knowledge packs to ground the session.
4. Select one or more personas.
5. Choose engagement mode:
- `chat` (interactive, directed)
- `panel` (moderated discussion)
- `debate-work-order` (moderated convergence to outcome)
6. Use the **Debate Mode Template** button if you want to transition into a structured debate-mode setup.
7. Send message.

What to expect:
- In `chat` mode, personas mainly reply when directly addressed (for example, `@persona-name`).
- If no clear addressee is provided, moderator/orchestrator routes the turn and gives guidance.
- In `panel` mode, moderator facilitates discussion and asks one follow-up question (no winner).
- In `debate-work-order` mode, moderator drives toward a practical outcome, open risks, and next actions.

## C) Run Structured Debate
1. Go to `Chats` -> `Group Chat` -> `Live Group Chat` -> `Structured Debate Run`.
2. Complete steps in order:
- Step 1: topic/context (from Group Chat `Chat Title` and `Shared Context` above)
- Step 2: topic discovery (optional)
- Step 3: generate personas from topic (optional)
- Step 4: debate settings
- Step 5: attach knowledge (optional)
- Step 6: select participants
3. Run debate from the embedded Structured Debate Run panel.
4. Track progress as rounds execute sequentially.

After completion:
- Use `Conversation Explorer` to inspect transcript.
- Use transcript chat for follow-up Q&A with citations.

## D) Browse history and monitor risk flags
1. Go to `Chats` -> `Group Chat` -> `Conversation Explorer`.
2. Pick conversation type and load a session.
3. Review exchanges, risk chips, sentiment, and transcript chat/citations.
4. Transcript Q&A and download are available for debate-mode sessions.
5. Optional: click **Open Stage Replay** to visualize participant turns with active-speaker highlighting and playback controls.
6. In Stage Replay, open **Turn Explainability** to inspect orchestration/usage/tool trace details for the active turn.

Use this for top-down review, not only targeted search.

## E) Delete / reset workflows
1. In chat history lists (`Simple Chat` and `Persona Chat`), use **Delete** on a session.
2. In `Admin & Config -> Personas` and `Knowledge Studio`, use **Delete** on a card.
3. Delete prompt behavior:
- Press Enter for `archive` (recommended): removes from normal lists but keeps governance visibility.
- Type `hard` for permanent delete (admin only).
4. In `Admin & Config -> Users & Access`, admins can run **Demo Reset**:
- `Usage Only`: clears chats, runs, and events.
- `Full Reseed`: also clears personas and knowledge packs.
- Keep toggles let you preserve users, API keys, settings, and logo.

## E) Create and manage personas
1. Go to `Admin & Config` -> `Personas`.
2. Fill required fields:
- `id` (slug)
- `displayName`
- `systemPrompt`
3. Save persona.
4. Edit/duplicate/delete from the persona list.
5. Optional: set `Avatar` as emoji or image URL to personalize stage replay and roster visuals.

Notes:
- Optional fields can be inferred from prompt content.
- Persona-specific knowledge packs can be attached in the form.

## F) Build knowledge packs
1. Go to `Admin & Config` -> `Knowledge Studio`.
2. Use either:
- **Upload**: `.txt`, `.pdf`, `.jpg/.jpeg/.png`, `.doc`, `.docx`
- **Web Ingest**: paste a URL, preview the extracted text, and choose create/append/overwrite
3. Optionally set a web allowlist/denylist to control which domains can be fetched.
4. Save and reuse packs in chats/debates/personas.

## G) Configure Responsible AI policy
1. Go to `Admin & Config` -> `Responsible AI`.
2. Edit red/yellow stoplight keywords.
3. Edit sentiment keyword sets and threshold.
4. Save policy.

This affects new rendering/analytics signals.

## H) Customize the UI theme
1. Go to `Admin & Config` -> `Theme`.
2. Edit theme variables or typography JSON.
3. Save to apply immediately.

## I) Manage users and access
1. Go to `Admin & Config` -> `Users & Access`.
2. Create users, set roles, reset credentials.
3. Generate API keys when needed for external tools.

Reminder:
- Raw API key is shown once at creation time.

## J) Run autonomous multi-persona image generation (one click)
1. Go to `Admin & Config` -> `Agentic`.
2. In Presets, choose **Built-in: Autonomous Persona -> Image**.
3. Click **Load Preset**.
4. Optionally tweak the prompt in `step-1` input JSON.
5. Enable **Run Immediately** and click **Create Task**.
6. Open task detail to view step results (`image.url`, run files, final prompt).

Persisted outputs:
- `data/agentic/autonomy/<run-id>/transcript.md`
- `data/agentic/autonomy/<run-id>/result.json`
- `data/agentic/reports/autonomous-persona-image.md`

## K) Use Support and Documentation
- Support Concierge: `Menu` -> `Support` or `/support`
- Documentation module: `Menu` -> `Documentation` or `/documentation`
- API reference: `/docs/api`

## Data persistence
All state is file-based under `data/`:
- Personas: `data/personas/`
- Knowledge packs: `data/knowledge/`
- Debates: `data/debates/`
- Persona chats: `data/persona-chats/`
- Simple chats: `data/simple-chats/`
- Governance/auth/settings: `data/settings/`
- UI theme: `data/settings/theme.json`
- Support logs: `data/support/messages.jsonl`

## Practical usage guidance
- If a view feels crowded, use top tabs to narrow context before drilling into subtabs.
- Prefer starting a new chat session when testing new persona instructions.
- Use `Conversation Explorer` for auditing; use `Governance` for metrics trends.
- Use tooltips (`?`) on section headers for inline guidance.
