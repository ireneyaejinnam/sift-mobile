# Sift Mobile

NYC event discovery app built with Expo (SDK 54) + Supabase.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

Copy the template below and fill in your values (get them from a teammate):

```env
# Supabase — server-side only (ingest pipeline)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Supabase — client-side (safe to bundle)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# Event sources
TICKETMASTER_API_KEY=
EVENTBRITE_OAUTH_TOKEN=

# Firebase (analytics)
EXPO_PUBLIC_FIREBASE_IOS_APP_ID=
EXPO_PUBLIC_FIREBASE_IOS_API_SECRET=
EXPO_PUBLIC_FIREBASE_ANDROID_APP_ID=
EXPO_PUBLIC_FIREBASE_ANDROID_API_SECRET=

# Amplitude (analytics)
EXPO_PUBLIC_AMPLITUDE_API_KEY=

# AI
ANTHROPIC_API_KEY=

# Misc
ADMIN_SECRET=
GOOGLE_PLACES_API_KEY=

# Unsplash fallback images
UNSPLASH_ACCESS_KEY=
EXPO_PUBLIC_UNSPLASH_ACCESS_KEY=
```

### 3. Run Supabase migrations

One person per team does this (applies to the shared Supabase project):

```bash
# Requires supabase CLI + project linked
supabase db push
```

Or run each migration manually in the Supabase SQL editor:

- `supabase/migrations/003_vibe_taste.sql` — adds `vibe_score`, `vibe_checked`, `user_taste_profiles`
- `supabase/migrations/004_drop_dead_columns.sql` — drops deprecated scoring columns

### 4. Start the app

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

---

## Project structure

```
app/                    Expo Router screens
  (auth)/               Sign-in / sign-up
  (tabs)/               Main tabs: Discover, Plan, Profile
src/
  components/           Shared UI components
  lib/                  Data fetching (getEvents.ts), Supabase client, helpers
  types/                TypeScript types (event.ts)
lib/ingest/             Curated scraper pipeline (daily via GitHub Actions)
  run-daily.ts          CLI entry point — scrape → geocode → postprocess
  config.ts             Eventbrite org seeds, Luma calendars, museum config
lib/ai-collect-data/    AI discovery pipeline (every 3 days via GitHub Actions)
  run-all.ts            CLI entry point — collect → enrich → upsert
  score-scraped.ts      Vibe-check scraper events via gpt-4o-mini
.github/workflows/      GitHub Actions cron workflows
supabase/migrations/    SQL migration files
```

---

## Event ingestion

All events live in a single `events` table with a `source_type` column (`scraper` or `ai_discovery`). Two autonomous pipelines feed it:

### 1. AI Discovery (every 3 days)

Claude Sonnet 4.6 discovers events via web search, gpt-4o-mini enriches them.

```bash
npx tsx --env-file=.env lib/ai-collect-data/run-all.ts --limit 5 --keep-local
```

See `lib/ai-collect-data/README.md` for full docs.

### 2. Curated Scrapers (daily)

Scrapes Dice, Resident Advisor, Luma, Fever, Museums, Eventbrite (curated orgs only).

```bash
npx tsx --env-file=.env lib/ingest/run-daily.ts
```

### GitHub Actions

Both pipelines run automatically:

| Workflow | Schedule | What |
|----------|----------|------|
| `daily-ingest.yml` | Daily 7 UTC | Curated scrapers + geocode + postprocess |
| `ai-discovery.yml` | Every 3 days 11 UTC | AI pipeline + score scraped events |

Manually trigger from **GitHub > Actions > Run workflow**.

---

## Notes for groupmates

- After pulling, always run `npm install`
- Run migration `010_merge_ai_events.sql` in Supabase SQL editor if not already applied
- See `.env.example` for all required env vars
