alter table custom_lists
  add column if not exists sort_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by sort_order asc, created_at asc, name asc
    ) - 1 as next_sort_order
  from custom_lists
)
update custom_lists
set sort_order = ranked.next_sort_order
from ranked
where custom_lists.id = ranked.id;
