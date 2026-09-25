-- Phase 3.6: controlled corrections for manually recorded existing equipment components.
-- A completed Service remains the sole authority for Service-origin replacement components.

create table public.equipment_component_corrections (
  id uuid primary key default gen_random_uuid(),
  equipment_component_id uuid not null references public.equipment_components(id) on delete restrict,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  correction_reason text not null check (nullif(btrim(correction_reason), '') is not null),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  corrected_at timestamptz not null default now(),
  corrected_by uuid
);

create index equipment_component_corrections_component_corrected_at_idx
  on public.equipment_component_corrections(equipment_component_id, corrected_at desc);

alter table public.equipment_component_corrections enable row level security;

create policy equipment_component_corrections_authenticated_read
  on public.equipment_component_corrections
  for select to authenticated
  using (true);

revoke all on table public.equipment_component_corrections from public;
revoke all on table public.equipment_component_corrections from anon;
revoke all on table public.equipment_component_corrections from authenticated;
grant select on table public.equipment_component_corrections to authenticated;

create or replace function private.protect_equipment_component_recorded_details()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_setting('app.equipment_component_correction_in_progress', true) is distinct from 'on'
     and (
       new.part_id is distinct from old.part_id
       or new.component_role_id is distinct from old.component_role_id
       or new.installed_date is distinct from old.installed_date
       or new.notes is distinct from old.notes
       or new.source_service_item_id is distinct from old.source_service_item_id
     ) then
    if old.source_service_item_id is not null then
      raise exception using errcode = '42501',
        message = 'Service-created component details must be corrected through the source Service';
    end if;

    raise exception using errcode = '42501',
      message = 'recorded component details must use correct_recorded_existing_component';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_equipment_component_recorded_details on public.equipment_components;
create trigger protect_equipment_component_recorded_details
before update on public.equipment_components
for each row execute function private.protect_equipment_component_recorded_details();

create or replace function public.correct_recorded_existing_component(
  p_component_id uuid,
  p_part_id uuid,
  p_installed_date date,
  p_notes text,
  p_correction_reason text
)
returns table (equipment_component_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_component public.equipment_components%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_part_role_id uuid;
  v_part_is_tracked boolean;
  v_previous_date date;
  v_next_date date;
  v_other_component_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authenticated access is required';
  end if;

  if p_component_id is null or p_part_id is null then
    raise exception using errcode = '22004', message = 'component and Part are required';
  end if;

  if nullif(btrim(p_correction_reason), '') is null then
    raise exception using errcode = '23514', message = 'a correction reason is required';
  end if;

  select ec.* into v_component
  from public.equipment_components ec
  where ec.id = p_component_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'component was not found';
  end if;

  if v_component.source_service_item_id is not null then
    raise exception using errcode = '23514',
      message = 'this component was created by a completed Service and must be corrected through that source Service';
  end if;

  select p.component_role_id, p.equipment_tracking_enabled
    into v_part_role_id, v_part_is_tracked
  from public.parts p
  where p.id = p_part_id
    and p.is_active
  for key share;

  if not found or v_part_is_tracked is not true or v_part_role_id is null then
    raise exception using errcode = '23503',
      message = 'corrected Part must be an active tracked Part with a component role';
  end if;

  if v_part_role_id <> v_component.component_role_id then
    raise exception using errcode = '23514',
      message = 'choose a Part from the same component role; a structural role change requires the canonical Service workflow';
  end if;

  select
    count(*),
    max(ec.installed_date) filter (where v_component.installed_date is not null and ec.installed_date < v_component.installed_date),
    min(ec.installed_date) filter (where v_component.installed_date is not null and ec.installed_date > v_component.installed_date)
  into v_other_component_count, v_previous_date, v_next_date
  from public.equipment_components ec
  where ec.equipment_id = v_component.equipment_id
    and ec.component_role_id = v_component.component_role_id
    and ec.id <> v_component.id;

  if v_component.installed_date is null and v_other_component_count > 0 then
    raise exception using errcode = '23514',
      message = 'the recorded installation date cannot be corrected because existing component chronology is unknown';
  end if;

  if p_installed_date is null and v_other_component_count > 0 then
    raise exception using errcode = '23514',
      message = 'the installation date cannot be cleared because this component has related history';
  end if;

  if p_installed_date is not null then
    if v_previous_date is not null and p_installed_date <= v_previous_date then
      raise exception using errcode = '23514',
        message = 'the corrected installation date would move this component before earlier component history';
    end if;

    if v_next_date is not null and p_installed_date >= v_next_date then
      raise exception using errcode = '23514',
        message = 'the corrected installation date would make component history ambiguous with a later replacement';
    end if;

    if v_component.removed_date is not null and p_installed_date >= v_component.removed_date then
      raise exception using errcode = '23514',
        message = 'the corrected installation date must be before this component was removed';
    end if;
  end if;

  v_before := jsonb_build_object(
    'component', to_jsonb(v_component),
    'provenance', 'Record Existing Component'
  );

  perform set_config('app.equipment_component_correction_in_progress', 'on', true);

  update public.equipment_components ec
  set part_id = p_part_id,
      installed_date = p_installed_date,
      notes = nullif(btrim(p_notes), '')
  where ec.id = v_component.id;

  select jsonb_build_object(
    'component', to_jsonb(ec),
    'provenance', 'Record Existing Component'
  ) into v_after
  from public.equipment_components ec
  where ec.id = v_component.id;

  insert into public.equipment_component_corrections (
    equipment_component_id,
    equipment_id,
    correction_reason,
    before_snapshot,
    after_snapshot,
    corrected_by
  ) values (
    v_component.id,
    v_component.equipment_id,
    nullif(btrim(p_correction_reason), ''),
    v_before,
    v_after,
    auth.uid()
  );

  return query select v_component.id;
end;
$$;

alter function public.correct_recorded_existing_component(uuid, uuid, date, text, text) owner to postgres;

revoke all on function public.correct_recorded_existing_component(uuid, uuid, date, text, text) from public;
revoke all on function public.correct_recorded_existing_component(uuid, uuid, date, text, text) from anon;
grant execute on function public.correct_recorded_existing_component(uuid, uuid, date, text, text) to authenticated;
