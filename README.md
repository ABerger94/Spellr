# ManaVerse

A web platform for playing Magic: The Gathering online — with friends, with strangers, and against (or alongside) an AI player, including as a seat in a Commander pod. Card data and images come from the [Scryfall API](https://scryfall.com/docs/api).

ManaVerse is a **virtual tabletop**, not a rules engine: it gives every player real zones (library, hand, battlefield, graveyard, exile, command zone), real card images, life totals, and a shared game log — but it does not enforce Magic's rules (no stack, no priority, no mana pool, no automatic triggers or combat damage). Players move cards and adjust life manually, the same way you would with paper cards, just online and with an AI seat available if you want one.

## Stack

- **Next.js 14 (App Router) + TypeScript + Tailwind CSS**
- **PostgreSQL + Prisma** for persistence
- **Pusher Channels** for realtime game state sync (private per-seat channels for redacted state, a presence channel per game for the log and online/offline status) — chosen specifically so the app runs on ordinary serverless hosting like Vercel, with no custom Node server required
- **NextAuth.js** (Credentials provider — email + password)
- **Scryfall REST API**, cached in Postgres (`CardCache`) with a rate-limited fetch queue, for card search/autocomplete and images
- AI player seat via function-calling into the same action pipeline human players use, with four free-tier providers tried in order — **Gemini** (`@google/generative-ai`), then **Groq**, **Cerebras**, and **OpenRouter** (all three OpenAI-compatible, via `groq-sdk` pointed at each provider's endpoint) — falling through automatically if one errors or is rate-limited

## Local development

1. **Database**: either run `docker compose up -d postgres`, or point `DATABASE_URL` at any Postgres 16 instance you already have.
2. **Realtime**: create a free app at [dashboard.pusher.com](https://dashboard.pusher.com) (the "Channels" product). You'll need its app id, key, secret, and cluster — realtime sync doesn't work without these, even locally, since there's no self-hosted socket server anymore.
3. **Environment**: `cp .env.example .env` and fill in `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`) and the four `PUSHER_*`/`NEXT_PUBLIC_PUSHER_*` values from step 2. `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, and `OPENROUTER_API_KEY` are all optional and independent — AI seats simply sit out (and say so in the game log) if none is set; whichever are set are tried in that order, falling through to the next when a call errors or hits a rate limit. All four have permanently free tiers, so setting more than one is the easiest way to stop the AI from hitting quotas.
4. **Install & migrate**:
   ```
   npm install
   npm run db:migrate
   ```
5. **Run it**: `npm run dev` (plain `next dev` — no custom server) on `http://localhost:3000`.

### Optional: seed a few demo cards

`npm run db:seed` inserts a handful of hand-picked Commander staples (Sol Ring, Command Tower, Atraxa, etc.) directly into `CardCache` under fake `test-*` ids. This is only useful for offline demoing/testing the deck builder and game table without hitting Scryfall — real gameplay should just use the live card search, which populates the cache automatically as you use it.

## Deploying to Vercel

1. Push the repo to GitHub, then **Add New Project** in the Vercel dashboard and import it. Vercel auto-detects Next.js — no build config changes needed.
2. Provision a hosted Postgres (Vercel Postgres / Neon / Supabase all work) and set `DATABASE_URL` and `DIRECT_URL` in the Vercel project's environment variables. Prisma needs those two exact names — a pooled connection is required at runtime because Vercel's serverless functions open many short-lived connections that a small Postgres instance can't handle directly, while migrations need a direct (non-pooled) connection:
   - **Via Vercel's Supabase integration**: it auto-injects several `POSTGRES_*` variables. Copy `POSTGRES_PRISMA_URL`'s value into `DATABASE_URL`, and `POSTGRES_URL_NON_POOLING`'s value into `DIRECT_URL`.
   - **Manually (Supabase, Neon, etc.)**: in the provider's dashboard, find the pooled/"transaction mode" connection string (Supabase: port `6543`, `?pgbouncer=true`) for `DATABASE_URL`, and the direct/non-pooled one (port `5432`) for `DIRECT_URL`.
3. Set `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (your production URL, e.g. `https://your-app.vercel.app`), the four `PUSHER_*` vars from your Pusher app, and optionally any of `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`.
4. Deploy. The build runs `prisma migrate deploy` automatically before `next build`, so the database schema is created/updated on every deploy — no manual migration step needed. Every push auto-redeploys.

Note: Pusher's free tier caps concurrent connections and daily messages — fine for casual play, but worth checking if you expect heavy usage.

## What's implemented

- Email/password auth, protected routes
- Deck builder: Scryfall-backed search/autocomplete, paste-a-decklist import (`1 Sol Ring` format), commander selection
- Lobby: create a 1v1 or 2-4 player Commander game, invite-code join, optional AI-filled seats
- Live multiplayer game table: battlefield/hand/library/graveyard/exile/command zone per seat, tap-to-tap, right-click "move to..." menu, life totals, turn tracker, realtime sync over Pusher, and hand privacy enforced server-side — each player has their own private channel carrying only their own redacted view, authorized per-request against who actually owns that seat, so opponents' hands are never sent to your browser (you only ever see their card count)
- Game log and online/offline status delivered over a shared presence channel per game
- Every player (human or AI) is dealt a fresh 7-card opening hand automatically when a game starts, and can mulligan (Actions ▾ → Mulligan / the AI's `mulligan` function) during their first turn — a proper London mulligan: each one shuffles the hand back and deals a new 7, and the player owes that many cards on the bottom of their library once they keep
- An AI seat powered by function-calling, with up to four free-tier providers stacked as automatic fallbacks (Gemini → Groq → Cerebras → OpenRouter, whichever have keys configured), which acts through the exact same action handler as human players (no special-cased "AI rules"), capped at 12 actions per turn, and degrades gracefully (logs why, then passes) if no provider key is configured or every configured provider fails. It's given each of its own cards' rules text so it can decide when to adjust life (shock lands, burn, lifegain, unblocked combat damage) and when to mulligan a bad opening hand; a couple of things are handled automatically for every player regardless of AI involvement — a card drawn at the start of every turn, and lands/permanents that unconditionally read "enters the battlefield tapped" actually entering tapped (conditional ones like shock lands are left as a real choice, not auto-tapped)
- Each AI seat gets its own real, Scryfall-backed precon deck instead of a copy of the host's — a small library of four full 100-card mono-color Commander decks (99 cards + commander, like a real Commander decklist) and two 60-card 1v1 decks (`src/server/ai/aiPreconDecks.ts`), owned by a dedicated system account and built lazily on first use. Which precon lands on which AI seat is randomized per game (and, when there are enough for the format, no two AI seats in the same game share one)

## Explicitly not in this first pass

- Drag-and-drop battlefield positioning (cards auto-place; movement is via click + a "move to..." menu)
- Spectator mode
- In-game text chat (the game log is an action log, not chat)
- Mobile-optimized layout
- OAuth login providers
- Deployment automation / CI
- Real Magic rules enforcement: the stack, priority, mana pool, combat damage math, triggered/replacement effects, automatic commander damage tracking (the schema has a field for it, but nothing increments it yet), and tokens

These are natural next steps once the core tabletop experience has been used for a while — the code is structured (a single `actionHandler.execute()` entry point for all state changes, JSON-typed zone state) so rules can be layered in incrementally rather than requiring a rewrite.
