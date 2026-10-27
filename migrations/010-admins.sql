-- ServiceSync · Migration 010 — manage administrators in the app
--
-- Run once in Supabase → SQL Editor, after 009. Safe to run again.
--
--   • admins: emails are stored lower-case; who added each one and when.
--   • The last administrator can't be removed (so nobody gets locked out).
--   • Changes are written to the activity log.
-- Access is unchanged: only administrators can see or change the list.

alter table admins add column if not exists added_by text default lower(auth.jwt() ->> 'email');
alter table admins add column if not exists added_at timestamptz default now();

-- Tidy existing rows: one row per address, lower-case.
delete from admins a using admins b where a.ctid > b.ctid and lower(btrim(a.email)) = lower(btrim(b.email));
update admins set email = lower(btrim(email)) where email <> lower(btrim(email));

create or replace function admins_clean() returns trigger
language plpgsql set search_path = public as $$
begin
  new.email := lower(btrim(new.email));
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That is not an email address: %', new.email; end if;
  return new;
end $$;
drop trigger if exists admins_clean on admins;
create trigger admins_clean before insert or update on admins for each row execute function admins_clean();

-- security definer: it must count every administrator, including after you remove yourself.
create or replace function admins_keep_one() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admins) then raise exception 'ServiceSync needs at least one administrator.'; end if;
  return null;
end $$;
drop trigger if exists admins_keep_one on admins;
create constraint trigger admins_keep_one after delete on admins deferrable initially immediate for each row execute function admins_keep_one();

do $$
begin
  if to_regprocedure('log_activity()') is not null then
    drop trigger if exists log_activity on admins;
    create trigger log_activity after insert or update or delete on admins for each row execute function log_activity();
  end if;
end $$;
