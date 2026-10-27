-- ServiceSync · Migration 015 — calendar events linked to a service plan (and its layout)
--
-- Run once in Supabase → SQL Editor, after 014. Safe to run again.
--
--   • events.service_id: an event on the calendar can be "planned as a service". It then has its
--     own order of service, serving team, live timer, report and printable layout, kept in the
--     schedule like any special event. Deleting the service unlinks the event; deleting the event
--     leaves the service in the schedule.

alter table events add column if not exists service_id text references sundays(id) on delete set null;
create index if not exists events_service_idx on events (service_id);
