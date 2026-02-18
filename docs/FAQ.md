# FAQ

## How do I create my first admin user?
Call `POST /api/auth/bootstrap` once, or use the login bootstrap UI.

## I’m logged in, where do I start in the UI?
Use top tab `1. Chats`. Start with `Simple Chat` for one assistant, or `Group Chat` for multi-persona conversations.

## Where is the full UI navigation guide?
Open `docs/UI_NAVIGATION.md` from the Documentation module at `/documentation`.

## Is there a quick onboarding checklist?
Yes. Open `docs/FIRST_10_MINUTES.md` from the Documentation module.

## How do I run a formal debate?
Go to `Chats -> Group Chat -> Formal Debate Setup`, complete steps 1–6, then run.

## How do I review old chats/debates?
Use `Chats -> Group Chat -> History Explorer` to browse sessions and inspect risk/sentiment flags.

## Where do I configure personas and knowledge packs?
Use `Admin & Config -> Personas` and `Admin & Config -> Knowledge Studio`.

## Where do I find platform metrics and cost/risk views?
Open the `Governance` tab.

## Does the app use a database?
No. All persistence is file-based in `data/`.

## Where do I find documentation and support?
- Documentation module: `http://localhost:3000/documentation`
- Support concierge: `http://localhost:3000/support`
- API docs: `http://localhost:3000/docs/api`

## How do I authenticate API calls from Postman?
Generate an API key in `Admin & Config -> Users & Access` and send `x-api-key` on requests.
