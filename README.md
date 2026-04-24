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
app/               Expo Router screens
  (auth)/          Sign-in / sign-up
  (tabs)/          Main tabs: Discover, Plan, Profile
src/
  components/      Shared UI components
  lib/             Data fetching (getEvents.ts), Supabase client, helpers
  types/           TypeScript types (event.ts)
lib/ingest/        Server-side event ingest pipeline
  ingest-all.ts    Entry point — runs all sources + post-processing
  normalize.ts     Title blocklist, spam filter, NYC geo filter
  config.ts        Source config, Eventbrite org seeds, disabled sources
  google-places.ts Fills missing venue photos from Google Places
  fetchImages.ts   Unsplash fallback — fills any remaining image gaps
api/cron/          Vercel cron handlers (scoring, cleanup)
supabase/
  migrations/      SQL migration files
```

---

## Ingest pipeline

Run manually or via cron:

```bash
npx tsx --env-file=.env lib/ingest/ingest-all.ts
```

| Step | Script | Purpose |
|------|--------|---------|
| Sources | `ingest-all.ts` | Pulls events from Ticketmaster, Eventbrite, NYC Parks, etc. |
| Geocode | `geocode.ts` | Fills missing lat/lng |
| Reclassify | `reclassify.ts` | Fixes wrong categories |
| Dedup | `dedup.ts` | Removes duplicate events |
| Cleanup | `cleanup.ts` | Deletes expired events |
| Photos | `google-places.ts` | Adds venue photos via Google Places |
| Images | `fetchImages.ts` | Unsplash fallback for anything still missing |

### Backfill images only

```bash
npx tsx --env-file=.env lib/ingest/fetchImages.ts
```

---

## Notes for groupmates

- After pulling a new branch, always run `npm install` — dependencies may have changed.
- New `.env` keys added recently: `UNSPLASH_ACCESS_KEY` and `EXPO_PUBLIC_UNSPLASH_ACCESS_KEY`. Ask a teammate for the values.
- Supabase migrations `003` and `004` need to be applied once to the shared project if not already done.
