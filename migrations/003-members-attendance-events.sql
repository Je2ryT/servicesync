-- ServiceSync · Migration 003 — church members, check-in attendance, events
--
-- Run once in Supabase (SQL Editor → New query → paste → Run). It only adds tables.
--
--   • members: everyone in the church, not only the serving team. Members don't
--     sign in; the serving team checks them in.
--   • attendance: who was at which service, and who checked them in.
--   • events: the church calendar (prayer nights, youth, conferences…).
--
-- Who can do what
--   • Anyone on the roster (and admins) can see members, check people in or out,
--     and add a newcomer at check-in.
--   • Only admins can edit or remove a member, and create or change events.
--   • Everyone on the roster can see events.

create table if not exists members (
  id text primary key default 'm-' || substr(md5(random()::text), 1, 10),
  name text not null check (length(btrim(name)) > 0),
  phone text,
  email text,
  lang text not null default 'fr' check (lang in ('en', 'fr', 'both')),
  status text not null default 'member' check (status in ('member', 'regular', 'newcomer', 'visitor')),
  household text,
  notes text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz default now()
);
create index if not exists members_name_idx on members (lower(name));

create table if not exists attendance (
  member_id text not null references members(id) on delete cascade,
  date date not null,
  svc text not null check (svc in ('en', 'fr', 'ev')),
  at timestamptz not null default now(),
  by_coord text,
  primary key (member_id, date, svc)
);
create index if not exists attendance_date_idx on attendance (date);

create table if not exists events (
  id text primary key default 'ev-' || substr(md5(random()::text), 1, 10),
  title text not null check (length(btrim(title)) > 0),
  date date not null,
  start_time text,                -- 'HH:MM'
  end_time text,
  location text,
  description text,
  created_by text,
  created_at timestamptz default now()
);
create index if not exists events_date_idx on events (date);

alter table members enable row level security;
alter table attendance enable row level security;
alter table events enable row level security;

drop policy if exists "members read members" on members;
drop policy if exists "members add members" on members;
drop policy if exists "admins update members" on members;
drop policy if exists "admins delete members" on members;
create policy "members read members" on members for select using (is_member());
create policy "members add members" on members for insert with check (is_member());
create policy "admins update members" on members for update using (is_admin()) with check (is_admin());
create policy "admins delete members" on members for delete using (is_admin());

drop policy if exists "members read attendance" on attendance;
drop policy if exists "members check in" on attendance;
drop policy if exists "members undo check in" on attendance;
create policy "members read attendance" on attendance for select using (is_member());
create policy "members check in" on attendance for insert with check (is_member());
create policy "members undo check in" on attendance for delete using (is_member());

drop policy if exists "members read events" on events;
drop policy if exists "admins manage events" on events;
create policy "members read events" on events for select using (is_member());
create policy "admins manage events" on events for all using (is_admin()) with check (is_admin());

do $$
declare t text;
begin
  foreach t in array array['members', 'attendance', 'events'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
