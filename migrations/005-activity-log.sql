-- ServiceSync · Migration 005 — activity log (who changed what)
--
-- Run once in Supabase (SQL Editor → New query → paste → Run). It only adds things.
--
-- Every change to the schedule, people, teams, members, check-ins, events,
-- templates, settings and reports is recorded automatically by the database:
-- who made it (their sign-in email), when, and the row before and after.
-- It can't be skipped from the app. Only administrators can read it, and
-- nobody can edit or delete entries through the app.
-- (Live timer ticks and checklist ticks aren't logged: they change every few seconds.)

create table if not exists activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text,                 -- sign-in email of whoever made the change (null = done directly in Supabase)
  tbl text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  row_id text,
  old jsonb,
  new jsonb
);
create index if not exists activity_log_at_idx on activity_log (at desc);

alter table activity_log enable row level security;
drop policy if exists "admins read activity" on activity_log;
create policy "admins read activity" on activity_log for select using (is_admin());

create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb; n jsonb; r jsonb; k text; who text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  -- ignore saves that change nothing but a timestamp
  if tg_op = 'UPDATE' and (o - 'updated_at' - 'at' - 'updated_by') = (n - 'updated_at' - 'at' - 'updated_by') then return null; end if;
  r := coalesce(n, o);
  k := coalesce(r ->> 'id', concat_ws('|', r ->> 'sunday_id', r ->> 'member_id', r ->> 'person_id', r ->> 'coordinator_id', r ->> 'position_id', r ->> 'svc', r ->> 'date', r ->> 'email'));
  begin
    who := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '');
  exception when others then who := null;
  end;
  insert into activity_log (actor, tbl, op, row_id, old, new) values (lower(who), tg_table_name, lower(tg_op), k, o, n);
  return null;
end $$;
revoke all on function log_activity() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['coordinators', 'admins', 'sundays', 'templates', 'config', 'daysoff', 'swaps', 'teams', 'positions',
                           'person_positions', 'assignments', 'members', 'attendance', 'events', 'service_reports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists log_activity on %I', t);
      execute format('create trigger log_activity after insert or update or delete on %I for each row execute function log_activity()', t);
    end if;
  end loop;
end $$;
