-- Atomic, idempotent service creation. The function is the sole multi-write path
-- for service items, tracked-component replacement history, and part-warranty chains.

alter table public.services
  add column submission_key uuid,
  add column submission_fingerprint text,
  add constraint services_submission_key_key unique (submission_key);

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
    v_internal_cost := coalesce(nullif(v_item ->> 'internal_cost', '')::numeric, 0);
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

revoke all on function public.create_service_with_items(uuid, uuid, date, uuid, text, jsonb, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) from public;
revoke all on function public.create_service_with_items(uuid, uuid, date, uuid, text, jsonb, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) from anon;
grant execute on function public.create_service_with_items(uuid, uuid, date, uuid, text, jsonb, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) to authenticated;
