-- ── Create event_sessions table ──────────────────────────────
create table if not exists event_sessions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  date        date not null,
  time        text,
  venue_name  text,
  address     text,
  borough     text,
  price_min   numeric,
  price_max   numeric,
  created_at  timestamptz not null default now()
);

create unique index if not exists event_sessions_event_date_idx on event_sessions(event_id, date);
create index if not exists event_sessions_date_idx              on event_sessions(date);
create index if not exists event_sessions_borough_idx           on event_sessions(borough);

-- ── Migrate data: events.sessions JSONB → event_sessions rows ──
insert into event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
select
  e.id,
  (s->>'date')::date,
  s->>'time',
  s->>'venue_name',
  s->>'address',
  s->>'borough',
  (s->>'price_min')::numeric,
  (s->>'price_max')::numeric
from events e,
     jsonb_array_elements(e.sessions) as s
where e.sessions is not null
  and (s->>'date') is not null
  and (s->>'date') != ''
on conflict do nothing;

-- ── Migrate events with available_dates but no sessions JSONB ──
insert into event_sessions (event_id, date, venue_name, address, borough, price_min, price_max)
select
  e.id,
  d::date,
  e.venue_name,
  e.address,
  e.borough,
  e.price_min,
  e.price_max
from events e,
     unnest(e.available_dates) as d
where e.sessions is null
  and e.available_dates is not null
  and array_length(e.available_dates, 1) > 0
on conflict do nothing;

-- ── For events with neither sessions nor available_dates ──
-- (single-session events) — create one session from start_date
insert into event_sessions (event_id, date, venue_name, address, borough, price_min, price_max)
select
  e.id,
  e.start_date::date,
  e.venue_name,
  e.address,
  e.borough,
  e.price_min,
  e.price_max
from events e
where e.sessions is null
  and (e.available_dates is null or array_length(e.available_dates, 1) is null)
  and e.start_date is not null
on conflict do nothing;

-- ── Helper function: deduplicate sessions for one event ──────
create or replace function deduplicate_event_sessions(p_event_id uuid)
returns void language sql as $$
  delete from event_sessions
  where id in (
    select id from (
      select id,
             row_number() over (partition by event_id, date order by created_at asc) as rn
      from event_sessions
      where event_id = p_event_id
    ) t
    where rn > 1
  );
$$;

-- ── Drop deprecated columns ───────────────────────────────────
alter table events drop column if exists sessions;
alter table events drop column if exists available_dates;
alter table events drop column if exists available_locations;
