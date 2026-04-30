-- Add source_url support for URL deduplication in ai_event_name_list.

alter table ai_event_name_list
  add column if not exists source_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'ai_event_name_list'::regclass
      and conname = 'ai_event_name_list_source_url_key'
  ) then
    alter table ai_event_name_list
      add constraint ai_event_name_list_source_url_key unique (source_url);
  end if;
end $$;
