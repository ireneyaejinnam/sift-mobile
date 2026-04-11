-- ── Widen event_sessions unique key to include time ──────────
-- Allows same event + same date to have multiple sessions at different times.

-- Drop old (event_id, date) unique index
drop index if exists event_sessions_event_date_idx;

-- Make time NOT NULL with empty-string default so it's usable in a unique key
update event_sessions set time = '' where time is null;
alter table event_sessions alter column time set not null;
alter table event_sessions alter column time set default '';

-- New unique constraint
alter table event_sessions
  add constraint event_sessions_event_date_time_key
  unique (event_id, date, time);
