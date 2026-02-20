# First 10 Minutes

## Goal
Get from first login to a successful end-to-end workflow quickly.

## 0:00-1:00 Sign in
1. Open `http://localhost:3000`.
2. If prompted, create the first admin account.
3. Log in.

## 1:00-3:00 Create your first persona
1. Go to `Admin & Config -> Personas`.
2. Create a persona with:
- `id` (slug)
- `displayName`
- `systemPrompt`
3. Save.

Tip: keep the prompt simple for first test, then iterate.

## 3:00-5:00 Create one knowledge pack
1. Go to `Admin & Config -> Knowledge Studio`.
2. Upload a `.txt` or `.pdf`, or use **Web Ingest** with a URL.
3. Confirm it appears in the library.

## 5:00-7:00 Run a quick group chat
1. Go to `Chats -> Persona Chat -> Live Group Chat`.
2. Create a new group chat session.
3. Optionally attach a knowledge pack for this chat session.
4. Select your persona.
5. Send a message.

Expected result:
- Orchestrator entry appears.
- Persona response appears.

## 7:00-8:30 Run a debate mode
1. Go to `Chats -> Persona Chat -> Live Group Chat -> Structured Debate Run`.
2. Enter topic via `Chat Title` and optional `Shared Context`.
3. Select personas (or leave empty for dynamic selection).
4. Run debate.

## 8:30-9:30 Review history
1. Go to `Chats -> Persona Chat -> Conversation Explorer`.
2. Load your new chat/debate session.
3. Check exchange-level risk/sentiment indicators.

## 9:30-10:00 Check governance snapshot
1. Open `Governance`.
2. Confirm usage/cost/risk metrics updated.

## Next recommended steps
1. Open `Documentation` from the system menu and read:
- `UI Navigation Map`
- `User Guide`
- `Troubleshooting`
2. Configure `Responsible AI` keywords.
3. Adjust the UI theme in `Admin & Config -> Theme`.
4. Add more personas and attach specialized knowledge packs (persona or chat-level).
5. Use `Support Concierge` for grounded how-to help.
6. Optional cleanup between demos: `Admin & Config -> Users & Access -> Demo Reset`.
