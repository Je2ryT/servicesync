-- ServiceSync · Migration 004 — service reports
--
-- Run once in Supabase (SQL Editor → New query → paste → Run). It only adds things.
--
-- One report per service (English, French or a special event) on a Sunday:
--   • a note for each segment of the order of service (Welcome, Worship, Sermon…)
--   • an overall summary and follow-ups
-- Notes are saved one at a time through save_report(), so two people writing
-- notes on different segments at the same moment never overwrite each other.
-- Admins can write any report; people on the roster can write reports for
-- published Sundays.

create table if not exists service_reports (
  sunday_id text references sundays(id) on delete cascade,
  svc text not null check (svc in ('en', 'fr', 'ev')),
  notes jsonb not null default '{}',     -- { segmentId: { item, text, by, at } }
  summary text,
  followups text,
  updated_by text,
  updated_at timestamptz default now(),
  primary key (sunday_id, svc)
);

alter table service_reports enable row level security;
drop policy if exists "read reports" on service_reports;
create policy "read reports" on service_reports for select using (
  is_admin() or (
    my_coord() is not null
    and exists (select 1 from sundays s where s.id = service_reports.sunday_id and s.published)
  )
);
-- No insert/update/delete policies: changes only go through save_report().

/* Save one part of a report. p_key is a segment id, or 'summary' / 'followups'.
   Empty text removes that note. */
create or replace function save_report(p_sunday text, p_svc text, p_key text, p_item text, p_text text)
returns service_reports language plpgsql security definer set search_path = public as $$
declare
  t service_reports%rowtype;
  txt text := nullif(btrim(left(coalesce(p_text, ''), 5000)), '');
begin
  if not (is_admin() or (
    my_coord() is not null and exists (select 1 from sundays s where s.id = p_sunday and s.published)
  )) then
    raise exception 'Only people on the roster can write reports' using errcode = '42501';
  end if;
  if p_svc not in ('en', 'fr', 'ev') then raise exception 'Unknown service %', p_svc; end if;
  if coalesce(p_key, '') = '' or length(p_key) > 64 then raise exception 'Unknown part of the report'; end if;

  insert into service_reports (sunday_id, svc, updated_by, updated_at)
  values (p_sunday, p_svc, my_coord(), now())
  on conflict (sunday_id, svc) do nothing;

  if p_key = 'summary' then
    update service_reports set summary = txt, updated_by = my_coord(), updated_at = now()
     where sunday_id = p_sunday and svc = p_svc returning * into t;
  elsif p_key = 'followups' then
    update service_reports set followups = txt, updated_by = my_coord(), updated_at = now()
     where sunday_id = p_sunday and svc = p_svc returning * into t;
  else
    update service_reports set
      notes = case when txt is null then notes - p_key
                   else notes || jsonb_build_object(p_key, jsonb_build_object('item', left(coalesce(p_item, ''), 200), 'text', txt, 'by', my_coord(), 'at', now())) end,
      updated_by = my_coord(), updated_at = now()
     where sunday_id = p_sunday and svc = p_svc returning * into t;
  end if;
  return t;
end $$;

revoke all on function save_report(text, text, text, text, text) from public, anon;
grant execute on function save_report(text, text, text, text, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table service_reports;
exception when duplicate_object then null;
end $$;
