-- ServiceSync · Migration 006 — richer people (Phase 1)
--
-- Run once in Supabase (SQL Editor → New query → paste → Run). Safe to run twice.
-- Nothing is deleted:
--   • members gain first/last name, gender, birthday, address, family, category,
--     text/email opt-outs, and a link to their serving-team card.
--   • The old status column stays as it was. Each person gets a category from it
--     (member/regular → Congregation, newcomer/visitor → Visitors), and that move is
--     written to the category history so you can see where it came from.
--   • Existing notes move into person_notes (one dated note per person); nothing is lost.
--   • Everyone on the serving team gets a member record (category Volunteers) if they
--     don't have one yet, matched by email.
--
-- Who can do what
--   • Admins: everything.
--   • People on the roster (coordinators): read people, families, categories and
--     history; add newcomers at check-in; write notes; save their own filters.
--   • Anyone else: nothing.

-- ============ Categories ============
create table if not exists categories (
  id text primary key default 'cat-' || substr(md5(random()::text), 1, 8),
  name text not null check (length(btrim(name)) > 0),
  name_fr text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);
insert into categories (id, name, name_fr, sort) values
  ('congregation', 'Congregation', 'Assemblée', 0),
  ('volunteers', 'Volunteers', 'Serviteurs', 1),
  ('visitors', 'Visitors', 'Visiteurs', 2),
  ('community', 'Community Contacts', 'Contacts de la communauté', 3),
  ('new-believers', 'New Believers', 'Nouveaux convertis', 4),
  ('guest-speakers', 'Guest Speakers', 'Orateurs invités', 5),
  ('online', 'Online Attendees', 'Participants en ligne', 6)
on conflict (id) do nothing;

-- ============ Families ============
create table if not exists families (
  id text primary key default 'fam-' || substr(md5(random()::text), 1, 10),
  name text not null check (length(btrim(name)) > 0),
  address text,
  created_at timestamptz default now()
);

-- ============ Members: new fields ============
alter table members add column if not exists first_name text;
alter table members add column if not exists last_name text;
alter table members add column if not exists gender text;
alter table members add column if not exists birthday date;
alter table members add column if not exists address text;
alter table members add column if not exists family_id text references families(id) on delete set null;
alter table members add column if not exists family_role text;
alter table members add column if not exists category_id text references categories(id) on delete set null;
alter table members add column if not exists sms_opt_out boolean not null default false;
alter table members add column if not exists email_opt_out boolean not null default false;
alter table members add column if not exists coordinator_id text references coordinators(id) on delete set null;
do $$ begin
  alter table members add constraint members_gender_check check (gender is null or gender in ('male', 'female'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table members add constraint members_family_role_check check (family_role is null or family_role in ('adult', 'child'));
exception when duplicate_object then null; end $$;
create unique index if not exists members_coordinator_idx on members (coordinator_id) where coordinator_id is not null;
create index if not exists members_family_idx on members (family_id);
create index if not exists members_category_idx on members (category_id);

-- ============ Category history ============
create table if not exists category_history (
  id bigint generated always as identity primary key,
  member_id text not null references members(id) on delete cascade,
  from_category text,
  to_category text,
  changed_by text,               -- sign-in email (null = done directly in Supabase)
  changed_at timestamptz not null default now(),
  note text
);
create index if not exists category_history_member_idx on category_history (member_id, changed_at desc);

-- ============ Notes ============
create table if not exists person_notes (
  id text primary key default 'note-' || substr(md5(random()::text), 1, 12),
  member_id text not null references members(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 5000),
  author text default lower(auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists person_notes_member_idx on person_notes (member_id, created_at desc);

-- ============ Saved filters (People list) ============
create table if not exists saved_filters (
  id text primary key default 'flt-' || substr(md5(random()::text), 1, 10),
  name text not null check (length(btrim(name)) > 0),
  filters jsonb not null default '{}',
  owner text default lower(auth.jwt() ->> 'email'),
  shared boolean not null default false,
  created_at timestamptz default now()
);

-- ============ Carry over what exists today (only rows not done yet) ============
-- Names
update members set first_name = split_part(btrim(name), ' ', 1),
                   last_name = nullif(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), '')
 where first_name is null and last_name is null and name is not null;

-- Status → category, recorded in the history
with moved as (
  update members set category_id = case when status in ('newcomer', 'visitor') then 'visitors' else 'congregation' end
   where category_id is null
  returning id, category_id, status
)
insert into category_history (member_id, from_category, to_category, note)
select id, null, category_id, 'Set from the old status “' || coalesce(status, 'member') || '” (migration 006)' from moved;

-- Notes → person_notes
insert into person_notes (member_id, body, author, created_at)
select id, btrim(notes), null, coalesce(created_at, now()) from members where nullif(btrim(notes), '') is not null;
update members set notes = null where notes is not null;

-- Link people to their serving-team card by email
update members m set coordinator_id = c.id
  from coordinators c
 where m.coordinator_id is null and m.email is not null and lower(m.email) = lower(c.email)
   and not exists (select 1 from members x where x.coordinator_id = c.id);
-- …and give everyone on the serving team a member record
with added as (
  insert into members (name, first_name, last_name, email, phone, lang, status, category_id, coordinator_id, created_by)
  select c.name, split_part(btrim(c.name), ' ', 1), nullif(btrim(substr(btrim(c.name), length(split_part(btrim(c.name), ' ', 1)) + 1)), ''),
         nullif(lower(c.email), ''), nullif(c.phone, ''),
         case when c.lang_en and c.lang_fr then 'both' when c.lang_en then 'en' else 'fr' end,
         'member', 'volunteers', c.id, c.id
    from coordinators c
   where not exists (select 1 from members m where m.coordinator_id = c.id)
  returning id, category_id
)
insert into category_history (member_id, from_category, to_category, note)
select id, null, category_id, 'Added from the serving team (migration 006)' from added;

-- ============ Keep things tidy as people are added and edited ============
create or replace function members_fill() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Older screens send only a full name; newer ones send first and last name too.
  if new.first_name is null and new.last_name is null and nullif(btrim(new.name), '') is not null then
    new.first_name := split_part(btrim(new.name), ' ', 1);
    new.last_name := nullif(btrim(substr(btrim(new.name), length(new.first_name) + 1)), '');
  end if;
  if nullif(btrim(new.name), '') is null then
    new.name := nullif(btrim(concat_ws(' ', new.first_name, new.last_name)), '');
  end if;
  -- Older screens send a status instead of a category.
  if new.category_id is null then
    new.category_id := case when new.status in ('newcomer', 'visitor') then 'visitors' else 'congregation' end;
  end if;
  return new;
end $$;
drop trigger if exists members_fill on members;
create trigger members_fill before insert or update on members for each row execute function members_fill();

create or replace function members_category_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then return null; end if;
  begin who := lower(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')); exception when others then who := null; end;
  insert into category_history (member_id, from_category, to_category, changed_by)
  values (new.id, case when tg_op = 'UPDATE' then old.category_id end, new.category_id, who);
  return null;
end $$;
revoke all on function members_category_log() from public, anon, authenticated;
drop trigger if exists members_category_log on members;
create trigger members_category_log after insert or update of category_id on members for each row execute function members_category_log();

-- New serving-team cards get (or are linked to) a member record.
create or replace function coordinators_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from members where coordinator_id = new.id) then return null; end if;
  update members set coordinator_id = new.id
   where id = (select id from members where coordinator_id is null and email is not null and lower(email) = lower(new.email) limit 1);
  if not found then
    insert into members (name, email, phone, lang, status, category_id, coordinator_id, created_by)
    values (new.name, nullif(lower(new.email), ''), nullif(new.phone, ''),
            case when new.lang_en and new.lang_fr then 'both' when new.lang_en then 'en' else 'fr' end,
            'member', 'volunteers', new.id, new.id);
  end if;
  return null;
end $$;
revoke all on function coordinators_member() from public, anon, authenticated;
drop trigger if exists coordinators_member on coordinators;
create trigger coordinators_member after insert on coordinators for each row execute function coordinators_member();

-- ============ Attendance totals per person (for filters and profiles) ============
create or replace view member_stats with (security_invoker = true) as
  select member_id, min(date) as first_attended, max(date) as last_attended, count(*)::int as visits,
         count(distinct date) filter (where svc = 'en')::int as visits_en,
         count(distinct date) filter (where svc = 'fr')::int as visits_fr
    from attendance group by member_id;
grant select on member_stats to authenticated;

-- ============ Access rules ============
alter table categories enable row level security;
alter table families enable row level security;
alter table category_history enable row level security;
alter table person_notes enable row level security;
alter table saved_filters enable row level security;

drop policy if exists "members read categories" on categories;
drop policy if exists "admins manage categories" on categories;
create policy "members read categories" on categories for select using (is_member());
create policy "admins manage categories" on categories for all using (is_admin()) with check (is_admin());

drop policy if exists "members read families" on families;
drop policy if exists "admins manage families" on families;
create policy "members read families" on families for select using (is_member());
create policy "admins manage families" on families for all using (is_admin()) with check (is_admin());

-- Written by the database only.
drop policy if exists "members read category history" on category_history;
create policy "members read category history" on category_history for select using (is_member());

drop policy if exists "members read notes" on person_notes;
drop policy if exists "members write notes" on person_notes;
drop policy if exists "authors edit notes" on person_notes;
drop policy if exists "authors delete notes" on person_notes;
create policy "members read notes" on person_notes for select using (is_member());
create policy "members write notes" on person_notes for insert with check (is_member() and author = lower(auth.jwt() ->> 'email'));
create policy "authors edit notes" on person_notes for update
  using (is_admin() or author = lower(auth.jwt() ->> 'email'))
  with check (is_admin() or author = lower(auth.jwt() ->> 'email'));
create policy "authors delete notes" on person_notes for delete using (is_admin() or author = lower(auth.jwt() ->> 'email'));

drop policy if exists "read saved filters" on saved_filters;
drop policy if exists "save own filters" on saved_filters;
drop policy if exists "edit own filters" on saved_filters;
drop policy if exists "delete own filters" on saved_filters;
create policy "read saved filters" on saved_filters for select using (is_admin() or (is_member() and (shared or owner = lower(auth.jwt() ->> 'email'))));
create policy "save own filters" on saved_filters for insert with check (is_member() and owner = lower(auth.jwt() ->> 'email'));
create policy "edit own filters" on saved_filters for update using (is_admin() or owner = lower(auth.jwt() ->> 'email')) with check (is_admin() or owner = lower(auth.jwt() ->> 'email'));
create policy "delete own filters" on saved_filters for delete using (is_admin() or owner = lower(auth.jwt() ->> 'email'));

-- ============ Live updates and the activity log ============
do $$
declare t text;
begin
  foreach t in array array['categories', 'families', 'person_notes', 'saved_filters', 'category_history'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
  if to_regprocedure('log_activity()') is not null then
    foreach t in array array['categories', 'families', 'person_notes'] loop
      execute format('drop trigger if exists log_activity on %I', t);
      execute format('create trigger log_activity after insert or update or delete on %I for each row execute function log_activity()', t);
    end loop;
  end if;
end $$;
