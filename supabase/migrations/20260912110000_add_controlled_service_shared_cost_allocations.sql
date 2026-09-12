-- Phase 3.4.3: controlled Service shared-cost allocation and unknown item-cost preservation.
create or replace function public.create_service_with_items(
  p_submission_key uuid,
  p_equipment_id uuid,
  p_service_date date,
  p_service_type_id uuid,
  p_status text,
  p_items jsonb,
  p_technician_id uuid default null,
  p_issue_reported text default null,
  p_diagnosis text default null,
  p_work_performed text default null,
  p_tds_in numeric default null,
  p_tds_out numeric default null,
  p_next_service_due date default null,
  p_technician_charge numeric default null,
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
  v_service_id uuid;
  v_service_code text;
  v_existing_submission_fingerprint text;
  v_submission_fingerprint text;
  v_created boolean := false;
  v_normalized_issue_reported text;
  v_normalized_diagnosis text;
  v_normalized_work_performed text;
  v_normalized_notes text;
  v_status text;
  v_context_equipment_id uuid;
  v_context_status text;
  v_context_start_date date;
  v_context_end_date date;
  v_item jsonb;
  v_service_item_id uuid;
  v_item_type text;
  v_part_id uuid;
  v_description text;
  v_quantity numeric;
  v_standard_price numeric;
  v_actual_customer_price numeric;
  v_internal_cost numeric;
  v_coverage_type text;
  v_item_equipment_warranty_id uuid;
  v_item_amc_cycle_id uuid;
  v_claimed_warranty_id uuid;
  v_updates_equipment_component boolean;
  v_item_notes text;
  v_issue_new_part_warranty boolean;
  v_part_tracking_enabled boolean;
  v_part_warranty_eligible boolean;
  v_component_role_id uuid;
  v_default_warranty_months integer;
  v_open_component_id uuid;
  v_equipment_component_id uuid;
  v_new_part_warranty_id uuid;
  v_old_warranty_status text;
  v_old_warranty_equipment_id uuid;
  v_old_warranty_part_id uuid;
  v_old_warranty_start_date date;
  v_old_warranty_end_date date;
  v_new_warranty_end_date date;
  v_component_role_ids uuid[] := array[]::uuid[];
  v_claimed_warranty_ids uuid[] := array[]::uuid[];
begin
  if p_submission_key is null then
    raise exception using errcode = '22004', message = 'submission_key is required';
  end if;

  v_status := nullif(btrim(p_status), '');

  if p_equipment_id is null or p_service_date is null or p_service_type_id is null or v_status is null then
    raise exception using errcode = '22004', message = 'equipment_id, service_date, service_type_id, and status are required';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'items must be a JSON array';
  end if;

  v_normalized_issue_reported := nullif(btrim(p_issue_reported), '');
  v_normalized_diagnosis := nullif(btrim(p_diagnosis), '');
  v_normalized_work_performed := nullif(btrim(p_work_performed), '');
  v_normalized_notes := nullif(btrim(p_notes), '');
  v_submission_fingerprint := md5(jsonb_build_object(
    'equipment_id', p_equipment_id,
    'service_date', p_service_date,
    'service_type_id', p_service_type_id,
    'status', v_status,
    'technician_id', p_technician_id,
    'issue_reported', v_normalized_issue_reported,
    'diagnosis', v_normalized_diagnosis,
    'work_performed', v_normalized_work_performed,
    'tds_in', p_tds_in,
    'tds_out', p_tds_out,
    'next_service_due', p_next_service_due,
    'technician_charge', p_technician_charge,
    'equipment_warranty_id', p_equipment_warranty_id,
    'amc_cycle_id', p_amc_cycle_id,
    'notes', v_normalized_notes,
    'items', p_items
  )::text);

  select s.id, s.service_code, s.submission_fingerprint
    into v_service_id, v_service_code, v_existing_submission_fingerprint
    from public.services s
    where s.submission_key = p_submission_key;

  if found then
    if v_existing_submission_fingerprint is distinct from v_submission_fingerprint then
      raise exception using errcode = '23505', message = 'submission_key already belongs to a different service request';
    end if;

    return query
      select s.id, s.service_code, false, si.id, ec.id, sw.id
      from public.services s
      left join public.service_items si on si.service_id = s.id
      left join public.equipment_components ec on ec.source_service_item_id = si.id
      left join public.service_item_warranties sw on sw.service_item_id = si.id
      where s.id = v_service_id
      order by si.created_at, si.id;
    return;
  end if;

  insert into public.services as s (
    submission_key,
    submission_fingerprint,
    equipment_id,
    service_date,
    technician_id,
    service_type_id,
    issue_reported,
    diagnosis,
    work_performed,
    tds_in,
    tds_out,
    next_service_due,
    technician_charge,
    equipment_warranty_id,
    amc_cycle_id,
    status,
    notes
  )
  values (
    p_submission_key,
    v_submission_fingerprint,
    p_equipment_id,
    p_service_date,
    p_technician_id,
    p_service_type_id,
    v_normalized_issue_reported,
    v_normalized_diagnosis,
    v_normalized_work_performed,
    p_tds_in,
    p_tds_out,
    p_next_service_due,
    p_technician_charge,
    p_equipment_warranty_id,
    p_amc_cycle_id,
    v_status,
    v_normalized_notes
  )
  on conflict (submission_key) do nothing
  returning s.id, s.service_code into v_service_id, v_service_code;

  if not found then
    select s.id, s.service_code, s.submission_fingerprint
      into v_service_id, v_service_code, v_existing_submission_fingerprint
      from public.services s
      where s.submission_key = p_submission_key;

    if not found then
      raise exception using errcode = '23505', message = 'submission_key conflict could not be resolved';
    end if;

    if v_existing_submission_fingerprint is distinct from v_submission_fingerprint then
      raise exception using errcode = '23505', message = 'submission_key already belongs to a different service request';
    end if;

    return query
      select s.id, s.service_code, false, si.id, ec.id, sw.id
      from public.services s
      left join public.service_items si on si.service_id = s.id
      left join public.equipment_components ec on ec.source_service_item_id = si.id
      left join public.service_item_warranties sw on sw.service_item_id = si.id
      where s.id = v_service_id
      order by si.created_at, si.id;
    return;
  end if;

  v_created := true;

  select e.id into v_context_equipment_id
    from public.equipment e
    where e.id = p_equipment_id
    for key share;

  if not found then
    raise exception using errcode = '23503', message = 'equipment_id does not reference an available equipment record';
  end if;

  if p_equipment_warranty_id is not null and p_amc_cycle_id is not null then
    raise exception using errcode = '23514', message = 'a service can reference either an equipment warranty or an AMC cycle, not both';
  end if;

  if p_equipment_warranty_id is not null then
    select ew.equipment_id, ew.status, ew.start_date, ew.end_date
      into v_context_equipment_id, v_context_status, v_context_start_date, v_context_end_date
      from public.equipment_warranties ew
      where ew.id = p_equipment_warranty_id
      for key share;

    if not found or v_context_equipment_id <> p_equipment_id
       or v_context_status <> 'Active'
       or p_service_date not between v_context_start_date and v_context_end_date then
      raise exception using errcode = '23503', message = 'equipment warranty is not active for this equipment on the service date';
    end if;
  end if;

  if p_amc_cycle_id is not null then
    select ac.equipment_id, ac.status, ac.start_date, ac.end_date
      into v_context_equipment_id, v_context_status, v_context_start_date, v_context_end_date
      from public.amc_cycles ac
      where ac.id = p_amc_cycle_id
      for key share;

    if not found or v_context_equipment_id <> p_equipment_id
       or v_context_status <> 'Active'
       or p_service_date not between v_context_start_date and v_context_end_date then
      raise exception using errcode = '23503', message = 'AMC cycle is not active for this equipment on the service date';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'each service item must be a JSON object';
    end if;

    v_item_type := nullif(btrim(v_item ->> 'item_type'), '');
    v_part_id := nullif(v_item ->> 'part_id', '')::uuid;
    v_description := nullif(btrim(v_item ->> 'description'), '');
    v_quantity := coalesce(nullif(v_item ->> 'quantity', '')::numeric, 1);
    v_standard_price := nullif(v_item ->> 'standard_price', '')::numeric;
    v_actual_customer_price := coalesce(nullif(v_item ->> 'actual_customer_price', '')::numeric, 0);
    v_internal_cost := nullif(v_item ->> 'internal_cost', '')::numeric;
    v_coverage_type := nullif(btrim(v_item ->> 'coverage_type'), '');
    v_item_equipment_warranty_id := nullif(v_item ->> 'equipment_warranty_id', '')::uuid;
    v_item_amc_cycle_id := nullif(v_item ->> 'amc_cycle_id', '')::uuid;
    v_claimed_warranty_id := nullif(v_item ->> 'service_item_warranty_id', '')::uuid;
    v_updates_equipment_component := coalesce(nullif(v_item ->> 'updates_equipment_component', '')::boolean, false);
    v_item_notes := nullif(btrim(v_item ->> 'notes'), '');
    v_issue_new_part_warranty := coalesce(nullif(v_item ->> 'issue_new_part_warranty', '')::boolean, false);
    v_component_role_id := null;
    v_part_tracking_enabled := false;
    v_part_warranty_eligible := false;
    v_default_warranty_months := null;
    v_equipment_component_id := null;
    v_new_part_warranty_id := null;

    if v_item_type is null or v_coverage_type is null then
      raise exception using errcode = '22004', message = 'item_type and coverage_type are required for every service item';
    end if;

    if v_quantity <= 0 then
      raise exception using errcode = '22023', message = 'service item quantity must be greater than zero';
    end if;

    if v_part_id is not null then
      select p.equipment_tracking_enabled, p.part_warranty_eligible, p.component_role_id, p.default_warranty_months
        into v_part_tracking_enabled, v_part_warranty_eligible, v_component_role_id, v_default_warranty_months
        from public.parts p
        where p.id = v_part_id
        for key share;

      if not found then
        raise exception using errcode = '23503', message = 'part_id does not reference an available part';
      end if;
    end if;

    if v_coverage_type = 'Equipment Warranty' then
      select ew.equipment_id, ew.status, ew.start_date, ew.end_date
        into v_context_equipment_id, v_context_status, v_context_start_date, v_context_end_date
        from public.equipment_warranties ew
        where ew.id = v_item_equipment_warranty_id
        for key share;

      if not found or v_context_equipment_id <> p_equipment_id
         or v_context_status <> 'Active'
         or p_service_date not between v_context_start_date and v_context_end_date then
        raise exception using errcode = '23503', message = 'item equipment warranty is not active for this equipment on the service date';
      end if;
    elsif v_coverage_type = 'AMC' then
      select ac.equipment_id, ac.status, ac.start_date, ac.end_date
        into v_context_equipment_id, v_context_status, v_context_start_date, v_context_end_date
        from public.amc_cycles ac
        where ac.id = v_item_amc_cycle_id
        for key share;

      if not found or v_context_equipment_id <> p_equipment_id
         or v_context_status <> 'Active'
         or p_service_date not between v_context_start_date and v_context_end_date then
        raise exception using errcode = '23503', message = 'item AMC cycle is not active for this equipment on the service date';
      end if;
    elsif v_coverage_type = 'Part Warranty' then
      if v_status <> 'Completed' then
        raise exception using errcode = '23514', message = 'part-warranty claims require a Completed service';
      end if;

      if v_item_type <> 'Replacement' or v_part_id is null or v_quantity <> 1 then
        raise exception using errcode = '23514', message = 'part-warranty replacement items require a part and quantity of one';
      end if;

      if v_issue_new_part_warranty then
        raise exception using errcode = '23514', message = 'part-warranty replacements create their renewal automatically; do not request a separate new warranty';
      end if;

      select sw.status, sw.equipment_id, sw.part_id, sw.start_date, sw.end_date
        into v_old_warranty_status, v_old_warranty_equipment_id, v_old_warranty_part_id, v_old_warranty_start_date, v_old_warranty_end_date
        from public.service_item_warranties sw
        where sw.id = v_claimed_warranty_id
        for update;

      if not found or v_old_warranty_equipment_id <> p_equipment_id or v_old_warranty_part_id <> v_part_id
         or v_old_warranty_status <> 'Active'
         or p_service_date not between v_old_warranty_start_date and v_old_warranty_end_date then
        raise exception using errcode = '23503', message = 'part warranty is not active for this equipment, part, and service date';
      end if;

      if v_claimed_warranty_id = any(v_claimed_warranty_ids) then
        raise exception using errcode = '23514', message = 'a part warranty can be claimed only once in one service request';
      end if;
      v_claimed_warranty_ids := array_append(v_claimed_warranty_ids, v_claimed_warranty_id);
    end if;

    if v_updates_equipment_component then
      if v_status <> 'Completed' then
        raise exception using errcode = '23514', message = 'component replacement requires a Completed service';
      end if;

      if v_item_type <> 'Replacement' or v_part_id is null or v_part_tracking_enabled is not true or v_component_role_id is null then
        raise exception using errcode = '23514', message = 'component replacement requires an equipment-tracked replacement part with a component role';
      end if;

      if v_quantity <> 1 then
        raise exception using errcode = '23514', message = 'component replacement items must have quantity one';
      end if;

      if v_component_role_id = any(v_component_role_ids) then
        raise exception using errcode = '23514', message = 'only one tracked replacement per component role is allowed in one service request';
      end if;
      v_component_role_ids := array_append(v_component_role_ids, v_component_role_id);
    end if;

    if v_issue_new_part_warranty then
      if v_status <> 'Completed' then
        raise exception using errcode = '23514', message = 'new part-warranty issuance requires a Completed service';
      end if;

      if v_coverage_type <> 'Paid' or v_item_type <> 'Replacement' or v_part_id is null or v_part_warranty_eligible is not true then
        raise exception using errcode = '23514', message = 'new part-warranty issuance requires an eligible Paid replacement part';
      end if;

      if v_quantity <> 1 then
        raise exception using errcode = '23514', message = 'part-warranty issuance items must have quantity one';
      end if;
    end if;

    if v_coverage_type = 'Part Warranty' and v_part_warranty_eligible is not true then
      raise exception using errcode = '23514', message = 'part-warranty replacement requires an eligible part';
    end if;

    insert into public.service_items (
      service_id,
      part_id,
      item_type,
      description,
      quantity,
      standard_price,
      actual_customer_price,
      internal_cost,
      coverage_type,
      equipment_warranty_id,
      amc_cycle_id,
      service_item_warranty_id,
      updates_equipment_component,
      notes
    )
    values (
      v_service_id,
      v_part_id,
      v_item_type,
      v_description,
      v_quantity,
      v_standard_price,
      v_actual_customer_price,
      v_internal_cost,
      v_coverage_type,
      v_item_equipment_warranty_id,
      v_item_amc_cycle_id,
      v_claimed_warranty_id,
      v_updates_equipment_component,
      v_item_notes
    )
    returning id into v_service_item_id;

    if v_updates_equipment_component then
      perform pg_advisory_xact_lock(hashtextextended(p_equipment_id::text || ':' || v_component_role_id::text, 0));

      select ec.id into v_open_component_id
        from public.equipment_components ec
        where ec.equipment_id = p_equipment_id
          and ec.component_role_id = v_component_role_id
          and ec.removed_date is null
        for update;

      if found then
        update public.equipment_components
          set removed_date = p_service_date
          where id = v_open_component_id;
      end if;

      insert into public.equipment_components (
        equipment_id,
        part_id,
        component_role_id,
        installed_date,
        source_service_item_id
      )
      values (
        p_equipment_id,
        v_part_id,
        v_component_role_id,
        p_service_date,
        v_service_item_id
      )
      returning id into v_equipment_component_id;
    end if;

    if v_coverage_type = 'Part Warranty' or v_issue_new_part_warranty then
      if v_default_warranty_months is null or v_default_warranty_months <= 0 then
        raise exception using errcode = '23514', message = 'part has no usable default warranty duration';
      end if;

      v_new_warranty_end_date := (p_service_date + make_interval(months => v_default_warranty_months) - interval '1 day')::date;

      if v_coverage_type = 'Part Warranty' then
        update public.service_item_warranties
          set status = 'Replaced'
          where id = v_claimed_warranty_id;

        insert into public.service_item_warranties (
          service_item_id,
          equipment_id,
          part_id,
          start_date,
          end_date,
          duration_months,
          status,
          replaced_warranty_id
        )
        values (
          v_service_item_id,
          p_equipment_id,
          v_part_id,
          p_service_date,
          v_new_warranty_end_date,
          v_default_warranty_months,
          'Active',
          v_claimed_warranty_id
        )
        returning id into v_new_part_warranty_id;
      else
        insert into public.service_item_warranties (
          service_item_id,
          equipment_id,
          part_id,
          start_date,
          end_date,
          duration_months,
          status
        )
        values (
          v_service_item_id,
          p_equipment_id,
          v_part_id,
          p_service_date,
          v_new_warranty_end_date,
          v_default_warranty_months,
          'Active'
        )
        returning id into v_new_part_warranty_id;
      end if;
    end if;

    service_id := v_service_id;
    service_code := v_service_code;
    created := v_created;
    service_item_id := v_service_item_id;
    equipment_component_id := v_equipment_component_id;
    new_part_warranty_id := v_new_part_warranty_id;
    return next;
  end loop;

  if jsonb_array_length(p_items) = 0 then
    service_id := v_service_id;
    service_code := v_service_code;
    created := v_created;
    service_item_id := null;
    equipment_component_id := null;
    new_part_warranty_id := null;
    return next;
  end if;
end;
$$;
alter table public.services add column if not exists shared_cost_allocation_fingerprint text;

-- Allocation rows are readable CRM history, not a direct authenticated write surface.
revoke all on table public.service_cost_allocations from public, anon, authenticated;
grant select on table public.service_cost_allocations to authenticated;
drop policy if exists authenticated_crm_access on public.service_cost_allocations;
create policy authenticated_crm_read_access
  on public.service_cost_allocations
  for select
  to authenticated
  using (true);
create or replace function private.apply_service_cost_allocations(p_service_id uuid,p_allocations jsonb) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v jsonb; v_source uuid; v_index integer; v_amount numeric; v_type text; v_attr record;
begin
if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))<>'array' then raise exception using errcode='22023',message='shared_cost_allocations must be an array';end if;
perform 1 from public.services where id=p_service_id for update;if not found then raise exception using errcode='23503',message='Service was not found for shared-cost allocation';end if;
delete from public.service_cost_allocations where service_id=p_service_id;
for v in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
 if jsonb_typeof(v)<>'object' then raise exception using errcode='22023',message='each shared-cost allocation must be an object';end if;
 v_type:=nullif(btrim(v->>'cost_type'),'');v_amount:=nullif(v->>'amount','')::numeric;v_source:=nullif(v->>'source_service_item_id','')::uuid;v_index:=nullif(v->>'source_item_index','')::integer;
 if v_type not in('Technician','Travel','Other') or v_amount is null or v_amount<0 then raise exception using errcode='22023',message='shared-cost allocations require a supported cost type and non-negative amount';end if;
 if (v_source is null)=(v_index is null) then raise exception using errcode='22023',message='shared-cost allocation requires exactly one source Service item reference';end if;
 if v_index is not null then if v_index<0 then raise exception using errcode='22023',message='source Service item index cannot be negative';end if;select si.id into v_source from public.service_items si where si.service_id=p_service_id order by si.created_at,si.id offset v_index limit 1;end if;
 select * into v_attr from private.resolve_service_item_economic_attribution(v_source);
 if not found or not v_attr.attribution_known or v_attr.economic_bucket='Unallocated' then raise exception using errcode='23514',message='shared cost can be allocated only to a deterministically attributable Service item';end if;
 insert into public.service_cost_allocations(service_id,cost_type,economic_bucket,amount,source_service_item_id) values(p_service_id,v_type,v_attr.economic_bucket,v_amount,v_source);
end loop;
end $$;
create or replace function private.service_allocation_fingerprint(p jsonb) returns text language sql immutable security invoker set search_path=pg_catalog as $$select md5(coalesce(p,'[]'::jsonb)::text)$$;
revoke all on function private.apply_service_cost_allocations(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.service_allocation_fingerprint(jsonb) from public,anon,authenticated;
create or replace function public.create_service_with_items_v2_allocated(p_submission_key uuid,p_equipment_id uuid,p_service_date date,p_service_type_id uuid,p_status text,p_items jsonb,p_final_customer_charge numeric default null,p_travel_cost numeric default 0,p_other_direct_cost numeric default 0,p_other_direct_cost_note text default null,p_customer_charge_note text default null,p_technician_id uuid default null,p_issue_reported text default null,p_diagnosis text default null,p_work_performed text default null,p_tds_in numeric default null,p_tds_out numeric default null,p_next_service_due date default null,p_technician_charge numeric default 0,p_equipment_warranty_id uuid default null,p_amc_cycle_id uuid default null,p_notes text default null,p_shared_cost_allocations jsonb default '[]'::jsonb) returns table(service_id uuid,service_code text,created boolean,service_item_id uuid,equipment_component_id uuid,new_part_warranty_id uuid) language plpgsql security definer set search_path=pg_catalog,public as $$declare r record;f text;begin if auth.uid() is null then raise exception using errcode='28000',message='authenticated access is required'; end if; f:=private.service_allocation_fingerprint(p_shared_cost_allocations);select * into r from public.create_service_with_items_v2(p_submission_key,p_equipment_id,p_service_date,p_service_type_id,p_status,p_items,p_final_customer_charge,p_travel_cost,p_other_direct_cost,p_other_direct_cost_note,p_customer_charge_note,p_technician_id,p_issue_reported,p_diagnosis,p_work_performed,p_tds_in,p_tds_out,p_next_service_due,p_technician_charge,p_equipment_warranty_id,p_amc_cycle_id,p_notes) limit 1;if r.created then perform private.apply_service_cost_allocations(r.service_id,p_shared_cost_allocations);update public.services set shared_cost_allocation_fingerprint=f where id=r.service_id;elsif coalesce((select shared_cost_allocation_fingerprint from public.services where id=r.service_id),private.service_allocation_fingerprint('[]'::jsonb)) is distinct from f then raise exception using errcode='23505',message='submission_key already belongs to a different shared-cost allocation request';end if;return query select s.id,s.service_code,r.created,si.id,ec.id,sw.id from public.services s left join public.service_items si on si.service_id=s.id left join public.equipment_components ec on ec.source_service_item_id=si.id left join public.service_item_warranties sw on sw.service_item_id=si.id where s.id=r.service_id order by si.created_at,si.id;end $$;
create or replace function public.create_service_with_items_v2_relocation_allocated(p_submission_key uuid,p_equipment_id uuid,p_service_date date,p_service_type_id uuid,p_status text,p_items jsonb,p_destination_location_id uuid,p_final_customer_charge numeric default null,p_travel_cost numeric default 0,p_other_direct_cost numeric default 0,p_other_direct_cost_note text default null,p_customer_charge_note text default null,p_technician_id uuid default null,p_issue_reported text default null,p_diagnosis text default null,p_work_performed text default null,p_tds_in numeric default null,p_tds_out numeric default null,p_next_service_due date default null,p_technician_charge numeric default 0,p_equipment_warranty_id uuid default null,p_amc_cycle_id uuid default null,p_notes text default null,p_shared_cost_allocations jsonb default '[]'::jsonb) returns table(service_id uuid,service_code text,created boolean,service_item_id uuid,equipment_component_id uuid,new_part_warranty_id uuid) language plpgsql security definer set search_path=pg_catalog,public as $$declare r record;f text;begin if auth.uid() is null then raise exception using errcode='28000',message='authenticated access is required'; end if; f:=private.service_allocation_fingerprint(p_shared_cost_allocations);select * into r from public.create_service_with_items_v2_relocation(p_submission_key,p_equipment_id,p_service_date,p_service_type_id,p_status,p_items,p_destination_location_id,p_final_customer_charge,p_travel_cost,p_other_direct_cost,p_other_direct_cost_note,p_customer_charge_note,p_technician_id,p_issue_reported,p_diagnosis,p_work_performed,p_tds_in,p_tds_out,p_next_service_due,p_technician_charge,p_equipment_warranty_id,p_amc_cycle_id,p_notes) limit 1;if r.created then perform private.apply_service_cost_allocations(r.service_id,p_shared_cost_allocations);update public.services set shared_cost_allocation_fingerprint=f where id=r.service_id;elsif coalesce((select shared_cost_allocation_fingerprint from public.services where id=r.service_id),private.service_allocation_fingerprint('[]'::jsonb)) is distinct from f then raise exception using errcode='23505',message='submission_key already belongs to a different shared-cost allocation request';end if;return query select s.id,s.service_code,r.created,si.id,ec.id,sw.id from public.services s left join public.service_items si on si.service_id=s.id left join public.equipment_components ec on ec.source_service_item_id=si.id left join public.service_item_warranties sw on sw.service_item_id=si.id where s.id=r.service_id order by si.created_at,si.id;end $$;
revoke all on function public.create_service_with_items_v2_allocated(uuid,uuid,date,uuid,text,jsonb,numeric,numeric,numeric,text,text,uuid,text,text,text,numeric,numeric,date,numeric,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_service_with_items_v2_allocated(uuid,uuid,date,uuid,text,jsonb,numeric,numeric,numeric,text,text,uuid,text,text,text,numeric,numeric,date,numeric,uuid,uuid,text,jsonb) to authenticated;
revoke all on function public.create_service_with_items_v2_relocation_allocated(uuid,uuid,date,uuid,text,jsonb,uuid,numeric,numeric,numeric,text,text,uuid,text,text,text,numeric,numeric,date,numeric,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_service_with_items_v2_relocation_allocated(uuid,uuid,date,uuid,text,jsonb,uuid,numeric,numeric,numeric,text,text,uuid,text,text,text,numeric,numeric,date,numeric,uuid,uuid,text,jsonb) to authenticated;

create or replace function public.amend_service(
  p_service_id uuid,
  p_header jsonb,
  p_items jsonb,
  p_correction_note text default null
)
returns uuid language plpgsql security invoker set search_path to 'pg_catalog','public' as $$
declare
  v_service public.services%rowtype;
  v_before jsonb; v_after jsonb; v_paid numeric; v_charge numeric;
  v_has_relocation boolean; v_financial_change boolean := false;
  v_item jsonb; v_action text; v_item_id uuid; v_existing public.service_items%rowtype;
  v_part_id uuid; v_item_type text; v_quantity numeric; v_standard_price numeric;
  v_actual_customer_price numeric; v_internal_cost numeric; v_coverage_type text;
  v_equipment_warranty_id uuid; v_amc_cycle_id uuid; v_claimed_warranty_id uuid;
  v_updates_component boolean; v_issue_warranty boolean; v_description text; v_notes text;
  v_role_id uuid; v_tracking boolean; v_eligible boolean; v_duration integer;
  v_previous_id uuid; v_previous_installed date; v_next_id uuid; v_next_installed date;
  v_new_item_id uuid; v_old_warranty public.service_item_warranties%rowtype;
  v_later_warranty boolean; v_end_date date;
begin
  if jsonb_typeof(coalesce(p_header,'{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then
    raise exception using errcode='22023', message='Service amendment requires a header object and an items array';
  end if;

  select * into v_service from public.services where id=p_service_id for update;
  if not found then raise exception using errcode='P0002', message='Service was not found'; end if;

  select exists(select 1 from public.equipment_location_history where source_service_id=p_service_id)
    or v_service.relocation_destination_location_id is not null into v_has_relocation;
  if v_has_relocation and nullif(p_header->>'service_date','')::date is distinct from v_service.service_date then
    raise exception using errcode='23514', message='Service Date is locked for a relocation Service because Location History must remain unchanged';
  end if;

  if (p_header ? 'final_customer_charge' and nullif(p_header->>'final_customer_charge','')::numeric is distinct from v_service.final_customer_charge)
     or (p_header ? 'technician_charge' and coalesce(nullif(p_header->>'technician_charge','')::numeric,0) is distinct from coalesce(v_service.technician_charge,0))
     or (p_header ? 'travel_cost' and coalesce(nullif(p_header->>'travel_cost','')::numeric,0) is distinct from coalesce(v_service.travel_cost,0))
     or (p_header ? 'other_direct_cost' and coalesce(nullif(p_header->>'other_direct_cost','')::numeric,0) is distinct from coalesce(v_service.other_direct_cost,0)) then
    v_financial_change := true;
  end if;

  select jsonb_build_object('service',to_jsonb(v_service),'items',coalesce((select jsonb_agg(to_jsonb(si) order by si.created_at,si.id) from public.service_items si where si.service_id=p_service_id),'[]'::jsonb),'shared_cost_allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.cost_type,a.created_at,a.id) from public.service_cost_allocations a where a.service_id=p_service_id),'[]'::jsonb)) into v_before;

  perform set_config('app.service_correction_in_progress','on',true);

  update public.services
     set service_date=coalesce(nullif(p_header->>'service_date','')::date,service_date),
         technician_id=case when p_header ? 'technician_id' then nullif(p_header->>'technician_id','')::uuid else technician_id end,
         issue_reported=case when p_header ? 'issue_reported' then nullif(btrim(p_header->>'issue_reported'),'') else issue_reported end,
         diagnosis=case when p_header ? 'diagnosis' then nullif(btrim(p_header->>'diagnosis'),'') else diagnosis end,
         work_performed=case when p_header ? 'work_performed' then nullif(btrim(p_header->>'work_performed'),'') else work_performed end,
         tds_in=case when p_header ? 'tds_in' then nullif(p_header->>'tds_in','')::numeric else tds_in end,
         tds_out=case when p_header ? 'tds_out' then nullif(p_header->>'tds_out','')::numeric else tds_out end,
         next_service_due=case when p_header ? 'next_service_due' then nullif(p_header->>'next_service_due','')::date else next_service_due end,
         notes=case when p_header ? 'notes' then nullif(btrim(p_header->>'notes'),'') else notes end,
         final_customer_charge=case when financial_model_version=2 and p_header ? 'final_customer_charge' then nullif(p_header->>'final_customer_charge','')::numeric else final_customer_charge end,
         technician_charge=case when financial_model_version=2 and p_header ? 'technician_charge' then coalesce(nullif(p_header->>'technician_charge','')::numeric,0) else technician_charge end,
         travel_cost=case when financial_model_version=2 and p_header ? 'travel_cost' then coalesce(nullif(p_header->>'travel_cost','')::numeric,0) else travel_cost end,
         other_direct_cost=case when financial_model_version=2 and p_header ? 'other_direct_cost' then coalesce(nullif(p_header->>'other_direct_cost','')::numeric,0) else other_direct_cost end,
         other_direct_cost_note=case when financial_model_version=2 and p_header ? 'other_direct_cost_note' then nullif(btrim(p_header->>'other_direct_cost_note'),'') else other_direct_cost_note end,
         customer_charge_note=case when financial_model_version=2 and p_header ? 'customer_charge_note' then nullif(btrim(p_header->>'customer_charge_note'),'') else customer_charge_note end
   where id=p_service_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception using errcode='22023',message='each amended Service item must be an object'; end if;
    v_action:=coalesce(nullif(btrim(v_item->>'action'),''),case when v_item ? 'id' then 'update' else 'add' end);

    if v_action in ('update','remove') then
      v_item_id:=nullif(v_item->>'id','')::uuid;
      select * into v_existing from public.service_items where id=v_item_id and service_id=p_service_id for update;
      if not found then raise exception using errcode='23503',message='Service item does not belong to this Service'; end if;

      if v_action='remove' then
        if exists(select 1 from public.equipment_components where source_service_item_id=v_item_id)
          or exists(select 1 from public.service_item_warranties where service_item_id=v_item_id)
          or exists(select 1 from public.service_items where service_item_warranty_id in (select id from public.service_item_warranties where service_item_id=v_item_id)) then
          raise exception using errcode='23514',message='This physical Service item cannot be removed because component or warranty history already exists';
        end if;
        delete from public.service_items where id=v_item_id;
        v_financial_change:=true;
      elsif v_action='update' then
        v_standard_price:=case when v_item ? 'standard_price' then nullif(v_item->>'standard_price','')::numeric else v_existing.standard_price end;
        v_actual_customer_price:=case when v_item ? 'actual_customer_price' then coalesce(nullif(v_item->>'actual_customer_price','')::numeric,0) else v_existing.actual_customer_price end;
        v_internal_cost:=case when v_item ? 'internal_cost' then nullif(v_item->>'internal_cost','')::numeric else v_existing.internal_cost end;
        if v_standard_price is distinct from v_existing.standard_price or v_actual_customer_price is distinct from v_existing.actual_customer_price or v_internal_cost is distinct from v_existing.internal_cost then v_financial_change:=true; end if;
        update public.service_items set description=case when v_item ? 'description' then nullif(btrim(v_item->>'description'),'') else description end,
          notes=case when v_item ? 'notes' then nullif(btrim(v_item->>'notes'),'') else notes end,
          standard_price=v_standard_price,actual_customer_price=v_actual_customer_price,internal_cost=v_internal_cost where id=v_item_id;
      else
        raise exception using errcode='22023',message='Service item action must be add, update, or remove';
      end if;
      continue;
    end if;

    if v_action <> 'add' then raise exception using errcode='22023',message='Service item action must be add, update, or remove'; end if;
    v_item_type:=nullif(btrim(v_item->>'item_type'),''); v_part_id:=nullif(v_item->>'part_id','')::uuid;
    v_quantity:=coalesce(nullif(v_item->>'quantity','')::numeric,1); v_standard_price:=nullif(v_item->>'standard_price','')::numeric;
    v_actual_customer_price:=coalesce(nullif(v_item->>'actual_customer_price','')::numeric,0); v_internal_cost:=nullif(v_item->>'internal_cost','')::numeric;
    v_coverage_type:=nullif(btrim(v_item->>'coverage_type'),''); v_equipment_warranty_id:=nullif(v_item->>'equipment_warranty_id','')::uuid;
    v_amc_cycle_id:=nullif(v_item->>'amc_cycle_id','')::uuid; v_claimed_warranty_id:=nullif(v_item->>'service_item_warranty_id','')::uuid;
    v_updates_component:=coalesce(nullif(v_item->>'updates_equipment_component','')::boolean,false);
    v_issue_warranty:=coalesce(nullif(v_item->>'issue_new_part_warranty','')::boolean,false);
    v_description:=nullif(btrim(v_item->>'description'),''); v_notes:=nullif(btrim(v_item->>'notes'),'');
    if v_item_type is null or v_coverage_type is null or v_quantity<=0 then raise exception using errcode='22023',message='added Service item requires item type, coverage, and a positive quantity'; end if;
    if v_service.financial_model_version=2 and v_standard_price is null then raise exception using errcode='23514',message='V2 Service items require a usual/reference price'; end if;
    if v_part_id is not null then
      select component_role_id,equipment_tracking_enabled,part_warranty_eligible,default_warranty_months into v_role_id,v_tracking,v_eligible,v_duration from public.parts where id=v_part_id for key share;
      if not found then raise exception using errcode='23503',message='part_id does not reference an available part'; end if;
    else v_role_id:=null;v_tracking:=false;v_eligible:=false;v_duration:=null; end if;
    if v_coverage_type='Equipment Warranty' and not exists(select 1 from public.equipment_warranties ew where ew.id=v_equipment_warranty_id and ew.equipment_id=v_service.equipment_id and ew.status='Active' and v_service.service_date between ew.start_date and ew.end_date) then raise exception using errcode='23503',message='item equipment warranty is not active for this equipment on the original Service Date'; end if;
    if v_coverage_type='AMC' and not exists(select 1 from public.amc_cycles ac where ac.id=v_amc_cycle_id and ac.equipment_id=v_service.equipment_id and ac.status='Active' and v_service.service_date between ac.start_date and ac.end_date) then raise exception using errcode='23503',message='item AMC is not active for this equipment on the original Service Date'; end if;
    if v_coverage_type='Part Warranty' then
      select * into v_old_warranty from public.service_item_warranties where id=v_claimed_warranty_id for update;
      if not found or v_service.status<>'Completed' or v_item_type<>'Replacement' or v_part_id is null or v_quantity<>1 or v_old_warranty.equipment_id<>v_service.equipment_id or v_old_warranty.part_id<>v_part_id or v_old_warranty.status<>'Active' or v_service.service_date not between v_old_warranty.start_date and v_old_warranty.end_date then raise exception using errcode='23514',message='part-warranty addition requires an active matching warranty on the original Service Date'; end if;
      if v_issue_warranty then raise exception using errcode='23514',message='part-warranty replacement creates its renewal automatically'; end if;
    end if;
    if v_updates_component and (v_service.status<>'Completed' or v_item_type<>'Replacement' or v_part_id is null or not v_tracking or v_role_id is null or v_quantity<>1) then raise exception using errcode='23514',message='component replacement requires a completed one-unit tracked replacement'; end if;
    if v_issue_warranty and (v_service.status<>'Completed' or v_item_type<>'Replacement' or v_part_id is null or not v_eligible or v_coverage_type<>'Paid' or v_quantity<>1) then raise exception using errcode='23514',message='new part warranty requires a completed one-unit eligible Paid replacement'; end if;
    if v_coverage_type='Part Warranty' and not v_eligible then raise exception using errcode='23514',message='part-warranty replacement requires an eligible part'; end if;

    insert into public.service_items(service_id,part_id,item_type,description,quantity,standard_price,actual_customer_price,internal_cost,coverage_type,equipment_warranty_id,amc_cycle_id,service_item_warranty_id,updates_equipment_component,notes)
    values(p_service_id,v_part_id,v_item_type,v_description,v_quantity,v_standard_price,case when v_service.financial_model_version=2 then 0 else v_actual_customer_price end,v_internal_cost,v_coverage_type,v_equipment_warranty_id,v_amc_cycle_id,v_claimed_warranty_id,v_updates_component,v_notes)
    returning id into v_new_item_id;
    v_financial_change:=true;

    if v_updates_component then
      perform pg_advisory_xact_lock(hashtextextended(v_service.equipment_id::text || ':' || v_role_id::text,0));
      select ec.id,ec.installed_date into v_previous_id,v_previous_installed from public.equipment_components ec where ec.equipment_id=v_service.equipment_id and ec.component_role_id=v_role_id and ec.installed_date<=v_service.service_date and (ec.removed_date is null or ec.removed_date>=v_service.service_date) order by ec.installed_date desc nulls last,ec.created_at desc limit 1 for update;
      select ec.id,ec.installed_date into v_next_id,v_next_installed from public.equipment_components ec where ec.equipment_id=v_service.equipment_id and ec.component_role_id=v_role_id and ec.installed_date>v_service.service_date order by ec.installed_date,ec.created_at limit 1 for update;
      if exists(select 1 from public.equipment_components ec where ec.equipment_id=v_service.equipment_id and ec.component_role_id=v_role_id and ec.installed_date=v_service.service_date) then raise exception using errcode='23514',message='component chronology is ambiguous: a replacement is already recorded on the original Service Date'; end if;
      if v_previous_id is not null and v_previous_installed is null then raise exception using errcode='23514',message='component chronology is ambiguous because the prior component has no installed date'; end if;
      if v_previous_id is not null then update public.equipment_components set removed_date=v_service.service_date where id=v_previous_id; end if;
      insert into public.equipment_components(equipment_id,part_id,component_role_id,installed_date,removed_date,source_service_item_id)
      values(v_service.equipment_id,v_part_id,v_role_id,v_service.service_date,v_next_installed,v_new_item_id);
    end if;

    if v_coverage_type='Part Warranty' or v_issue_warranty then
      if coalesce(v_duration,0)<=0 then raise exception using errcode='23514',message='part has no usable default warranty duration'; end if;
      select exists(select 1 from public.service_item_warranties sw where sw.equipment_id=v_service.equipment_id and sw.part_id=v_part_id and sw.start_date>v_service.service_date) into v_later_warranty;
      if v_later_warranty then raise exception using errcode='23514',message='part-warranty chronology is ambiguous because a later warranty already exists'; end if;
      v_end_date:=(v_service.service_date+make_interval(months=>v_duration)-interval '1 day')::date;
      if v_coverage_type='Part Warranty' then update public.service_item_warranties set status='Replaced' where id=v_claimed_warranty_id; end if;
      insert into public.service_item_warranties(service_item_id,equipment_id,part_id,start_date,end_date,duration_months,status,replaced_warranty_id)
      values(v_new_item_id,v_service.equipment_id,v_part_id,v_service.service_date,v_end_date,v_duration,'Active',case when v_coverage_type='Part Warranty' then v_claimed_warranty_id else null end);
    end if;
  end loop;

  if p_header ? 'shared_cost_allocations' then
    perform private.apply_service_cost_allocations(p_service_id, p_header->'shared_cost_allocations');
    v_financial_change:=true;
  end if;

  if v_financial_change and nullif(btrim(p_correction_note),'') is null then raise exception using errcode='23514',message='a correction reason is required for financial or item changes'; end if;
  select coalesce(sum(amount),0) into v_paid from public.service_payments where service_id=p_service_id and payment_status='Valid';
  if v_service.financial_model_version=2 then select final_customer_charge into v_charge from public.services where id=p_service_id; else select coalesce(sum(actual_customer_price*quantity),0) into v_charge from public.service_items where service_id=p_service_id; end if;
  if v_charge is null then raise exception using errcode='23514',message='Service amendment requires a known final customer charge'; end if;
  if v_paid>v_charge then raise exception using errcode='23514',message='amended Service value cannot be below valid payments received'; end if;
  select jsonb_build_object('service',to_jsonb(s),'items',coalesce((select jsonb_agg(to_jsonb(si) order by si.created_at,si.id) from public.service_items si where si.service_id=s.id),'[]'::jsonb),'shared_cost_allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.cost_type,a.created_at,a.id) from public.service_cost_allocations a where a.service_id=s.id),'[]'::jsonb)) into v_after from public.services s where s.id=p_service_id;
  insert into public.service_corrections(service_id,correction_note,before_snapshot,after_snapshot,corrected_by) values(p_service_id,coalesce(nullif(btrim(p_correction_note),''),'Descriptive amendment'),v_before,v_after,auth.uid());
  return p_service_id;
end $$;
revoke all on function public.amend_service(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.amend_service(uuid,jsonb,jsonb,text) to authenticated;

-- This is the only authenticated allocation-aware correction entry point.
-- The established amend_service engine remains SECURITY INVOKER for the legacy UI.
create or replace function public.amend_service_with_allocations(
  p_service_id uuid,
  p_header jsonb,
  p_items jsonb,
  p_correction_note text,
  p_shared_cost_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_header jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authenticated access is required';
  end if;

  if jsonb_typeof(coalesce(p_header, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(p_shared_cost_allocations) <> 'array' then
    raise exception using errcode = '22023',
      message = 'Service amendment requires a header object, items array, and allocation array';
  end if;

  v_header := p_header || jsonb_build_object(
    'shared_cost_allocations',
    p_shared_cost_allocations
  );

  return public.amend_service(
    p_service_id,
    v_header,
    p_items,
    p_correction_note
  );
end;
$$;
revoke all on function public.amend_service_with_allocations(uuid,jsonb,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.amend_service_with_allocations(uuid,jsonb,jsonb,text,jsonb) to authenticated;