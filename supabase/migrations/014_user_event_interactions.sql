-- Track per-user per-event interaction state for recommendations
CREATE TABLE IF NOT EXISTS user_event_interactions (
  user_id TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  impression_count INT NOT NULL DEFAULT 0,
  skip_count INT NOT NULL DEFAULT 0,
  save_count INT NOT NULL DEFAULT 0,
  going_count INT NOT NULL DEFAULT 0,
  share_count INT NOT NULL DEFAULT 0,
  permanently_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE user_event_interactions ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own interactions
CREATE POLICY "users_own_interactions" ON user_event_interactions
  FOR ALL USING (user_id = auth.uid()::text);

-- Fast lookup for hidden events per user
CREATE INDEX idx_uei_user_hidden ON user_event_interactions (user_id) WHERE permanently_hidden = true;
