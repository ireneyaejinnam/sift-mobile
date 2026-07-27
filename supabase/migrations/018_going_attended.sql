-- Migration 018: "Went / attended" marker on going events.
--
-- Users can confirm they actually attended a past event they'd marked "Going".
-- This is distinct from `committed` (a pre-event purchase/commit intent). The
-- attendance signal feeds the taste profile as the strongest positive boost.
--
-- The client upsert (syncGoingEvent) always writes these columns, so they must
-- exist before the app build that references them ships.

ALTER TABLE going_events
  ADD COLUMN IF NOT EXISTS attended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attended_at timestamptz;

-- Optional server-side counter for attendance (mirrors going_count etc.).
ALTER TABLE user_event_interactions
  ADD COLUMN IF NOT EXISTS went_count integer NOT NULL DEFAULT 0;
