-- Add committed tracking to going_events.
-- "Committed" = user clicked through to buy tickets for this event.

ALTER TABLE going_events
  ADD COLUMN IF NOT EXISTS committed    BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ;
