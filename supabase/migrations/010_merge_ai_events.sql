-- Migration 010: Merge ai_events into events table with source_type discriminator.
-- After this migration, all events live in the `events` table.
-- ai_events tables are kept for a 7-day grace period, then can be dropped.

-- ── Step 1: Create event_sessions table (was in migration 004 but never applied) ──
CREATE TABLE IF NOT EXISTS event_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date        date NOT NULL,
  time        text NOT NULL DEFAULT '',
  venue_name  text,
  address     text,
  borough     text,
  price_min   numeric,
  price_max   numeric,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_sessions_event_date_time_key UNIQUE (event_id, date, time)
);

CREATE INDEX IF NOT EXISTS event_sessions_date_idx    ON event_sessions(date);
CREATE INDEX IF NOT EXISTS event_sessions_borough_idx ON event_sessions(borough);

-- ── Step 2: Add source_type column to events table ──
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'scraper';

-- ── Step 3: Add hook_text and source_url columns if missing ──
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS hook_text   TEXT,
  ADD COLUMN IF NOT EXISTS source_url  TEXT;

-- ── Step 4: Copy ai_events → events (preserve IDs used by saved/going/plan refs) ──
INSERT INTO events (
  id, source_id, source, title, category, description,
  start_date, end_date, venue_name, address, borough,
  price_min, price_max, is_free,
  event_url, image_url, ticket_url, on_sale_date,
  tags, vibe_score, is_suppressed,
  hook_text, source_url, source_type, created_at
)
SELECT
  ae.id, ae.source_id, ae.source, ae.title, ae.category, ae.description,
  ae.start_date, ae.end_date, ae.venue_name, ae.address, ae.borough,
  ae.price_min, ae.price_max, ae.is_free,
  ae.event_url, ae.image_url, ae.ticket_url, ae.on_sale_date::timestamptz,
  ae.tags, ae.vibe_score, ae.is_suppressed,
  NULL, NULL, 'ai_discovery', ae.created_at
FROM ai_events ae
ON CONFLICT (source, source_id) DO NOTHING;

-- ── Step 5: Copy ai_event_sessions → event_sessions for newly inserted events ──
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT
  e.id, aes.date, COALESCE(aes.time, ''), aes.venue_name, aes.address, aes.borough, aes.price_min, aes.price_max
FROM ai_event_sessions aes
JOIN ai_events ae ON ae.id = aes.event_id
JOIN events e ON e.source = ae.source AND e.source_id = ae.source_id
ON CONFLICT (event_id, date, time) DO NOTHING;

-- ── Step 6: Backfill event_sessions for existing scraper events (single-session fallback) ──
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT
  e.id, e.start_date, '', e.venue_name, e.address, e.borough, e.price_min, e.price_max
FROM events e
WHERE e.source_type = 'scraper'
  AND e.start_date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM event_sessions es WHERE es.event_id = e.id)
ON CONFLICT (event_id, date, time) DO NOTHING;

-- ── Step 7: Index on source_type ──
CREATE INDEX IF NOT EXISTS idx_events_source_type ON events(source_type);

-- DO NOT drop ai_events, ai_event_sessions, or ai_event_name_list yet.
-- Keep for 7-day grace period. Drop via migration 011 after confirming everything works.
