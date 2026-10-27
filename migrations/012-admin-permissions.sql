-- ServiceSync · Migration 012 — different levels of access for each administrator
--
-- Run once in Supabase → SQL Editor, after 011. Safe to run again.
--
--   • admins.perms: the areas an administrator manages. Empty (null) = full access.
--       schedule   plan months, publish, teams, positions, roster, swaps, days off, events
--       people     edit and delete members, categories, families, other people's notes and filters
--       messaging  text or email anyone; see every sent message and opt-out
--       followups  edit flows and steps; delete follow-ups
--       reports    the activity log and weekly report emails
--       templates  order of service, checklists, settings
--   • Only full administrators add or remove administrators or change their access,
--     and there is always at least one full administrator.
--   • Every administrator keeps read access (published or not) and can write service reports,
--     run timers and check people in, as before.
--   • Each "admins manage …" rule below switches from is_admin() to has_perm('<area>').

alter table admins add column if not exists perms text[];
alter table admins drop constraint if exists admins_perms_known;
alter table admins add constraint admins_perms_known
  check (perms is null or perms <@ array['schedule', 'people', 'messaging', 'followups', 'reports', 'templates']::text[]);

create or replace function has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = lower(auth.jwt() ->> 'email') and (perms is null or p = any(perms)));
$$;
create or replace function is_full_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = lower(auth.jwt() ->> 'email') and perms is null);
$$;
grant execute on function has_perm(text) to authenticated;
grant execute on function is_full_admin() to authenticated;

-- Always keep one full administrator (checked after deletes and access changes).
create or replace function admins_keep_one() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admins) then raise exception 'ServiceSync needs at least one administrator.'; end if;
  if not exists (select 1 from admins where perms is null) then raise exception 'ServiceSync needs at least one administrator with full access.'; end if;
  return null;
end $$;
drop trigger if exists admins_keep_one on admins;
create constraint trigger admins_keep_one after delete or update on admins deferrable initially immediate for each row execute function admins_keep_one();

-- Only full administrators manage administrators; every administrator can see the list.
drop policy if exists "admins manage admins" on admins;
create policy "admins manage admins" on admins for all using (is_full_admin()) with check (is_full_admin());

-- Switch each "manage" rule to its area. Read rules (select) keep is_admin(), so every
-- administrator still sees everything; only changes need the area.
do $$
declare
  area constant jsonb := '{
    "assignments": "schedule", "confirms": "schedule", "coordinators": "schedule", "daysoff": "schedule", "events": "schedule",
    "person_positions": "schedule", "positions": "schedule", "sundays": "schedule", "swaps": "schedule", "teams": "schedule",
    "categories": "people", "families": "people", "members": "people", "person_notes": "people", "saved_filters": "people",
    "flows": "followups", "flow_steps": "followups", "flow_entries": "followups",
    "config": "templates", "templates": "templates",
    "activity_log": "reports", "report_schedules": "reports",
    "messages": "messaging", "message_recipients": "messaging", "optout_events": "messaging"
  }';
  -- read rules that stay open to every administrator
  keep_read constant text[] := array['sundays', 'assignments', 'swaps', 'saved_filters', 'service_reports', 'service_timers'];
  p record; a text; q text; w text; roles text;
begin
  for p in select * from pg_policies where schemaname = 'public' and (qual like '%is_admin()%' or with_check like '%is_admin()%') loop
    a := area ->> p.tablename;
    continue when a is null;
    continue when p.cmd = 'SELECT' and p.tablename = any(keep_read);
    q := replace(p.qual, 'is_admin()', format('has_perm(%L)', a));
    w := replace(p.with_check, 'is_admin()', format('has_perm(%L)', a));
    select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') into roles from unnest(p.roles) r;
    execute format('drop policy %I on %I', p.policyname, p.tablename);
    execute format('create policy %I on %I as %s for %s to %s%s%s', p.policyname, p.tablename, p.permissive, p.cmd, roles,
      case when q is not null then format(' using (%s)', q) else '' end,
      case when w is not null then format(' with check (%s)', w) else '' end);
  end loop;
end $$;

-- Server-side actions that were "any administrator".
create or replace function respond_assignment(assignment_id text, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_status not in ('awaiting', 'confirmed', 'declined') then
    raise exception 'Unknown status %', new_status;
  end if;
  update assignments a
     set status = new_status, responded_at = case when new_status = 'awaiting' then null else now() end
   where a.id = assignment_id
     and (has_perm('schedule') or (
       a.person_id = my_coord()
       and exists (select 1 from sundays s where s.id = a.sunday_id and s.published)
     ));
  if not found then
    raise exception 'You can only answer your own published assignments' using errcode = '42501';
  end if;
end $$;

do $$
begin
  -- approve_swap: same body, but needs the schedule area.
  if to_regprocedure('approve_swap(text,text)') is not null then
    execute replace(pg_get_functiondef('approve_swap(text,text)'::regprocedure), 'if not is_admin() then', 'if not has_perm(''schedule'') then');
  end if;
end $$;
