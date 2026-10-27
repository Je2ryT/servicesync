-- ServiceSync · Migration 008 — newcomer follow-up flows (Phase 3)
--
-- Run once in Supabase (SQL Editor → New query → paste → Run). Safe to run twice; it only adds things.
--
--   • flows and flow_steps: a follow-up path (for example Welcome text → Phone call →
--     Second visit → Connect to a group), each step with a default person and a due date.
--     A "Newcomer" flow is created to start with; admins can change it.
--   • flow_entries: one person moving through a flow: current step, who's on it, when it's due.
--   • Automatic: anyone added with the Visitors category, or moved into it, joins the
--     Newcomer flow (people imported from Elvanto only if you choose so at import).
--     Check-in's "New person" adds them too, whatever their category.
--   • Marking a step done (flow_advance) moves to the next step and writes a note on the
--     person's timeline.
--
-- Who can do what: admins everything; people on the roster can see the board, add people
-- to a flow, mark steps done, reassign and change due dates; anyone else nothing.

create table if not exists flows (
  id text primary key default 'flow-' || substr(md5(random()::text), 1, 8),
  name text not null check (length(btrim(name)) > 0),
  name_fr text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists flow_steps (
  id text primary key default 'step-' || substr(md5(random()::text), 1, 10),
  flow_id text not null references flows(id) on delete cascade,
  sort int not null default 0,
  title text not null check (length(btrim(title)) > 0),
  title_fr text,
  default_assignee text references coordinators(id) on delete set null,
  due_days int not null default 3 check (due_days between 0 and 365)
);
create index if not exists flow_steps_flow_idx on flow_steps (flow_id, sort);

create table if not exists flow_entries (
  id text primary key default 'fe-' || substr(md5(random()::text), 1, 12),
  flow_id text not null references flows(id) on delete cascade,
  member_id text not null references members(id) on delete cascade,
  step_id text references flow_steps(id) on delete set null,
  assignee text references coordinators(id) on delete set null,
  due_date date,
  status text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  step_started_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists flow_entries_one_active on flow_entries (flow_id, member_id) where status = 'active';
create index if not exists flow_entries_assignee_idx on flow_entries (assignee, due_date) where status = 'active';

-- The starting Newcomer flow.
insert into flows (id, name, name_fr) values ('newcomer', 'Newcomer', 'Nouveaux venus') on conflict (id) do nothing;
insert into flow_steps (id, flow_id, sort, title, title_fr, due_days) values
  ('nc-welcome', 'newcomer', 0, 'Welcome text', 'SMS de bienvenue', 1),
  ('nc-call', 'newcomer', 1, 'Phone call', 'Appel téléphonique', 3),
  ('nc-visit', 'newcomer', 2, 'Second visit', 'Deuxième visite', 7),
  ('nc-group', 'newcomer', 3, 'Connect to a group', 'Intégrer un groupe', 14)
on conflict (id) do nothing;

/* Put someone in a flow at its first step (does nothing if they're already in it). Returns the entry id. */
create or replace function flow_enroll_internal(p_member text, p_flow text, p_by text) returns text
language plpgsql security definer set search_path = public as $$
declare s flow_steps%rowtype; e text; fname text;
begin
  select id into e from flow_entries where flow_id = p_flow and member_id = p_member and status = 'active';
  if e is not null then return e; end if;
  select * into s from flow_steps where flow_id = p_flow order by sort, id limit 1;
  if not found or not exists (select 1 from flows where id = p_flow and active) then return null; end if;
  insert into flow_entries (flow_id, member_id, step_id, assignee, due_date, created_by)
  values (p_flow, p_member, s.id, s.default_assignee, current_date + s.due_days, p_by)
  on conflict do nothing returning id into e;
  if e is not null then
    select name into fname from flows where id = p_flow;
    insert into person_notes (member_id, body, author) values (p_member, 'Added to the ' || fname || ' follow-up.', p_by);
  end if;
  return e;
end $$;
revoke all on function flow_enroll_internal(text, text, text) from public, anon, authenticated;

/* From the app: add a person to a flow. */
create or replace function flow_enroll(p_member text, p_flow text default 'newcomer') returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Only the serving team can add follow-ups' using errcode = '42501'; end if;
  return flow_enroll_internal(p_member, p_flow, lower(auth.jwt() ->> 'email'));
end $$;
revoke all on function flow_enroll(text, text) from public, anon;
grant execute on function flow_enroll(text, text) to authenticated;

/* Mark the current step done: write a note, then move to the next step (or finish). */
create or replace function flow_advance(p_entry text, p_note text default null) returns flow_entries
language plpgsql security definer set search_path = public as $$
declare e flow_entries%rowtype; cur flow_steps%rowtype; nxt flow_steps%rowtype; who text := lower(auth.jwt() ->> 'email'); txt text := nullif(btrim(left(coalesce(p_note, ''), 2000)), '');
begin
  if not is_member() then raise exception 'Only the serving team can update follow-ups' using errcode = '42501'; end if;
  select * into e from flow_entries where id = p_entry for update;
  if not found or e.status <> 'active' then raise exception 'This follow-up is already finished'; end if;
  select * into cur from flow_steps where id = e.step_id;
  insert into person_notes (member_id, body, author)
  values (e.member_id, '✓ ' || coalesce(cur.title, 'Follow-up step') || coalesce(': ' || txt, ''), who);
  select * into nxt from flow_steps where flow_id = e.flow_id and (sort, id) > (coalesce(cur.sort, -1), coalesce(cur.id, '')) order by sort, id limit 1;
  if found then
    update flow_entries set step_id = nxt.id, assignee = coalesce(nxt.default_assignee, e.assignee), due_date = current_date + nxt.due_days, step_started_at = now()
     where id = e.id returning * into e;
  else
    update flow_entries set status = 'done', step_id = null, due_date = null, completed_at = now() where id = e.id returning * into e;
    insert into person_notes (member_id, body, author) values (e.member_id, 'Finished the ' || (select name from flows where id = e.flow_id) || ' follow-up.', who);
  end if;
  return e;
end $$;
revoke all on function flow_advance(text, text) from public, anon;
grant execute on function flow_advance(text, text) to authenticated;

/* Automatic: new Visitors, and people moved into Visitors, join the Newcomer flow.
   Imports mark their rows with created_by = 'import' to skip this. */
create or replace function members_newcomer_flow() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.category_id is distinct from 'visitors' or new.active is false then return null; end if;
  if tg_op = 'UPDATE' and old.category_id is not distinct from 'visitors' then return null; end if;
  if tg_op = 'INSERT' and new.created_by = 'import' then return null; end if;
  begin who := lower(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')); exception when others then who := null; end;
  perform flow_enroll_internal(new.id, 'newcomer', who);
  return null;
end $$;
revoke all on function members_newcomer_flow() from public, anon, authenticated;
drop trigger if exists members_newcomer_flow on members;
create trigger members_newcomer_flow after insert or update of category_id on members for each row execute function members_newcomer_flow();

alter table flows enable row level security;
alter table flow_steps enable row level security;
alter table flow_entries enable row level security;

drop policy if exists "members read flows" on flows;
drop policy if exists "admins manage flows" on flows;
create policy "members read flows" on flows for select using (is_member());
create policy "admins manage flows" on flows for all using (is_admin()) with check (is_admin());

drop policy if exists "members read flow steps" on flow_steps;
drop policy if exists "admins manage flow steps" on flow_steps;
create policy "members read flow steps" on flow_steps for select using (is_member());
create policy "admins manage flow steps" on flow_steps for all using (is_admin()) with check (is_admin());

drop policy if exists "members read follow-ups" on flow_entries;
drop policy if exists "members update follow-ups" on flow_entries;
drop policy if exists "admins delete follow-ups" on flow_entries;
create policy "members read follow-ups" on flow_entries for select using (is_member());
create policy "members update follow-ups" on flow_entries for update using (is_member()) with check (is_member());
create policy "admins delete follow-ups" on flow_entries for delete using (is_admin());
-- New entries come from flow_enroll() and the trigger.

do $$
declare t text;
begin
  foreach t in array array['flows', 'flow_steps', 'flow_entries'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
  if to_regprocedure('log_activity()') is not null then
    foreach t in array array['flows', 'flow_steps', 'flow_entries'] loop
      execute format('drop trigger if exists log_activity on %I', t);
      execute format('create trigger log_activity after insert or update or delete on %I for each row execute function log_activity()', t);
    end loop;
  end if;
end $$;
