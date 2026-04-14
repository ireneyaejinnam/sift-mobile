-- ── ai_event_name_list ───────────────────────────────────────────
-- Stores deduplicated event names collected from all sources.
-- Acts as the input queue for AI enrichment.

create table if not exists ai_event_name_list (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sources    text[] not null default '{}',   -- which sources mentioned this event
  processed  boolean not null default false, -- true after enrichment step runs
  created_at timestamptz not null default now()
);

-- ── ai_events ────────────────────────────────────────────────────
-- AI-enriched events, independent of the main ingest pipeline.

create table if not exists ai_events (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null unique,
  source        text not null default 'ai',
  title         text not null,
  category      text not null,
  description   text,
  start_date    date not null,
  end_date      date,
  venue_name    text,
  address       text,
  borough       text,
  price_min     numeric not null default 0,
  price_max     numeric,
  is_free       boolean not null default false,
  event_url     text,
  image_url     text,
  ticket_url    text,
  on_sale_date  text,
  tags          text[] default '{}',
  vibe_score    numeric,
  is_suppressed boolean default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ai_events_start_date_idx on ai_events(start_date);
create index if not exists ai_events_category_idx   on ai_events(category);
create index if not exists ai_events_borough_idx    on ai_events(borough);

-- ── ai_event_sessions ────────────────────────────────────────────
-- Individual occurrences / showtimes for ai_events.

create table if not exists ai_event_sessions (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references ai_events(id) on delete cascade,
  date       date not null,
  time       text,
  venue_name text,
  address    text,
  borough    text,
  price_min  numeric,
  price_max  numeric,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_event_sessions_event_date_idx
  on ai_event_sessions(event_id, date);
create index if not exists ai_event_sessions_date_idx    on ai_event_sessions(date);
create index if not exists ai_event_sessions_borough_idx on ai_event_sessions(borough);
