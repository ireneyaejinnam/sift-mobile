ALTER TABLE events     ADD COLUMN IF NOT EXISTS hook_text text;
ALTER TABLE ai_events  ADD COLUMN IF NOT EXISTS hook_text text;

CREATE INDEX IF NOT EXISTS idx_events_hook_text_null    ON events(id)     WHERE hook_text IS NULL AND is_suppressed = false;
CREATE INDEX IF NOT EXISTS idx_ai_events_hook_text_null ON ai_events(id)  WHERE hook_text IS NULL AND is_suppressed = false;
