# AI Event Data Collection Pipeline

Collects NYC event data from 18+ sources, enriches each event via LLM, and upserts into Supabase.

**Two-vendor LLM stack:**
- **Claude Sonnet 4.6** — discovery only (native web search + best reasoning)
- **OpenAI gpt-4o-mini** — everything else (enrich, dedup, hooks, scoring, images) via Structured Outputs

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
| `--model MODEL` | `gpt-4o-mini` | LLM model for enrich step |
| `--collect-model MODEL` | `gpt-4o-mini` | LLM model for collect dedup/cancel checks |
| `--skip-cleanup` | — | Skip Step 1 |
| `--skip-collect` | — | Skip Step 2 |
| `--skip-enrich` | — | Skip Step 3 |
| `--skip-upsert` | — | Skip Step 4 |
| `--keep-local` | — | Keep local JSON files after upsert (default: delete) |

### LLM Vendor Routing

Set `LLM_PROVIDER` env var to control routing (`auto` is default):

| Provider | Discovery | Enrich/Dedup/Hooks/Images |
|----------|-----------|---------------------------|
| `auto` | Claude Sonnet 4.6 | OpenAI gpt-4o-mini |
| `claude` | Claude | Claude |
| `openai` | OpenAI (no web search) | OpenAI |

### Supported Models

| Model | Provider | Notes |
|-------|----------|-------|
| `gpt-4o-mini` | OpenAI | Default for enrich/dedup/hooks/images (Structured Outputs) |
| `claude-sonnet-4-6` | Anthropic | Default for discovery (native web search) |

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
2. **LLM dedup** (`gpt-4o-mini` via OpenAI) — skip if name semantically matches an already-collected event
3. **Cancellation check** (`gpt-4o-mini` via OpenAI) — fetch the event page, ask LLM if it's canceled/postponed

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

Before upserting, each event's image is validated and resolved via four-stage fallback:

1. **Validate existing** — HEAD request to check if `image_url` is accessible
2. **og:image** — scrape the `event_url` page for `<meta property="og:image">`
3. **Tavily** — web search for event image via tavily.com REST API
4. **LLM** (`gpt-4o-mini`) — ask model to suggest a direct image URL
5. **Unsplash** — search by event title (requires `UNSPLASH_ACCESS_KEY`)

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

# LLM — two-vendor stack
ANTHROPIC_API_KEY=     # discovery (Claude Sonnet 4.6 with web search)
OPENAI_API_KEY=        # enrich, dedup, hooks, images (gpt-4o-mini Structured Outputs)
TAVILY_API_KEY=        # image resolution web search (tavily.com)

# Sources
TICKETMASTER_API_KEY=
EVENTBRITE_OAUTH_TOKEN=
NYC_EVENT_CALENDAR_KEY=   # Azure APIM subscription key for api.nyc.gov

# Optional
LLM_PROVIDER=          # auto (default) | claude | openai
UNSPLASH_ACCESS_KEY=   # image fallback (Stage 5 of image resolution)
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

---

## GitHub Actions Setup

The AI discovery pipeline runs automatically via GitHub Actions every 3 days. To set it up:

### 1. Add repository secrets

Go to **GitHub repo > Settings > Secrets and variables > Actions > New repository secret** and add each:

| Secret name | Where to get it |
|-------------|-----------------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `TAVILY_API_KEY` | https://app.tavily.com (dashboard after sign-in) |
| `SUPABASE_URL` | Supabase dashboard > Settings > API > Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard > Settings > API > service_role key |
| `GOOGLE_PLACES_API_KEY` | https://console.cloud.google.com/apis/credentials |
| `UNSPLASH_ACCESS_KEY` | https://unsplash.com/oauth/applications |
| `TICKETMASTER_API_KEY` | https://developer.ticketmaster.com/products-and-docs/apis/getting-started/ |
| `EVENTBRITE_OAUTH_TOKEN` | https://www.eventbrite.com/platform/api-keys |

### 2. Verify the workflow

After pushing, go to **Actions** tab > **AI Event Discovery** > **Run workflow** (top right) to trigger manually. It should complete within 60 minutes.

### 3. Schedule

The workflow runs on `cron: '0 11 */3 * *'` — every 3 days at 11:00 UTC (7 AM ET). It also runs `score-scraped.ts` to vibe-check scraper-ingested events.

### 4. Billing caps (set these before enabling)

- **OpenAI**: https://platform.openai.com/settings/organization/limits → $25/month
- **Anthropic**: https://console.anthropic.com/settings/limits → $25/month
