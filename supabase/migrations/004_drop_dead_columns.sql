-- Migration 004: Drop dead scoring columns
-- quality_score, source_tier, curator_boost are not used by the app.
-- Ranking is now handled client-side via vibe_score + timeliness + completeness.
-- social_signal is kept — social pipeline is still being built.

ALTER TABLE events
  DROP COLUMN IF EXISTS quality_score,
  DROP COLUMN IF EXISTS source_tier,
  DROP COLUMN IF EXISTS curator_boost;

DROP INDEX IF EXISTS idx_events_quality;

-- 'boost' and 'pin' override types wrote to curator_boost (now gone).
-- Remove any stale overrides of those types so they don't error on apply.
DELETE FROM event_overrides WHERE override_type IN ('boost', 'pin');
