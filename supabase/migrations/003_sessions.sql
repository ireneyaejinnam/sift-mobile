-- Add sessions JSONB column for multi-session events.
-- Each element: { date, time?, venue_name?, address?, borough?, price_min?, price_max? }
-- Aggregate fields (start_date, end_date, price_min, price_max) remain as query-friendly summaries.

alter table events
  add column if not exists sessions jsonb default null;

-- Drop the intermediate parallel-array columns added in migration 002
-- (sessions supersedes them — richer and keeps date+location together)
alter table events
  drop column if exists available_locations;
