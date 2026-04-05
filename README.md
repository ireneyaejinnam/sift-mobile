# Sift

A curated event discovery app for NYC. Instead of overwhelming users with search results, Sift uses a short quiz to surface 3–5 relevant events matched to your mood, schedule, and neighborhood.

## Features

- **Discovery quiz** — pick categories, date range, and travel distance to get personalized event picks
- **Smart recommendations** — scoring engine weighs category, location, budget, schedule, recency, and more
- **Event detail** — full event info with tickets, calendar export, and sharing
- **Plan your weekend** — shortlist saved events, confirm a plan, and export to Google Calendar or Apple Calendar
- **Save & organize** — save events to custom lists ("Date ideas", "Free stuff", "With friends", etc.)
- **Calendar view** — track events you're going to
- **Guest mode** — browse without signing in; sign in to persist saves across sessions

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Framework | React Native (Expo ~52) |
| Navigation | Expo Router (file-based) |
| State | React Context API |
| Auth & Database | Supabase (Auth + PostgreSQL) |
| Local Persistence | AsyncStorage + Expo Secure Store |
| Analytics | Amplitude |
| Animations | React Native Reanimated |
| Icons | lucide-react-native |
| API / Cron | Vercel Serverless Functions |

## Project Structure

```
sift-mobile/
├── api/                        # Vercel serverless functions
│   ├── cron/ingest.ts          # Daily event ingestion cron job
│   └── user-count.ts           # GET /api/user-count → { user_count: N }
├── app/                        # Expo Router pages
│   ├── index.tsx               # Root / auth gate
│   ├── (auth)/                 # Sign-in screens
│   ├── (onboarding)/           # 4-step preference wizard
│   ├── (tabs)/                 # Main tabs (Discover, Plan, Profile)
│   └── event/[id].tsx          # Event detail screen
├── lib/
│   └── ingest/                 # Event ingestion pipeline (14 sources)
├── src/
│   ├── components/             # Reusable UI components
│   ├── context/                # UserContext (auth, saved events, preferences)
│   ├── data/                   # Fallback event data
│   ├── lib/                    # Recommendation engine, Supabase client, calendar, analytics
│   └── types/                  # TypeScript interfaces
└── vercel.json                 # Cron schedule config
```

## Event Ingestion Pipeline

A Vercel cron job runs daily at 7 AM UTC, pulling events from 14 sources:

**Ticketmaster** · **Eventbrite** · **NYC Parks** · **Museums** (MoMA, Whitney, New Museum, Brooklyn Museum) · **Pop-ups** · **NYCForFree** · **CozyCreatives** · **NYC Tourism** · **Meetup** · **Yelp** · **Dice.fm** · **Resident Advisor** · **NYC.gov** · **The Skint**

After fetching, events go through: normalize → geocode → reclassify → deduplicate → cleanup → upsert to Supabase.

## Quick Setup

### Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/) — `npm install -g expo-cli`
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (for the cron job)
- For iOS: Xcode + iOS Simulator
- For Android: Android Studio + emulator, or a physical device with Expo Go
- An [Amplitude](https://amplitude.com) project (free tier)

### Environment Variables

Copy `.env.example` and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_URL` | Supabase project URL (server-side) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side) |
| `TICKETMASTER_API_KEY` | Ticketmaster API key |
| `EVENTBRITE_OAUTH_TOKEN` | Eventbrite OAuth token |
| `EXPO_PUBLIC_AMPLITUDE_API_KEY` | Amplitude project API key |

### Install & Run

```bash
git clone <repo-url>
cd sift-mobile
npm install
```

```bash
# Start Expo dev server
npm start

# Run on iOS Simulator
npm run ios

# Run on Android emulator / device
npm run android
```

Scan the QR code with **Expo Go** (iOS/Android) to run on a physical device.

### Deploy API (Vercel)

The Vercel project only hosts the `/api` serverless functions (no web build). Push to `main` and Vercel will auto-deploy the cron job.

## Path Aliases

Import from `src/` using the `@/` alias:

```ts
import { SiftEvent } from '@/types/event';
import { theme } from '@/lib/theme';
```

## Notes

- If Supabase is unreachable, the app falls back to hardcoded event data in `src/data/events.ts`
- Auth is handled by Supabase; guest mode works fully without sign-in
- Analytics events fan out to Amplitude and a local AsyncStorage buffer — all fire-and-forget, never blocking the UI
- Onboarding funnel events: `onboarding_started` → `onboarding_step_1_complete` → `onboarding_step_2_complete` → `onboarding_step_3_complete` → `onboarding_complete`
- Sign-up funnel events: `sign_up_started` → `sign_up_completed`
- Activation event: `first_event_viewed` (fires once per install)
- `GET /api/user-count` is a public endpoint returning total registered users as `{ user_count: N }`, cached for 5 minutes
