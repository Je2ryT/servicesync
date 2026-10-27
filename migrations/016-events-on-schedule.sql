-- ServiceSync · Migration 016 — every calendar event is on the Schedule (and the other way round)
--
-- Run once in Supabase → SQL Editor, after 015. Safe to run again.
--
--   • Each event on the calendar has a special service on the Schedule, where its serving team
--     is assigned. A layout (order of service) is optional ('-' = none yet).
--   • Deleting either one deletes the other.
--   • An end time earlier than the start time means the event ends the next day
--     (for example 7:00 PM – 2:00 AM). No change is needed for that: times are stored as HH:MM.

-- Deleting the service deletes its calendar event…
alter table events drop constraint if exists events_service_id_fkey;
alter table events add constraint events_service_id_fkey foreign key (service_id) references sundays(id) on delete cascade;

-- …and deleting the calendar event deletes its service.
create or replace function events_drop_service() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.service_id is not null then delete from sundays where id = old.service_id and special; end if;
  return null;
end $$;
revoke all on function events_drop_service() from public, anon, authenticated;
drop trigger if exists events_drop_service on events;
create trigger events_drop_service after delete on events for each row execute function events_drop_service();

-- Upcoming calendar events without a service get one (a draft, like any newly planned Sunday).
insert into sundays (id, date, published, special, title, services)
select e.date::text || '-ev-' || substr(md5(e.id), 1, 7), e.date, false, true, e.title,
       jsonb_build_object('ev', jsonb_strip_nulls(jsonb_build_object('start', coalesce(nullif(e.start_time, ''), '18:00'), 'end', nullif(e.end_time, ''), 'tpl', '-')))
  from events e
 where e.service_id is null and e.date >= current_date
on conflict (id) do nothing;
update events e set service_id = e.date::text || '-ev-' || substr(md5(e.id), 1, 7)
 where e.service_id is null and e.date >= current_date
   and exists (select 1 from sundays s where s.id = e.date::text || '-ev-' || substr(md5(e.id), 1, 7));

-- Special services planned on the Schedule get their calendar entry.
insert into events (title, date, start_time, end_time, service_id, created_by)
select coalesce(nullif(s.title, ''), 'Special event'), s.date, s.services -> 'ev' ->> 'start', s.services -> 'ev' ->> 'end', s.id, 'schedule'
  from sundays s
 where s.special and not exists (select 1 from events e where e.service_id = s.id);
