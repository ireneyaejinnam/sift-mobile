-- Migration 013: User-contributed events visibility model
-- Adds publication_status to events, event_contributors join table, and RLS policies.

-- Step 1: Add columns to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS contributed_by TEXT;

-- Step 2: Contributor join table
CREATE TABLE IF NOT EXISTS event_contributors (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_contributors_user ON event_contributors(user_id);

-- Step 3: RLS on events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Public events visible to all authenticated users
CREATE POLICY "events_public" ON events FOR SELECT
  USING (publication_status = 'public');

-- Private events visible to contributors
CREATE POLICY "events_contributor" ON events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM event_contributors ec
    WHERE ec.event_id = id AND ec.user_id = auth.uid()::text
  ));

-- Allow inserts/updates via service key (API routes)
CREATE POLICY "events_insert_all" ON events FOR INSERT WITH CHECK (true);
CREATE POLICY "events_update_all" ON events FOR UPDATE USING (true);
CREATE POLICY "events_delete_all" ON events FOR DELETE USING (true);
