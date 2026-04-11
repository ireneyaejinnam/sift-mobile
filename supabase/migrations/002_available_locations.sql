-- Add available_locations column to events table for multi-venue sessions
-- Parallels the existing available_dates text[] column

alter table events
  add column if not exists available_locations text[] default null;
