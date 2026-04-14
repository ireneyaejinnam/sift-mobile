-- Migration 003: Vibe scores on events + user taste profiles
-- Run in Supabase SQL editor or via: supabase db push

-- ── Add vibe columns to events ───────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS vibe_score   SMALLINT,         -- 1–10, NULL = not yet checked
  ADD COLUMN IF NOT EXISTS vibe_checked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_events_vibe_score
  ON events(vibe_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_events_unchecked
  ON events(vibe_checked)
  WHERE NOT vibe_checked;

-- ── User taste profiles ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_taste_profiles (
  user_id           UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- category → multiplier (0.3–2.0). Missing key = 1.0 (neutral).
  category_weights  JSONB   NOT NULL DEFAULT '{}',
  liked_event_ids   TEXT[]  NOT NULL DEFAULT '{}',   -- last 100 liked
  disliked_event_ids TEXT[] NOT NULL DEFAULT '{}',   -- last 100 disliked
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_taste_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own taste profile"
  ON user_taste_profiles FOR ALL
  USING (auth.uid() = user_id);
