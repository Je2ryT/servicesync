-- ServiceSync · Mont Carmel Church
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- ============ Tables ============
create table if not exists admins (
  email text primary key
);

create table if not exists coordinators (
  id text primary key default 'c-' || substr(md5(random()::text), 1, 8),
  name text not null,
  email text unique,               -- the address this person signs in with
  phone text default '',
  lang_en boolean default true,
  lang_fr boolean default true,
  active boolean default true,
  max_per_month int default 4,
  created_at timestamptz default now()
);

create table if not exists sundays (
  id text primary key,             -- '2026-11-01', or '2026-12-24-ev-xxxx' for special events
  date date not null,
  published boolean default false,
  special boolean default false,
  title text,
  services jsonb not null default '{"en":{"coords":[]},"fr":{"coords":[]}}'
);

create table if not exists templates (
  id text primary key,
  name text not null,
  lang text not null default 'en',
  items jsonb not null default '[]'  -- [{id,item,min}]
);

create table if not exists config (
  id text primary key,             -- 'main'
  data jsonb not null default '{}'   -- {enTpl, frTpl, checklist:[{id,phase,text}]}
);

create table if not exists ticks (   -- checklist and order-of-service progress
  sunday_id text references sundays(id) on delete cascade,
  key text,                        -- 'en:k1' (checklist) or 'live:en:e1' (order item)
  by_coord text,
  at timestamptz default now(),
  primary key (sunday_id, key)
);

create table if not exists confirms (
  sunday_id text references sundays(id) on delete cascade,
  svc text,
  coordinator_id text references coordinators(id) on delete cascade,
  status text check (status in ('confirmed','declined')),
  primary key (sunday_id, svc, coordinator_id)
);

create table if not exists daysoff (
  coordinator_id text references coordinators(id) on delete cascade,
  date date,
  primary key (coordinator_id, date)
);

create table if not exists swaps (
  id text primary key default 's-' || substr(md5(random()::text), 1, 8),
  sunday_id text references sundays(id) on delete cascade,
  svc text,
  from_id text references coordinators(id) on delete cascade,
  to_id text references coordinators(id) on delete set null,
  note text default '',
  status text default 'open' check (status in ('open','approved','declined')),
  created_at timestamptz default now()
);

-- ============ Who is signed in ============
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

create or replace function my_coord() returns text
language sql stable security definer set search_path = public as $$
  select id from coordinators where lower(email) = lower(auth.jwt() ->> 'email') limit 1;
$$;

-- ============ Access rules ============
alter table admins enable row level security;
alter table coordinators enable row level security;
alter table sundays enable row level security;
alter table templates enable row level security;
alter table config enable row level security;
alter table ticks enable row level security;
alter table confirms enable row level security;
alter table daysoff enable row level security;
alter table swaps enable row level security;

-- Only admins and people on the roster can see anything.
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or my_coord() is not null;
$$;

create policy "admins read admins" on admins for select using (is_admin());
create policy "admins manage admins" on admins for all using (is_admin()) with check (is_admin());

create policy "members read roster" on coordinators for select using (is_member());
create policy "admins manage roster" on coordinators for all using (is_admin()) with check (is_admin());

create policy "members read published" on sundays for select using (is_admin() or (published and my_coord() is not null));
create policy "admins manage sundays" on sundays for all using (is_admin()) with check (is_admin());

create policy "members read templates" on templates for select using (is_member());
create policy "admins manage templates" on templates for all using (is_admin()) with check (is_admin());

create policy "members read config" on config for select using (is_member());
create policy "admins manage config" on config for all using (is_admin()) with check (is_admin());

create policy "members read ticks" on ticks for select using (is_member());
create policy "members tick" on ticks for insert with check (is_member());
create policy "members untick" on ticks for delete using (is_member());

create policy "members read confirms" on confirms for select using (is_member());
create policy "own confirms" on confirms for all
  using (is_admin() or coordinator_id = my_coord())
  with check (is_admin() or coordinator_id = my_coord());

create policy "members read daysoff" on daysoff for select using (is_member());
create policy "own daysoff" on daysoff for all
  using (is_admin() or coordinator_id = my_coord())
  with check (is_admin() or coordinator_id = my_coord());

create policy "read swaps" on swaps for select using (is_admin() or from_id = my_coord() or to_id = my_coord());
create policy "request swap" on swaps for insert with check (from_id = my_coord() and status = 'open');
create policy "cancel own swap" on swaps for delete using (is_admin() or (from_id = my_coord() and status = 'open'));
create policy "admins decide swaps" on swaps for update using (is_admin()) with check (is_admin());

-- ============ Live updates ============
alter publication supabase_realtime add table coordinators, sundays, templates, config, ticks, confirms, daysoff, swaps;

-- ============ First administrator ============
-- Replace with the email you sign in with. Add more admins the same way.
insert into admins (email) values ('tshibaljerry5@gmail.com') on conflict do nothing;
