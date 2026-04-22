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

drop policy if exists "users manage own plan event orders" on user_plan_event_orders;
create policy "users manage own plan event orders"
  on user_plan_event_orders for all using (auth.uid() = user_id);
