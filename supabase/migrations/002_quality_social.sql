-- Migration 002: Event quality columns + social post pipeline tables
-- Run this against your Supabase project via the SQL editor or CLI.

-- ──────────────────────────────────────────────
-- Phase 1: Quality columns on events table
-- ──────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS quality_score   FLOAT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_tier     FLOAT   NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS curator_boost   FLOAT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_suppressed   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS social_signal   INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vibe_tags       TEXT[]  NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_events_quality
  ON events(quality_score DESC);

CREATE INDEX IF NOT EXISTS idx_events_suppressed
  ON events(is_suppressed)
  WHERE is_suppressed = TRUE;

CREATE INDEX IF NOT EXISTS idx_events_vibe_tags
  ON events USING GIN(vibe_tags);


-- ──────────────────────────────────────────────
-- Phase 2: Social post submissions
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_post_submissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  url             TEXT        NOT NULL,
  platform        TEXT        NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'other')),
  submitted_by    TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Raw post metadata (fetched via oEmbed)
  caption         TEXT,
  thumbnail_url   TEXT,
  author_handle   TEXT,
  author_followers INT,
  like_count      INT,
  view_count      INT,
  external_link   TEXT,
  manual_notes    TEXT,

  -- Claude extraction results
  extracted_title       TEXT,
  extracted_venue       TEXT,
  extracted_address     TEXT,
  extracted_date        TEXT,         -- raw string from caption ("this Friday", "Apr 12")
  extracted_date_parsed DATE,         -- resolved absolute date
  extracted_time        TEXT,
  extracted_price       TEXT,
  extracted_ticket_url  TEXT,
  extracted_category    TEXT,
  extracted_vibe_tags   TEXT[],
  extraction_confidence FLOAT,        -- 0–1 overall extraction confidence
  extraction_raw        JSONB,        -- full Claude response

  -- Pipeline state
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'fetching',
    'extracting',
    'matching',
    'matched',
    'draft_created',
    'needs_review',
    'rejected',
    'published'
  )),
  match_confidence  FLOAT,
  match_event_id    UUID REFERENCES events(id),
  reject_reason     TEXT,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_event_id  UUID REFERENCES events(id)
);

CREATE INDEX IF NOT EXISTS idx_social_submissions_status
  ON social_post_submissions(status);

CREATE INDEX IF NOT EXISTS idx_social_submissions_submitted_at
  ON social_post_submissions(submitted_at DESC);


-- ──────────────────────────────────────────────
-- Social post ↔ event link table (many-to-many)
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_social_links (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  submission_id UUID        NOT NULL REFERENCES social_post_submissions(id) ON DELETE CASCADE,
  platform      TEXT        NOT NULL,
  post_url      TEXT        NOT NULL,
  like_count    INT,
  view_count    INT,
  attached_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_event_social_links_event
  ON event_social_links(event_id);

CREATE INDEX IF NOT EXISTS idx_event_social_links_submission
  ON event_social_links(submission_id);


-- ──────────────────────────────────────────────
-- Editorial overrides (curator boost / suppress)
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_overrides (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  override_type TEXT        NOT NULL CHECK (override_type IN (
    'boost',     -- raise curator_boost score (0–0.5)
    'suppress',  -- hide from feed
    'relabel',   -- fix title, category, description
    'pin'        -- force to top of feed
  )),
  boost_value   FLOAT,      -- used for type='boost'
  override_data JSONB,      -- used for type='relabel': { title, category, description }
  note          TEXT,
  applied_by    TEXT,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, override_type)
);

CREATE INDEX IF NOT EXISTS idx_event_overrides_event
  ON event_overrides(event_id);
