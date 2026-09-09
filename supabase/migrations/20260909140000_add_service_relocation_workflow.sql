-- Phase 1C.3: completed relocation Services move the same Equipment through the Phase 1C.2 atomic movement contract.

alter table public.service_types
  add column is_relocation_service boolean not null default false;

create unique index service_types_one_relocation_service_idx
  on public.service_types ((is_relocation_service))
  where is_relocation_service;

insert into public.service_types (name, is_active, is_relocation_service)
select 'Reinstallation / Relocation', true, true
where not exists (
  select 1 from public.service_types where is_relocation_service
);

alter table public.services
  add column relocation_destination_location_id uuid
  references public.locations(id) on delete restrict;

create index services_relocation_destination_location_idx
  on public.services (relocation_destination_location_id)
  where relocation_destination_location_id is not null;

create or replace function public.create_service_with_items_v2_relocation(
  p_submission_key uuid,
  p_equipment_id uuid,
  p_service_date date,
  p_service_type_id uuid,
  p_status text,
  p_items jsonb,
  p_destination_location_id uuid,
  p_final_customer_charge numeric default null,
  p_travel_cost numeric default 0,
  p_other_direct_cost numeric default 0,
  p_other_direct_cost_note text default null,
  p_customer_charge_note text default null,
  p_technician_id uuid default null,
  p_issue_reported text default null,
  p_diagnosis text default null,
  p_work_performed text default null,
  p_tds_in numeric default null,
  p_tds_out numeric default null,
  p_next_service_due date default null,
  p_technician_charge numeric default 0,
  p_equipment_warranty_id uuid default null,
  p_amc_cycle_id uuid default null,
  p_notes text default null
)
returns table (
  service_id uuid,
  service_code text,
  created boolean,
  service_item_id uuid,
  equipment_component_id uuid,
  new_part_warranty_id uuid
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_existing public.services%rowtype;
  v_equipment_customer_id uuid;
  v_current_location_id uuid;
  v_destination_customer_id uuid;
  v_relocation_service boolean;
  v_first record;
begin
  if p_destination_location_id is null then
    raise exception using errcode = '22004', message = 'a destination location is required for a relocation Service';
  end if;

  select s.* into v_existing
    from public.services s
    where s.submission_key = p_submission_key
    for update;

  if found then
    if v_existing.relocation_destination_location_id is distinct from p_destination_location_id then
      raise exception using errcode = '23505', message = 'submission_key already belongs to a different relocation request';
    end if;

    perform 1
      from public.create_service_with_items_v2(
        p_submission_key, p_equipment_id, p_service_date, p_service_type_id, p_status, p_items,
        p_final_customer_charge, p_travel_cost, p_other_direct_cost, p_other_direct_cost_note,
        p_customer_charge_note, p_technician_id, p_issue_reported, p_diagnosis, p_work_performed,
        p_tds_in, p_tds_out, p_next_service_due, p_technician_charge, p_equipment_warranty_id,
        p_amc_cycle_id, p_notes
      )
      limit 1;

    return query
      select s.id, s.service_code, false, si.id, ec.id, sw.id
      from public.services s
      left join public.service_items si on si.service_id = s.id
      left join public.equipment_components ec on ec.source_service_item_id = si.id
      left join public.service_item_warranties sw on sw.service_item_id = si.id
      where s.id = v_existing.id
      order by si.created_at, si.id;
    return;
  end if;

  select st.is_relocation_service
    into v_relocation_service
    from public.service_types st
    where st.id = p_service_type_id
      and st.is_active is true;

  if v_relocation_service is not true then
    raise exception using errcode = '23514', message = 'the selected Service type is not configured for relocation';
  end if;

  select e.customer_id, e.location_id
    into v_equipment_customer_id, v_current_location_id
    from public.equipment e
    where e.id = p_equipment_id
    for update;

  if not found then
    raise exception using errcode = '23503', message = 'equipment was not found';
  end if;

  if v_current_location_id is null then
    raise exception using errcode = '23514', message = 'a relocation Service requires equipment with a recorded current location';
  end if;

  select l.customer_id
    into v_destination_customer_id
    from public.locations l
    where l.id = p_destination_location_id
    for key share;

  if not found then
    raise exception using errcode = '23503', message = 'destination location was not found';
  end if;

  if v_destination_customer_id <> v_equipment_customer_id then
    raise exception using errcode = '23514', message = 'destination location must belong to the equipment customer';
  end if;

  if v_current_location_id = p_destination_location_id then
    raise exception using errcode = '23514', message = 'destination location must differ from the current equipment location';
  end if;

  select *
    into v_first
    from public.create_service_with_items_v2(
      p_submission_key, p_equipment_id, p_service_date, p_service_type_id, p_status, p_items,
      p_final_customer_charge, p_travel_cost, p_other_direct_cost, p_other_direct_cost_note,
      p_customer_charge_note, p_technician_id, p_issue_reported, p_diagnosis, p_work_performed,
      p_tds_in, p_tds_out, p_next_service_due, p_technician_charge, p_equipment_warranty_id,
      p_amc_cycle_id, p_notes
    )
    limit 1;

  update public.services s
    set relocation_destination_location_id = p_destination_location_id
    where s.id = v_first.service_id;

  if p_status = 'Completed' then
    perform 1
      from public.move_equipment_location(
        p_equipment_id,
        p_destination_location_id,
        p_service_date,
        'Service relocation',
        null,
        v_first.service_id
      )
      limit 1;
  end if;

  return query
    select s.id, s.service_code, v_first.created, si.id, ec.id, sw.id
    from public.services s
    left join public.service_items si on si.service_id = s.id
    left join public.equipment_components ec on ec.source_service_item_id = si.id
    left join public.service_item_warranties sw on sw.service_item_id = si.id
    where s.id = v_first.service_id
    order by si.created_at, si.id;
end;
$$;

revoke all on function public.create_service_with_items_v2_relocation(uuid, uuid, date, uuid, text, jsonb, uuid, numeric, numeric, numeric, text, text, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) from public;
revoke all on function public.create_service_with_items_v2_relocation(uuid, uuid, date, uuid, text, jsonb, uuid, numeric, numeric, numeric, text, text, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) from anon;
grant execute on function public.create_service_with_items_v2_relocation(uuid, uuid, date, uuid, text, jsonb, uuid, numeric, numeric, numeric, text, text, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) to authenticated;
