# AI Event Data Collection Pipeline

Collects NYC event data from 13 sources, enriches each event via LLM + web search, and upserts into Supabase.

---

## Quick Start

```bash
# Full pipeline (default settings)
npx tsx --env-file=.env lib/ai-collect-data/run-all.ts

# Limit events per source (faster for testing)
npx tsx --env-file=.env lib/ai-collect-data/run-all.ts --limit 5

# Single source
npx tsx --env-file=.env lib/ai-collect-data/run-all.ts --source ticketmaster --limit 10
```

---

## Pipeline Steps

```
Step 1  cleanup   — delete expired events from Supabase (ai_events + ai_event_sessions)
Step 2  collect   — scrape event names + URLs from all sources → output/ai_new_events_name_list.json
Step 3  enrich    — LLM enriches each name via web search → output/ai_new_events.json
Step 4  upsert    — write ai_new_events.json → ai_events + ai_event_sessions in Supabase
```

Each step is independently runnable (see individual scripts below).

---

## All Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--limit N` | `20` | Max events collected per source |
| `--source NAME` | all | Only collect from this one source |
| `--model MODEL` | `gpt-5.4` | LLM model for enrich step |
| `--collect-model MODEL` | `gpt-4o-mini` | LLM model for collect dedup/cancel checks |
| `--skip-cleanup` | — | Skip Step 1 |
| `--skip-collect` | — | Skip Step 2 |
| `--skip-enrich` | — | Skip Step 3 |
| `--skip-upsert` | — | Skip Step 4 |
| `--keep-local` | — | Keep local JSON files after upsert (default: delete) |

### Supported Models

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt-4o-mini` | OpenAI | Fast, cheap — good for dedup/cancel checks |
| `gpt-5.4-mini` | OpenAI | |
| `gpt-5.4` | OpenAI | Best quality — recommended for enrich |
| `gemini-2.5-flash` | Google | Fast Gemini |
| `gemini-2.5-pro` | Google | Best quality Gemini |

---

## Sources (13)

| Name | Method | URL |
|------|--------|-----|
| `ticketmaster` | REST API | api.ticketmaster.com |
| `eventbrite` | REST API | api.eventbrite.com (seeded org list) |
| `residentadvisor` | GraphQL | ra.co/graphql |
| `luma` | HTML scrape | lu.ma/nyc |
| `whitney` | HTML scrape | whitney.org/events |
| `newmuseum` | GraphQL | admin.newmuseum.org/graphql |
| `nycforfree` | HTML scrape | nycforfree.com |
| `cozycratives` | HTML scrape | cozycratives.com |
| `theskint` | HTML scrape | theskint.com |
| `meetup` | HTML scrape | meetup.com/find/?location=New+York |
| `fever` | JSON-LD scrape | fever.com (10 category pages) |
| `dice` | `__NEXT_DATA__` scrape | dice.fm/browse/new_york |
| `nyctourism` | Sitemap + JSON-LD | nyctourism.com/things-to-do/events |
| `nycgov` | REST API | api.nyc.gov/calendar (Azure APIM) |

### nycgov Categories Collected
`Cultural`, `Free`, `Street and Neighborhood`, `Kids and Family`, `Environment`, `Tours`
(Athletic and Parks & Recreation excluded — mostly recurring fitness classes)

---

## Dedup Logic (collect step)

Three layers applied to each candidate event, in order:

1. **URL exact match** — skip if `source_url` already exists in local JSON or Supabase `ai_event_name_list`
2. **LLM dedup** (`gpt-4o-mini`) — skip if name semantically matches an already-collected event
3. **Cancellation check** (`gpt-4o-mini`) — fetch the event page, ask LLM if it's canceled/postponed

---

## Enrich Step

For each unprocessed name in `ai_new_events_name_list.json`, the LLM is given:
- The event name
- The source URL (where it was found)

The LLM uses **web search** to find the official page and extract:

| Field | Notes |
|-------|-------|
| `source_id` | `ai-{slug}-{YYYY-MM}` |
| `title` | From official source |
| `category` | One of 10 valid categories |
| `description` | 1–3 sentences |
| `start_date` / `end_date` | `YYYY-MM-DD` |
| `venue_name`, `address`, `borough` | Full address required |
| `price_min`, `price_max`, `is_free` | |
| `event_url` | Official page |
| `image_url` | Direct image URL |
| `ticket_url` | Optional |
| `tags` | Optional string array |
| `sessions` | Array of occurrences for multi-date events |

A 5-second delay is added between events. On rate-limit errors, retries automatically.

---

## Image Resolution (upsert step)

Before upserting, each event's image is validated and resolved via three-stage fallback:

1. **Validate existing** — HEAD request to check if `image_url` is accessible
2. **og:image** — scrape the `event_url` page for `<meta property="og:image">`
3. **LLM** (`gpt-5.4`) — web search for a direct image URL
4. **Unsplash** — search by event title (requires `UNSPLASH_ACCESS_KEY`)

---

## Supabase Tables

| Table | Description |
|-------|-------------|
| `ai_events` | One row per event (upsert on `source_id`) |
| `ai_event_sessions` | One row per occurrence (upsert on `event_id, date`) |
| `ai_event_name_list` | Dedup registry of collected names + source URLs |

**Cascade delete:** deleting from `ai_events` automatically deletes its sessions.

To clear all tables and start fresh:
```sql
TRUNCATE ai_event_sessions, ai_events, ai_event_name_list RESTART IDENTITY CASCADE;
```

---

## Required Environment Variables

```bash
# Supabase (server-side)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# LLM
OPENAI_API_KEY=        # collect + enrich (OpenAI models) + fix-images
GEMINI_API_KEY=        # enrich (Gemini models) + collect if --collect-model gemini-*

# Sources
TICKETMASTER_API_KEY=
EVENTBRITE_OAUTH_TOKEN=
NYC_EVENT_CALENDAR_KEY=   # Azure APIM subscription key for api.nyc.gov

# Optional
UNSPLASH_ACCESS_KEY=   # image fallback (Stage 4 of image resolution)
```

---

## Running Individual Steps

```bash
# Step 1: cleanup only
npx tsx --env-file=.env lib/ai-collect-data/cleanup-expired.ts

# Step 2: collect only
npx tsx --env-file=.env lib/ai-collect-data/collect-names.ts

# Step 3: enrich only (reads existing ai_new_events_name_list.json)
npx tsx --env-file=.env lib/ai-collect-data/enrich-events.ts

# Step 4: upsert only (reads existing ai_new_events.json)
npx tsx --env-file=.env lib/ai-collect-data/upsert-ai-events.ts

# Keep local JSON after upsert (for inspection)
npx tsx --env-file=.env lib/ai-collect-data/upsert-ai-events.ts --keep-local
```

---

## Local Output Files

Stored in `lib/ai-collect-data/output/` (deleted after upsert unless `--keep-local`):

| File | Content |
|------|---------|
| `ai_new_events_name_list.json` | Collected names + source URLs |
| `ai_new_events.json` | LLM-enriched event objects |

---

## App Integration

Set `EXPO_PUBLIC_EVENTS_SOURCE=ai` in `.env` to point the app at these tables:

```
ai_events          → EVENTS_TABLE
ai_event_sessions  → SESSIONS_TABLE
```
