-- ServiceSync · Migration 001 — teams, positions and assignments
--
-- Run this once in Supabase (SQL Editor → New query → paste → Run),
-- BEFORE the new version of the app goes live.
--
-- What it does
--   • Adds teams (Coordination, Worship, Sound, Media, Ushers…) and the
--     positions inside each team, with how many people each one needs.
--   • Records which people can serve which positions.
--   • Moves assignments out of the JSON list inside each Sunday into a real
--     `assignments` table, carrying over everyone's confirm/decline status.
--   • Approving a swap now happens in one step on the server, so a swap can't
--     end up half-applied.
--   • A swap can only be requested for an assignment you actually hold.
--
-- It is additive and safe to run twice: the carry-over below only runs while
-- the assignments table is still empty, so a second run never brings back
-- assignments removed in the new app. Nothing is dropped: the old
-- `confirms` table and the coordinator lists inside `sundays.services` stay
-- in place as a backup. The new app no longer reads them.
--
-- Naming note: the `coordinators` table keeps its name so nothing breaks, but
-- it now holds everyone who serves (coordinators, musicians, sound, ushers…).

-- ============ Tables ============
create table if not exists teams (
  id text primary key default 't-' || substr(md5(random()::text), 1, 8),
  name text not null,
  sort int not null default 0,
  created_at timestamptz default now()
);

create table if not exists positions (
  id text primary key default 'p-' || substr(md5(random()::text), 1, 8),
  team_id text not null references teams(id) on delete cascade,
  name text not null,
  min_needed int not null default 1 check (min_needed >= 0),
  preferred int not null default 1 check (preferred >= 1),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now(),
  constraint preferred_covers_min check (preferred >= min_needed)
);

create table if not exists person_positions (       -- who can serve what
  person_id text references coordinators(id) on delete cascade,
  position_id text references positions(id) on delete cascade,
  primary key (person_id, position_id)
);

create table if not exists assignments (
  id text primary key default 'a-' || substr(md5(random()::text), 1, 10),
  sunday_id text not null references sundays(id) on delete cascade,
  svc text not null,                                -- 'en', 'fr' or 'ev'
  position_id text not null references positions(id) on delete cascade,
  person_id text not null references coordinators(id) on delete cascade,
  status text not null default 'awaiting' check (status in ('awaiting','confirmed','declined')),
  responded_at timestamptz,
  created_at timestamptz default now(),
  unique (sunday_id, svc, position_id, person_id)
);
create index if not exists assignments_person_idx on assignments (person_id);
create index if not exists assignments_sunday_idx on assignments (sunday_id);

alter table swaps add column if not exists position_id text references positions(id) on delete cascade;

-- ============ Carry over what exists today ============
insert into teams (id, name, sort) values ('team-coord', 'Service coordination', 0)
  on conflict (id) do nothing;
insert into positions (id, team_id, name, min_needed, preferred, sort)
  values ('pos-coord', 'team-coord', 'Coordinator', 1, 2, 0)
  on conflict (id) do nothing;

-- Everyone on the roster today is a coordinator.
insert into person_positions (person_id, position_id)
  select id, 'pos-coord' from coordinators
  on conflict do nothing;

-- Every coordinator listed on a Sunday becomes an assignment, keeping their reply.
-- Only on the first run (while assignments is empty).
insert into assignments (sunday_id, svc, position_id, person_id, status)
  select s.id, svc.key, 'pos-coord', c.person_id, coalesce(cf.status, 'awaiting')
  from sundays s
  cross join lateral jsonb_each(coalesce(s.services, '{}'::jsonb)) as svc(key, value)
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(svc.value -> 'coords') = 'array' then svc.value -> 'coords' else '[]'::jsonb end
  ) as c(person_id)
  join coordinators p on p.id = c.person_id
  left join confirms cf on cf.sunday_id = s.id and cf.svc = svc.key and cf.coordinator_id = c.person_id
  where not exists (select 1 from assignments)
  on conflict do nothing;

update swaps set position_id = 'pos-coord' where position_id is null;

-- ============ Access rules ============
alter table teams enable row level security;
alter table positions enable row level security;
alter table person_positions enable row level security;
alter table assignments enable row level security;

drop policy if exists "members read teams" on teams;
drop policy if exists "admins manage teams" on teams;
create policy "members read teams" on teams for select using (is_member());
create policy "admins manage teams" on teams for all using (is_admin()) with check (is_admin());

drop policy if exists "members read positions" on positions;
drop policy if exists "admins manage positions" on positions;
create policy "members read positions" on positions for select using (is_member());
create policy "admins manage positions" on positions for all using (is_admin()) with check (is_admin());

drop policy if exists "members read person_positions" on person_positions;
drop policy if exists "admins manage person_positions" on person_positions;
create policy "members read person_positions" on person_positions for select using (is_member());
create policy "admins manage person_positions" on person_positions for all using (is_admin()) with check (is_admin());

-- People on the roster see assignments only once the month is published.
drop policy if exists "read assignments" on assignments;
drop policy if exists "admins manage assignments" on assignments;
create policy "read assignments" on assignments for select using (
  is_admin() or (
    my_coord() is not null
    and exists (select 1 from sundays s where s.id = assignments.sunday_id and s.published)
  )
);
create policy "admins manage assignments" on assignments for all using (is_admin()) with check (is_admin());

-- A swap can only be requested for an assignment the requester holds.
drop policy if exists "request swap" on swaps;
create policy "request swap" on swaps for insert with check (
  from_id = my_coord()
  and status = 'open'
  and exists (
    select 1 from assignments a
    where a.sunday_id = swaps.sunday_id
      and a.svc = swaps.svc
      and a.position_id = swaps.position_id
      and a.person_id = swaps.from_id
  )
);

-- ============ Server-side actions ============
-- A volunteer confirms or declines their own assignment (status only).
create or replace function respond_assignment(assignment_id text, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_status not in ('awaiting', 'confirmed', 'declined') then
    raise exception 'Unknown status %', new_status;
  end if;
  update assignments a
     set status = new_status, responded_at = case when new_status = 'awaiting' then null else now() end
   where a.id = assignment_id
     and (is_admin() or (
       a.person_id = my_coord()
       and exists (select 1 from sundays s where s.id = a.sunday_id and s.published)
     ));
  if not found then
    raise exception 'You can only answer your own published assignments' using errcode = '42501';
  end if;
end $$;

-- An administrator approves a swap: the replacement takes the assignment in one step.
create or replace function approve_swap(swap_id text, replacement text)
returns void language plpgsql security definer set search_path = public as $$
declare
  sw swaps%rowtype;
begin
  if not is_admin() then
    raise exception 'Only administrators can approve swaps' using errcode = '42501';
  end if;
  if replacement is null or not exists (select 1 from coordinators where id = replacement) then
    raise exception 'Choose a replacement';
  end if;
  select * into sw from swaps where id = swap_id for update;
  if not found or sw.status <> 'open' then
    raise exception 'This swap request is no longer open';
  end if;
  if replacement = sw.from_id then
    raise exception 'The replacement must be someone else';
  end if;

  if exists (select 1 from assignments
             where sunday_id = sw.sunday_id and svc = sw.svc
               and position_id = sw.position_id and person_id = replacement) then
    -- Replacement already holds this position: just release the requester.
    delete from assignments
     where sunday_id = sw.sunday_id and svc = sw.svc
       and position_id = sw.position_id and person_id = sw.from_id;
  else
    update assignments
       set person_id = replacement, status = 'awaiting', responded_at = null
     where sunday_id = sw.sunday_id and svc = sw.svc
       and position_id = sw.position_id and person_id = sw.from_id;
    if not found then
      raise exception 'The original assignment no longer exists';
    end if;
  end if;

  update swaps set status = 'approved', to_id = replacement where id = swap_id;
end $$;

revoke all on function respond_assignment(text, text) from public, anon;
revoke all on function approve_swap(text, text) from public, anon;
grant execute on function respond_assignment(text, text) to authenticated;
grant execute on function approve_swap(text, text) to authenticated;

-- ============ Live updates ============
do $$
declare t text;
begin
  foreach t in array array['teams', 'positions', 'person_positions', 'assignments'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
