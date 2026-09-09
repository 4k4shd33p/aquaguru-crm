-- Phase 1C.1: preserve the distinction between an observed existing component and a Service replacement.
-- An existing component has no source_service_item_id. A Service replacement must carry the matching completed replacement item.

create or replace function private.validate_equipment_component_source()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_part_component_role_id uuid;
  v_tracking_enabled boolean;
  v_source_equipment_id uuid;
  v_source_part_id uuid;
  v_source_updates_component boolean;
  v_source_service_status text;
begin
  select p.component_role_id, p.equipment_tracking_enabled
    into v_part_component_role_id, v_tracking_enabled
    from public.parts p
    where p.id = new.part_id;

  if not found or v_tracking_enabled is not true or v_part_component_role_id is null then
    raise exception using
      errcode = '23514',
      message = 'equipment components require an equipment-tracked part with a component role';
  end if;

  if new.component_role_id <> v_part_component_role_id then
    raise exception using
      errcode = '23514',
      message = 'component role must match the selected part';
  end if;

  if new.source_service_item_id is not null then
    select s.equipment_id, si.part_id, si.updates_equipment_component, s.status
      into v_source_equipment_id, v_source_part_id, v_source_updates_component, v_source_service_status
      from public.service_items si
      join public.services s on s.id = si.service_id
      where si.id = new.source_service_item_id;

    if not found or v_source_equipment_id <> new.equipment_id then
      raise exception using
        errcode = '23503',
        message = 'component source service item must belong to the equipment';
    end if;

    if v_source_part_id <> new.part_id
       or v_source_updates_component is not true
       or v_source_service_status <> 'Completed' then
      raise exception using
        errcode = '23514',
        message = 'replacement components must reference their matching completed Service replacement item';
    end if;
  end if;

  return new;
end;
$$;
