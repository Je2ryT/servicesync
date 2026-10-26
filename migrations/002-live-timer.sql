-- ServiceSync · Migration 002 — live service timer
--
-- Run once in Supabase (SQL Editor → New query → paste → Run), BEFORE the
-- version of the app with the timer goes live. It only adds things.
--
-- What it does
--   • One timer per service (English, French or a special event) on a Sunday.
--     When the timer starts, the order of service is copied in, so editing a
--     template mid-service never shifts the running timer.
--   • Every button (start, next, back, pause, +1 min, end, stage message) runs
--     through one server function, so times come from the server's clock and
--     two people pressing "Next" together can't skip a segment.
--   • Finishing a segment also ticks it off in the Live order of service, and
--     its real length is kept so you can compare planned and actual afterwards.
--   • Admins can run any timer; people on the roster can run timers on
--     published Sundays. Nobody can write to the table directly.

create table if not exists service_timers (
  sunday_id text references sundays(id) on delete cascade,
  svc text not null check (svc in ('en', 'fr', 'ev')),
  items jsonb not null default '[]',          -- order of service at start: [{id, item, min}]
  seg int not null default 0,                 -- index of the current segment
  started_at timestamptz,                     -- when the service started
  seg_started_at timestamptz,                 -- when the current segment started (moved forward by pauses)
  paused_at timestamptz,
  extra_sec int not null default 0,           -- time added to (or taken off) the current segment
  ended_at timestamptz,
  message text,                               -- short note shown on the stage screen
  log jsonb not null default '[]',            -- finished segments: [{seg, id, item, planned, actual}] in seconds
  updated_by text,
  updated_at timestamptz default now(),
  primary key (sunday_id, svc)
);

alter table service_timers enable row level security;
drop policy if exists "read timers" on service_timers;
create policy "read timers" on service_timers for select using (
  is_admin() or (
    my_coord() is not null
    and exists (select 1 from sundays s where s.id = service_timers.sunday_id and s.published)
  )
);
-- No insert/update/delete policies: changes only go through timer_control().

/* The server's clock, so every screen counts down in step. */
create or replace function timer_now() returns bigint
language sql volatile set search_path = public as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

/* Every timer button. Returns the timer after the change (null after a reset). */
create or replace function timer_control(p_sunday text, p_svc text, p_action text, p_arg jsonb default '{}'::jsonb)
returns service_timers language plpgsql security definer set search_path = public as $$
declare
  t service_timers%rowtype;
  n timestamptz := now();
  cnt int;
  planned int;
  it jsonb;
begin
  if not (is_admin() or (
    my_coord() is not null and exists (select 1 from sundays s where s.id = p_sunday and s.published)
  )) then
    raise exception 'Only people on the roster can run the timer' using errcode = '42501';
  end if;
  if p_svc not in ('en', 'fr', 'ev') then
    raise exception 'Unknown service %', p_svc;
  end if;

  if p_action = 'start' then
    if jsonb_typeof(p_arg -> 'items') is distinct from 'array' or jsonb_array_length(p_arg -> 'items') = 0 then
      raise exception 'This service has no order of service yet';
    end if;
    insert into service_timers as st (sunday_id, svc, items, seg, started_at, seg_started_at, paused_at, extra_sec, ended_at, message, log, updated_by, updated_at)
    values (p_sunday, p_svc, p_arg -> 'items', 0, n, n, null, 0, null, null, '[]', my_coord(), n)
    on conflict (sunday_id, svc) do update set
      items = excluded.items, seg = 0, started_at = n, seg_started_at = n, paused_at = null, extra_sec = 0,
      ended_at = null, message = null, log = '[]', updated_by = excluded.updated_by, updated_at = n
    returning * into t;
    return t;
  end if;

  select * into t from service_timers where sunday_id = p_sunday and svc = p_svc for update;
  if not found then
    if p_action = 'reset' then return null; end if;
    raise exception 'The timer has not been started';
  end if;

  if p_action = 'reset' then
    delete from service_timers where sunday_id = p_sunday and svc = p_svc;
    return null;
  end if;

  cnt := jsonb_array_length(t.items);
  it := t.items -> t.seg;
  planned := coalesce((it ->> 'min')::numeric, 0)::int * 60;

  if p_action = 'message' then
    t.message := nullif(left(btrim(coalesce(p_arg ->> 'text', '')), 140), '');

  elsif p_action = 'back' then
    if t.ended_at is not null then
      -- Reopen the segment that was running when the service ended.
      t.ended_at := null;
    elsif t.seg > 0 then
      t.seg := t.seg - 1;
      it := t.items -> t.seg;
    end if;
    t.log := (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(t.log) e where (e ->> 'seg')::int < t.seg);
    delete from ticks where sunday_id = p_sunday and key = 'live:' || p_svc || ':' || (it ->> 'id');
    t.seg_started_at := n; t.paused_at := null; t.extra_sec := 0;

  elsif t.ended_at is not null then
    raise exception 'This service has ended. Press Back to reopen it, or Restart.';

  elsif p_action = 'pause' then
    if t.paused_at is null then t.paused_at := n; end if;

  elsif p_action = 'resume' then
    if t.paused_at is not null then
      t.seg_started_at := t.seg_started_at + (n - t.paused_at);
      t.paused_at := null;
    end if;

  elsif p_action = 'add' then
    t.extra_sec := greatest(-planned, least(t.extra_sec + coalesce((p_arg ->> 'sec')::int, 0), 3600));

  elsif p_action in ('next', 'end') then
    t.log := t.log || jsonb_build_object(
      'seg', t.seg, 'id', it ->> 'id', 'item', it ->> 'item',
      'planned', planned + t.extra_sec,
      'actual', round(extract(epoch from (coalesce(t.paused_at, n) - t.seg_started_at)))::int);
    insert into ticks (sunday_id, key, by_coord) values (p_sunday, 'live:' || p_svc || ':' || (it ->> 'id'), my_coord())
      on conflict do nothing;
    if p_action = 'end' or t.seg + 1 >= cnt then
      t.ended_at := n;
    else
      t.seg := t.seg + 1;
    end if;
    t.seg_started_at := n; t.paused_at := null; t.extra_sec := 0;

  else
    raise exception 'Unknown timer action %', p_action;
  end if;

  update service_timers set
    seg = t.seg, seg_started_at = t.seg_started_at, paused_at = t.paused_at, extra_sec = t.extra_sec,
    ended_at = t.ended_at, message = t.message, log = t.log, updated_by = my_coord(), updated_at = n
  where sunday_id = p_sunday and svc = p_svc
  returning * into t;
  return t;
end $$;

revoke all on function timer_control(text, text, text, jsonb) from public, anon;
revoke all on function timer_now() from public, anon;
grant execute on function timer_control(text, text, text, jsonb) to authenticated;
grant execute on function timer_now() to authenticated;

do $$ begin
  alter publication supabase_realtime add table service_timers;
exception when duplicate_object then null;
end $$;
