-- ServiceSync · Migration 009 — reports
--
-- Run once in Supabase → SQL Editor, after 008. Safe to run again.
--
--   • report_* functions: absentees, attendance, one person's attendance, people activity,
--     volunteer positions, people with no recent notes, category history, text-message log
--     and unsubscribes. They run with the caller's own access (security invoker), so every
--     report shows exactly what that person may already read: coordinators see the people
--     reports and their own texts; only administrators see unsubscribes and everyone's texts.
--   • report_schedules: reports emailed every week (administrators only).

-- ============ Attendance ============
-- One row per service date, service and category: how many people, and how many were there for the first time.
create or replace function report_attendance(p_from date, p_to date)
returns table (date date, svc text, category_id text, people int, first_time int)
language sql stable set search_path = public as $$
  with first as (select member_id, min(date) as d from attendance group by member_id)
  select a.date, a.svc, coalesce(m.category_id, 'congregation'), count(*)::int, count(*) filter (where f.d = a.date)::int
    from attendance a
    join members m on m.id = a.member_id
    left join first f on f.member_id = a.member_id
   where a.date between p_from and p_to
   group by 1, 2, 3
   order by 1, 2, 3
$$;

-- People who came regularly (at least p_min Sundays in the p_lookback weeks before) but not in the last p_weeks weeks.
create or replace function report_absentees(p_weeks int default 4, p_min int default 3, p_lookback int default 26, p_today date default current_date)
returns table (member_id text, name text, category_id text, phone text, email text, last_date date, visits int)
language sql stable set search_path = public as $$
  with cut as (select p_today - 7 * greatest(p_weeks, 1) as c)
  select m.id, m.name, m.category_id, m.phone, m.email, max(a.date), count(distinct a.date)::int
    from members m
    join attendance a on a.member_id = m.id
    cross join cut
   where m.active and a.date >= cut.c - 7 * greatest(p_lookback, 1)
   group by m.id, m.name, m.category_id, m.phone, m.email, cut.c
  having max(a.date) < cut.c and count(distinct a.date) >= greatest(p_min, 1)
   order by max(a.date) desc, m.name
$$;

-- One person's attendance.
create or replace function report_person_attendance(p_member text, p_from date, p_to date)
returns table (date date, svc text)
language sql stable set search_path = public as $$
  select a.date, a.svc from attendance a where a.member_id = p_member and a.date between p_from and p_to order by a.date desc, a.svc
$$;

-- ============ People ============
-- Everything that happened to people in a period: added, category changed, notes, follow-ups finished, opt-outs.
create or replace function report_people_activity(p_from date, p_to date)
returns table (at timestamptz, kind text, member_id text, name text, detail text, by_whom text)
language sql stable set search_path = public as $$
  select * from (
    select m.created_at, 'added', m.id, m.name, m.category_id, m.created_by from members m
     where m.created_at >= p_from and m.created_at < p_to + 1
    union all
    select h.changed_at, 'category', h.member_id, m.name, coalesce(h.from_category, '–') || ' → ' || coalesce(h.to_category, '–'), h.changed_by
      from category_history h join members m on m.id = h.member_id
     where h.changed_at >= p_from and h.changed_at < p_to + 1
    union all
    select n.created_at, 'note', n.member_id, m.name, left(n.body, 200), n.author
      from person_notes n join members m on m.id = n.member_id
     where n.created_at >= p_from and n.created_at < p_to + 1
    union all
    select e.completed_at, 'followup', e.member_id, m.name, f.name, null
      from flow_entries e join members m on m.id = e.member_id join flows f on f.id = e.flow_id
     where e.status = 'done' and e.completed_at >= p_from and e.completed_at < p_to + 1
    union all
    select o.at, 'optout', o.member_id, m.name, o.channel || ' ' || o.action, o.source
      from optout_events o join members m on m.id = o.member_id
     where o.at >= p_from and o.at < p_to + 1
  ) x (at, kind, member_id, name, detail, by_whom)
  order by at desc
$$;

-- Active people whose last note is older than p_days (or who have none).
create or replace function report_no_notes(p_days int default 90, p_today date default current_date)
returns table (member_id text, name text, category_id text, last_note timestamptz, notes int, last_attended date)
language sql stable set search_path = public as $$
  select m.id, m.name, m.category_id, max(n.created_at), count(n.id)::int, (select max(a.date) from attendance a where a.member_id = m.id)
    from members m left join person_notes n on n.member_id = m.id
   where m.active
   group by m.id, m.name, m.category_id
  having max(n.created_at) is null or max(n.created_at) < p_today - greatest(p_days, 0)
   order by max(n.created_at) nulls first, m.name
$$;

create or replace function report_category_history(p_from date, p_to date)
returns table (changed_at timestamptz, member_id text, name text, from_category text, to_category text, changed_by text, note text)
language sql stable set search_path = public as $$
  select h.changed_at, h.member_id, m.name, h.from_category, h.to_category, h.changed_by, h.note
    from category_history h join members m on m.id = h.member_id
   where h.changed_at >= p_from and h.changed_at < p_to + 1
   order by h.changed_at desc
$$;

-- ============ Serving ============
create or replace function report_volunteers(p_from date, p_to date)
returns table (person_id text, name text, team text, position_name text, scheduled int, confirmed int, declined int, last_date date)
language sql stable set search_path = public as $$
  select c.id, c.name, t.name, p.name, count(*)::int,
         count(*) filter (where a.status = 'confirmed')::int, count(*) filter (where a.status = 'declined')::int, max(s.date)
    from assignments a
    join sundays s on s.id = a.sunday_id
    join coordinators c on c.id = a.person_id
    join positions p on p.id = a.position_id
    left join teams t on t.id = p.team_id
   where s.date between p_from and p_to
   group by c.id, c.name, t.name, t.sort, p.name, p.sort
   order by c.name, t.sort, p.sort
$$;

-- ============ Messages ============
create or replace function report_sms_log(p_from date, p_to date)
returns table (at timestamptz, name text, address text, status text, reason text, sender text, body text)
language sql stable set search_path = public as $$
  select coalesce(r.sent_at, msg.created_at), r.name, r.address, r.status, r.reason, msg.sender_name, msg.body
    from message_recipients r join messages msg on msg.id = r.message_id
   where r.channel = 'sms' and msg.created_at >= p_from and msg.created_at < p_to + 1
   order by msg.created_at desc, r.name
   limit 10000
$$;

create or replace function report_unsubscribes(p_from date, p_to date)
returns table (at timestamptz, member_id text, name text, channel text, action text, source text, detail text)
language sql stable set search_path = public as $$
  select o.at, o.member_id, m.name, o.channel, o.action, o.source, o.detail
    from optout_events o left join members m on m.id = o.member_id
   where o.at >= p_from and o.at < p_to + 1
   order by o.at desc
$$;

do $$
declare f text;
begin
  foreach f in array array['report_attendance(date,date)', 'report_absentees(int,int,int,date)', 'report_person_attendance(text,date,date)',
    'report_people_activity(date,date)', 'report_no_notes(int,date)', 'report_category_history(date,date)', 'report_volunteers(date,date)',
    'report_sms_log(date,date)', 'report_unsubscribes(date,date)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ============ Weekly report emails ============
create table if not exists report_schedules (
  id text primary key default 'rs-' || substr(md5(random()::text), 1, 10),
  report text not null check (report in ('absentees', 'attendance', 'people-activity', 'volunteers', 'no-notes', 'category-history', 'sms-log', 'unsubscribes')),
  params jsonb not null default '{}',
  recipients text[] not null check (cardinality(recipients) between 1 and 20),
  weekday int not null default 1 check (weekday between 0 and 6),   -- 0 = Sunday … 6 = Saturday
  lang text not null default 'en' check (lang in ('en', 'fr')),
  active boolean not null default true,
  created_by text default lower(auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  last_sent date
);

alter table report_schedules enable row level security;
drop policy if exists "admins manage report schedules" on report_schedules;
create policy "admins manage report schedules" on report_schedules for all using (is_admin()) with check (is_admin());

do $$
begin
  if to_regprocedure('log_activity()') is not null then
    drop trigger if exists log_activity on report_schedules;
    create trigger log_activity after insert or update or delete on report_schedules for each row execute function log_activity();
  end if;
end $$;
