-- ServiceSync · Migration 013 — add volunteers from the members list
--
-- Run once in Supabase → SQL Editor, after 012. Safe to run again.
--
--   • coordinators.from_member: when someone is added to the serving team from the members
--     list, the app sends the member's id here. The new serving-team card is linked to that
--     member (no duplicate member is created), and the member's email and phone are filled
--     in from the card if they were missing.
--   • Without it, the old behaviour stays: link by email, or create a member record.

alter table coordinators add column if not exists from_member text;

create or replace function coordinators_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from members where coordinator_id = new.id) then return null; end if;
  if new.from_member is not null then
    update members set coordinator_id = new.id,
                       email = coalesce(email, nullif(lower(new.email), '')),
                       phone = coalesce(nullif(phone, ''), nullif(new.phone, ''))
     where id = new.from_member and coordinator_id is null;
    if found then return null; end if;
    if exists (select 1 from members where id = new.from_member) then
      raise exception 'That member is already on the serving team.' using errcode = '23505';
    end if;   -- member deleted meanwhile: fall through and create one as before
  end if;
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
