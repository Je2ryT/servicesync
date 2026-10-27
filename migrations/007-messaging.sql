-- ServiceSync · Migration 007 — messaging: email and text messages (Phase 2)
--
-- Run once in Supabase (SQL Editor → New query → paste → Run). Safe to run twice; it only adds things.
--
--   • messages: every send (who, what, which channel, totals). The idempotency key
--     means a retried request can never send twice.
--   • message_recipients: one row per person per channel, with what happened
--     (sent, delivered, failed, or skipped and why).
--   • optout_events: every opt-out and opt-in (STOP replies, unsubscribe links,
--     changes made by an admin), for the unsubscribes report.
--
-- Sending happens on the server (/api/send), which writes these tables with the
-- database connection string. In the app, admins can read every message and
-- coordinators only the ones they sent. Nobody can write them from the app.

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  sender_email text not null,
  sender_name text,
  channel text not null check (channel in ('sms', 'email', 'both')),
  subject text,
  body text not null,
  source jsonb not null default '{}',      -- where it was sent from: selection, filter, service, team
  status text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed')),
  recipients int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists messages_sender_idx on messages (sender_email, created_at desc);
create index if not exists messages_created_idx on messages (created_at desc);

create table if not exists message_recipients (
  id bigint generated always as identity primary key,
  message_id uuid not null references messages(id) on delete cascade,
  member_id text references members(id) on delete set null,
  name text,
  channel text not null check (channel in ('sms', 'email')),
  address text,
  status text not null check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  reason text,                              -- why it was skipped or failed
  provider_id text,                         -- Twilio message SID or Resend email id
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (message_id, member_id, channel)
);
create index if not exists message_recipients_provider_idx on message_recipients (provider_id);
create index if not exists message_recipients_member_idx on message_recipients (member_id);

create table if not exists optout_events (
  id bigint generated always as identity primary key,
  member_id text references members(id) on delete set null,
  channel text not null check (channel in ('sms', 'email')),
  action text not null check (action in ('out', 'in')),
  source text not null,                     -- 'sms-reply', 'email-link', 'admin'
  detail text,
  at timestamptz not null default now()
);
create index if not exists optout_events_at_idx on optout_events (at desc);

-- Opt-outs changed in the app (by an admin) are recorded too.
create or replace function members_optout_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  begin who := lower(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')); exception when others then who := null; end;
  if who is null then return null; end if;   -- the server records its own events
  if new.sms_opt_out is distinct from old.sms_opt_out then
    insert into optout_events (member_id, channel, action, source, detail) values (new.id, 'sms', case when new.sms_opt_out then 'out' else 'in' end, 'admin', who);
  end if;
  if new.email_opt_out is distinct from old.email_opt_out then
    insert into optout_events (member_id, channel, action, source, detail) values (new.id, 'email', case when new.email_opt_out then 'out' else 'in' end, 'admin', who);
  end if;
  return null;
end $$;
revoke all on function members_optout_log() from public, anon, authenticated;
drop trigger if exists members_optout_log on members;
create trigger members_optout_log after update of sms_opt_out, email_opt_out on members for each row execute function members_optout_log();

alter table messages enable row level security;
alter table message_recipients enable row level security;
alter table optout_events enable row level security;

drop policy if exists "read messages" on messages;
create policy "read messages" on messages for select using (is_admin() or (is_member() and sender_email = lower(auth.jwt() ->> 'email')));
drop policy if exists "read message recipients" on message_recipients;
create policy "read message recipients" on message_recipients for select using (
  exists (select 1 from messages m where m.id = message_recipients.message_id and (is_admin() or (is_member() and m.sender_email = lower(auth.jwt() ->> 'email'))))
);
drop policy if exists "admins read optout events" on optout_events;
create policy "admins read optout events" on optout_events for select using (is_admin());

do $$
declare t text;
begin
  foreach t in array array['messages', 'message_recipients'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;
