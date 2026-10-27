-- ServiceSync · Migration 011 — printable service layout
--
-- Run once in Supabase → SQL Editor, after 010. Safe to run again.
--
--   • service_reports.layout: names typed on a service's layout, by part of the order of
--     service and placeholder: { "<item id>": { "<placeholder id>": "Name" } }.
--   • save_layout(): the same people who write the service report can fill these in
--     (administrators, and anyone on the roster once the Sunday is published).
-- Placeholders themselves (pastor, moderator, interpreter, choir, other, and their tag
-- colours) live in each template's items, so they need no new table.

alter table service_reports add column if not exists layout jsonb not null default '{}';

create or replace function save_layout(p_sunday text, p_svc text, p_item text, p_tag text, p_name text)
returns service_reports language plpgsql security definer set search_path = public as $$
declare
  t service_reports%rowtype;
  nm text := nullif(btrim(left(coalesce(p_name, ''), 120)), '');
begin
  if not (is_admin() or (
    my_coord() is not null and exists (select 1 from sundays s where s.id = p_sunday and s.published)
  )) then
    raise exception 'Only people on the roster can fill in the service layout' using errcode = '42501';
  end if;
  if p_svc not in ('en', 'fr', 'ev') then raise exception 'Unknown service %', p_svc; end if;
  if coalesce(p_item, '') = '' or length(p_item) > 64 or coalesce(p_tag, '') = '' or length(p_tag) > 64 then raise exception 'Unknown placeholder'; end if;
  if not exists (select 1 from sundays s where s.id = p_sunday) then raise exception 'Unknown Sunday %', p_sunday; end if;

  insert into service_reports (sunday_id, svc, updated_by, updated_at)
  values (p_sunday, p_svc, my_coord(), now())
  on conflict (sunday_id, svc) do nothing;

  update service_reports set
    layout = case
      when nm is null then
        case when (coalesce(layout -> p_item, '{}') - p_tag) = '{}'::jsonb then layout - p_item
             else jsonb_set(layout, array[p_item], coalesce(layout -> p_item, '{}') - p_tag) end
      else layout || jsonb_build_object(p_item, coalesce(layout -> p_item, '{}') || jsonb_build_object(p_tag, nm))
    end,
    updated_by = my_coord(), updated_at = now()
   where sunday_id = p_sunday and svc = p_svc
  returning * into t;
  return t;
end $$;

revoke all on function save_layout(text, text, text, text, text) from public;
grant execute on function save_layout(text, text, text, text, text) to authenticated;
