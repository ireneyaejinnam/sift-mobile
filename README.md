# Sift

A curated event discovery app for NYC. Instead of overwhelming users with search results, Sift uses a short quiz to surface 3–5 relevant events matched to your mood, schedule, and neighborhood.

## Features

- **Discovery quiz** — pick categories, date range, and travel distance to get personalized event picks
- **Curated NYC events** — arts, music, comedy, food, outdoors, nightlife, fitness, theater, workshops, pop-ups
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
| Persistence | AsyncStorage + Expo Secure Store |
| Animations | React Native Reanimated |
| Icons | lucide-react-native |

## Project Structure

```
sift-mobile/
├── app/                    # Expo Router pages
│   ├── index.tsx           # Root / auth gate
│   ├── (auth)/             # Sign-in screens
│   ├── (onboarding)/       # Preference setup wizard
│   └── (tabs)/             # Main tab screens (Discover, Profile)
└── src/
    ├── components/         # Reusable UI components
    ├── context/            # UserContext (auth, saved events, preferences)
    ├── data/               # Hardcoded NYC event data
    ├── lib/                # Recommendation engine, storage, theme
    └── types/              # TypeScript interfaces
```

## Quick Setup

### Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/) — `npm install -g expo-cli`
- For iOS: Xcode + iOS Simulator
- For Android: Android Studio + emulator, or a physical device with Expo Go

### Install

```bash
git clone <repo-url>
cd sift-mobile
npm install
```

### Run

```bash
# Start Expo dev server (opens QR code + browser DevTools)
npm start

# Run directly on iOS Simulator
npm run ios

# Run on Android emulator / device
npm run android

# Run in browser (limited native feature support)
npm run web
```

Once the dev server is running, scan the QR code with **Expo Go** (iOS/Android) to run on a physical device.

## Path Aliases

Import from `src/` using the `@/` alias:

```ts
import { SiftEvent } from '@/types/event';
import { theme } from '@/lib/theme';
```

## Notes

- Event data is hardcoded in `src/data/events.ts` (NYC events, March 2026 demo dataset)
- Auth is local-only (no backend) — credentials are stored via Expo Secure Store
- The app works fully in guest mode; sign-in enables cross-session persistence of saved events
