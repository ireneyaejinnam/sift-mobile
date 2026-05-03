-- Add neutral skip tracking and suppression for "Not now" swipes
ALTER TABLE user_event_interactions
  ADD COLUMN IF NOT EXISTS neutral_skip_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suppressed_until TIMESTAMPTZ;
