# FAQ

## How do I create my first admin user?
Call `POST /api/auth/bootstrap` once, or use the login bootstrap UI.

## I’m logged in, where do I start in the UI?
Use top tab `1. Chats`. Start with `Simple Chat` for one assistant, or `Group Chat` for multi-persona conversations.

## Where is the full UI navigation guide?
Open `docs/UI_NAVIGATION.md` from the Documentation module at `/documentation`.

## Is there a quick onboarding checklist?
Yes. Open `docs/FIRST_10_MINUTES.md` from the Documentation module.

## How do I run a debate mode?
Go to `Chats -> Persona Chat -> Live Group Chat -> Structured Debate Run`, complete steps 1–6, then run.

## How do I review old chats/debates?
Use `Chats -> Persona Chat -> Conversation Explorer` to browse sessions and inspect risk/sentiment flags.

## How do deletes work?
Delete actions support two modes:
- `archive` (default/recommended): hide from normal chat/config lists, retained for governance analysis.
- `hard` (admin only): permanently remove content.

## Where do I configure personas and knowledge packs?
Use `Admin & Config -> Personas` and `Admin & Config -> Knowledge Studio`.

## Can I attach knowledge packs to a persona chat?
Yes. In `Chats -> Persona Chat -> Live Group Chat`, select knowledge packs in the session configuration before creating the chat.

## Can I move from a persona chat to a debate mode?
Yes. Use the **Debate Mode Template** button in persona chat setup to copy personas, knowledge packs, and context into **Structured Debate Run**.

## Do personas reply in fixed order in Group Chat?
No. Replies are mode-driven:
- `chat`: mostly directed; addressed personas reply, otherwise moderator routes.
- `panel`: moderator facilitates discussion and adds synthesis/questioning.
- `debate-work-order`: moderator pushes toward a concrete outcome and next actions.

## How do I ingest a web page into a knowledge pack?
Go to `Admin & Config -> Knowledge Studio`, use **Web Ingest**, paste the URL, and choose create/append/overwrite.

## How do I restrict which domains can be fetched?
Open `Admin & Config -> Knowledge Studio` and set the Web Access Policy allowlist/denylist.

## How do I change the UI theme?
Open `Admin & Config -> Theme` and edit the theme variables/typography JSON.

## Where do I find platform metrics and cost/risk views?
Open the `Governance` tab.

## Can I reset the demo quickly without terminal commands?
Yes. Admin users can open `Admin & Config -> Users & Access` and use **Demo Reset**:
- `Usage Only` clears chats/runs/events.
- `Full Reseed` also clears personas and knowledge packs.

## Does the app use a database?
No. All persistence is file-based in `data/`.

## Where do I find documentation and support?
- Documentation module: `http://localhost:3000/documentation`
- Support concierge: `http://localhost:3000/support`
- API docs: `http://localhost:3000/docs/api`

## How do I authenticate API calls from Postman?
Generate an API key in `Admin & Config -> Users & Access` and send `x-api-key` on requests.
