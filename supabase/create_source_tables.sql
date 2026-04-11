-- ── Create source-prefixed event tables ─────────────────────
-- Run this in the Supabase SQL editor, replacing "nycforfree"
-- with your source name to create a new isolated table pair.
--
-- Usage: replace all occurrences of "nycforfree" with your source name,
-- then run in Supabase SQL editor.

-- ── Events table ─────────────────────────────────────────────
create table if not exists nycforfree_events (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  source_id    text not null,
  title        text not null,
  description  text,
  category     text,
  start_date   text,
  end_date     text,
  venue_name   text,
  address      text,
  neighborhood text,
  borough      text,
  latitude     numeric,
  longitude    numeric,
  price_min    numeric,
  price_max    numeric,
  is_free      boolean not null default false,
  currency     text,
  ticket_url   text,
  event_url    text,
  image_url    text,
  on_sale_date text,
  tags         text[],
  expires_at   text,
  created_at   timestamptz not null default now(),
  unique (source, source_id)
);

-- ── Sessions table ────────────────────────────────────────────
create table if not exists nycforfree_event_sessions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references nycforfree_events(id) on delete cascade,
  date        date not null,
  time        text not null default '',
  venue_name  text,
  address     text,
  borough     text,
  price_min   numeric,
  price_max   numeric,
  created_at  timestamptz not null default now(),
  unique (event_id, date, time)
);

create index if not exists nycforfree_event_sessions_date_idx    on nycforfree_event_sessions(date);
create index if not exists nycforfree_event_sessions_borough_idx on nycforfree_event_sessions(borough);

-- ── Row-level security (allow anon reads) ─────────────────────
alter table nycforfree_events         enable row level security;
alter table nycforfree_event_sessions enable row level security;

do $$ begin
  create policy "anon can read nycforfree_events"
    on nycforfree_events for select to anon using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated can read nycforfree_events"
    on nycforfree_events for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "anon can read nycforfree_event_sessions"
    on nycforfree_event_sessions for select to anon using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated can read nycforfree_event_sessions"
    on nycforfree_event_sessions for select to authenticated using (true);
exception when duplicate_object then null;
end $$;
