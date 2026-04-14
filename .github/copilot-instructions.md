## Quick orientation for AI coding agents

This file gives focused, practical context so an AI assistant can be immediately productive in the Sift codebase.

- Tech stack: TypeScript + Expo (React Native) using Expo Router for file-based navigation. Serverless API routes live in `api/` (Vercel). Data & auth use Supabase.
- Entry points:
  - Mobile app pages: `app/` (Expo Router). e.g. `app/(tabs)/discover.tsx` → `/discover` route.
  - Serverless functions: `api/*.ts` and `api/cron/*` (deployed on Vercel). `vercel.json` contains cron schedule.
  - Ingestion pipeline: `lib/ingest/` (fetch → normalize → geocode → dedupe → upsert to Supabase).

Key commands (from `package.json`):
- `npm install` — install deps
- `npm start` — start Expo dev server
- `npm run ios` — run iOS simulator
- `npm run android` — run Android emulator/device

Important files & directories to reference when making changes
- `app/` — UI screens and routes (Expo Router). Prefer file-based routing; change file path to alter routes.
- `src/` — app logic, hooks, types and shared components (imports commonly use `@/` alias). Example: `@/lib/theme`, `@/types/event`.
- `lib/` — server-side utilities, ingestion scripts, and AI data-collection helpers (see `lib/ai-collect-data/`). Use these for offline/cron tasks.
- `api/` — serverless functions (Vercel). Keep server-only secrets out of client bundles; use `SUPABASE_SERVICE_KEY` server-side only.
- `supabase/` — SQL migrations and test data.
- `scripts/` — utility scripts (backfills, imports, pruning).

Conventions and patterns to follow
- Routing: add pages under `app/` to create routes. Use file name segments for dynamic routes (e.g., `app/event/[id].tsx`).
- State: global state uses React Context (`src/context/UserContext.tsx`). Prefer context + local state; keep heavy logic in `src/lib/`.
- Data flow: ingestion produces normalized event objects in `lib/ingest/*` → upsert to Supabase. If Supabase is unavailable, the app falls back to `src/data/events.ts`.
- Path alias: `@/` points at `src/`; use it for imports instead of long relative paths.
- Secrets: server-only keys are stored in `.env` (see `.env` in repo). Never expose `SUPABASE_SERVICE_KEY` to client builds.

Integration points & external deps worth noting
- Supabase: auth, database, and server-side upserts. See `src/lib/supabase.ts` and `supabase/` migrations.
- Analytics: Amplitude (client-side) — key set in env as `EXPO_PUBLIC_AMPLITUDE_API_KEY`.
- Event sources: Ticketmaster, Eventbrite, NYCForFree, Meetup, Yelp, etc. The ingestion pipeline references many provider adapters in `lib/ingest/` and `ingest/`.
- AI/LLM: OpenAI, Anthropic, and Google (Gemini) are used in `lib/ai-collect-data/` and packages in package.json. Keys are set via env vars (see `.env`).

Small contract for edits
- Inputs: code edits under `app/`, `src/`, `lib/`, or `api/`.
- Outputs: runnable app via `npm start` and serverless changes deploy via Vercel.
- Error modes: UI must remain non-blocking; analytics and ingestion are fire-and-forget where possible.

Examples to reference when coding
- To add a route: create `app/new-screen.tsx` (use Expo Router patterns).
- To add a server route: create `api/your-route.ts` exporting a handler; test locally with `vercel dev` or via deployment.
- To extend ingestion: add adapter in `lib/ingest/` and wire it into `ingest/ingest-all.ts`.

If anything in this file is unclear or you need deeper examples (e.g., sample Supabase upsert flow or the ingestion normalization shape), ask which area to expand and I will add focused, discoverable snippets referencing exact files.
