-- ServiceSync · Migration 014 — only full administrators see who the administrators are
--
-- Run once in Supabase → SQL Editor, after 013. Safe to run again.
--
-- Before: every administrator (including those with only some areas) could read the whole
-- list. Now: full administrators see the list; everyone else sees only their own row (the app
-- needs it to know which areas they manage). Team members and strangers see nothing, as before.

drop policy if exists "admins read admins" on admins;
create policy "admins read admins" on admins for select
  using (is_full_admin() or email = lower(auth.jwt() ->> 'email'));
