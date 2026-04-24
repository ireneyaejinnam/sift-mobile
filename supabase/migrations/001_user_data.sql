-- User data tables for Sift
-- Run this in your Supabase SQL editor or via supabase db push

-- ── user_profiles ────────────────────────────────────────────
create table if not exists user_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  interests    text[]  not null default '{}',
  borough      text    not null default '',
  neighborhood text    not null default '',
  travel_range text    not null default '',
  vibe         text    not null default '',
  budget       text    not null default '',
  free_days    text[]  not null default '{}',
  free_time    text[]  not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── saved_events ─────────────────────────────────────────────
create table if not exists saved_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  event_id         text not null,
  list_name        text not null,
  event_title      text,
  event_start_date text,
  event_end_date   text,
  saved_at         timestamptz not null default now(),
  unique (user_id, event_id)
);

-- ── going_events ─────────────────────────────────────────────
create table if not exists going_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  event_id       text not null,
  event_title    text not null default '',
  event_date     text not null default '',
  event_end_date text,
  marked_at      timestamptz not null default now(),
  unique (user_id, event_id)
);

-- ── custom_lists ─────────────────────────────────────────────
create table if not exists custom_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ── Row Level Security ───────────────────────────────────────
alter table user_profiles  enable row level security;
alter table saved_events   enable row level security;
alter table going_events   enable row level security;
alter table custom_lists   enable row level security;

create policy "users manage own profile"
  on user_profiles for all using (auth.uid() = user_id);

create policy "users manage own saved events"
  on saved_events for all using (auth.uid() = user_id);

create policy "users manage own going events"
  on going_events for all using (auth.uid() = user_id);

create policy "users manage own custom lists"
  on custom_lists for all using (auth.uid() = user_id);

-- ── user_plan_event_orders ───────────────────────────────────
create table if not exists user_plan_event_orders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  plan_date  date not null,
  event_id   text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date, event_id)
);

create index if not exists idx_user_plan_event_orders_user_date
  on user_plan_event_orders(user_id, plan_date, sort_order);

alter table user_plan_event_orders enable row level security;

create policy "users manage own plan event orders"
  on user_plan_event_orders for all using (auth.uid() = user_id);
