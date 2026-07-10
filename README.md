# Spellr

A web platform for playing Magic: The Gathering online — with friends, with strangers, and against (or alongside) an AI player, including as a seat in a Commander pod. Card data and images come from the [Scryfall API](https://scryfall.com/docs/api).

Spellr is a **virtual tabletop**, not a rules engine: it gives every player real zones (library, hand, battlefield, graveyard, exile, command zone), real card images, life totals, and a shared game log — but it does not enforce Magic's rules (no stack, no priority, no mana pool, no automatic triggers or combat damage). Players move cards and adjust life manually, the same way you would with paper cards, just online and with an AI seat available if you want one.

## Stack

- **Next.js 14 (App Router) + TypeScript + Tailwind CSS**
- **PostgreSQL + Prisma** for persistence
- **Pusher Channels** for realtime game state sync (private per-seat channels for redacted state, a presence channel per game for the log and online/offline status) — chosen specifically so the app runs on ordinary serverless hosting like Vercel, with no custom Node server required
- **NextAuth.js** (Credentials provider — email + password)
- **Scryfall REST API**, cached in Postgres (`CardCache`) with a rate-limited fetch queue, for card search/autocomplete and images
- **Gemini API** (`@google/generative-ai`) for the AI player seat, via function-calling into the same action pipeline human players use

## Local development

1. **Database**: either run `docker compose up -d postgres`, or point `DATABASE_URL` at any Postgres 16 instance you already have.
2. **Realtime**: create a free app at [dashboard.pusher.com](https://dashboard.pusher.com) (the "Channels" product). You'll need its app id, key, secret, and cluster — realtime sync doesn't work without these, even locally, since there's no self-hosted socket server anymore.
3. **Environment**: `cp .env.example .env` and fill in `NEXTAUTH_SECRET` (e.g. `openssl rand -base64 32`) and the four `PUSHER_*`/`NEXT_PUBLIC_PUSHER_*` values from step 2. `GEMINI_API_KEY` is optional — AI seats simply sit out (and say so in the game log) if it's unset.
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
2. Provision a hosted Postgres (Vercel Postgres / Neon / Supabase all work) and set `DATABASE_URL` to its connection string in the Vercel project's environment variables.
3. Set `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (your production URL, e.g. `https://your-app.vercel.app`), the four `PUSHER_*` vars from your Pusher app, and optionally `GEMINI_API_KEY`.
4. Run `npx prisma migrate deploy` against the production `DATABASE_URL` once (locally, or as part of your deploy pipeline) to create the tables.
5. Deploy. Every push auto-redeploys.

Note: Pusher's free tier caps concurrent connections and daily messages — fine for casual play, but worth checking if you expect heavy usage.

## What's implemented

- Email/password auth, protected routes
- Deck builder: Scryfall-backed search/autocomplete, paste-a-decklist import (`1 Sol Ring` format), commander selection
- Lobby: create a 1v1 or 2-4 player Commander game, invite-code join, optional AI-filled seats
- Live multiplayer game table: battlefield/hand/library/graveyard/exile/command zone per seat, tap-to-tap, right-click "move to..." menu, life totals, turn tracker, realtime sync over Pusher, and hand privacy enforced server-side — each player has their own private channel carrying only their own redacted view, authorized per-request against who actually owns that seat, so opponents' hands are never sent to your browser (you only ever see their card count)
- Game log and online/offline status delivered over a shared presence channel per game
- An AI seat powered by Gemini function-calling, which acts through the exact same action handler as human players (no special-cased "AI rules"), capped at 12 actions per turn, and degrades gracefully (logs why, then passes) if no API key is configured or a call fails

## Explicitly not in this first pass

- Drag-and-drop battlefield positioning (cards auto-place; movement is via click + a "move to..." menu)
- Spectator mode
- In-game text chat (the game log is an action log, not chat)
- Mobile-optimized layout
- OAuth login providers
- Deployment automation / CI
- Real Magic rules enforcement: the stack, priority, mana pool, combat damage math, triggered/replacement effects, automatic commander damage tracking (the schema has a field for it, but nothing increments it yet), and tokens

These are natural next steps once the core tabletop experience has been used for a while — the code is structured (a single `actionHandler.execute()` entry point for all state changes, JSON-typed zone state) so rules can be layered in incrementally rather than requiring a rewrite.
