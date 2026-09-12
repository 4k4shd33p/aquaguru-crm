-- Controlled structural correction for exactly one existing Service item.
-- A paid eligible replacement may or may not include a customer part-warranty promise;
-- p_part_warranty_requested records that business fact. All downstream effects are derived.

create or replace function public.amend_service_item_structurally(
  p_service_item_id uuid,
  p_item_type text,
  p_part_id uuid,
  p_quantity numeric,
  p_coverage_type text,
  p_equipment_warranty_id uuid,
  p_amc_cycle_id uuid,
  p_service_item_warranty_id uuid,
  p_part_warranty_requested boolean,
  p_shared_cost_allocations jsonb,
  p_correction_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_service public.services%rowtype;
  v_item public.service_items%rowtype;
  v_source_component public.equipment_components%rowtype;
  v_prior_component public.equipment_components%rowtype;
  v_source_warranty public.service_item_warranties%rowtype;
  v_parent_warranty_id uuid;
  v_parent_warranty_end_date date;
  v_claimed_warranty public.service_item_warranties%rowtype;
  v_old_attribution jsonb;
  v_new_attribution jsonb;
  v_before jsonb;
  v_after jsonb;
  v_paid numeric;
  v_charge numeric;
  v_duration integer;
  v_end_date date;
  v_component_required boolean := false;
  v_warranty_required boolean := false;
  v_had_prior_component boolean := false;
  v_new_part_role_id uuid;
  v_new_part_tracking boolean := false;
  v_new_part_warranty_eligible boolean := false;
  v_new_part_warranty_months integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authenticated access is required';
  end if;

  if nullif(btrim(p_correction_reason), '') is null then
    raise exception using errcode = '23514', message = 'a correction reason is required';
  end if;

  if p_item_type is null
     or p_coverage_type is null
     or p_item_type not in ('Replacement', 'Repair', 'Maintenance', 'Labour / Work', 'Other')
     or p_coverage_type not in ('Equipment Warranty', 'AMC', 'Part Warranty', 'Paid', 'Complimentary', 'Other')
     or p_quantity is null or p_quantity <= 0
     or p_part_warranty_requested is null then
    raise exception using errcode = '22023',
      message = 'structural correction requires a supported item type, coverage, and positive quantity';
  end if;

  select s.* into v_service
  from public.services s
  join public.service_items si on si.service_id = s.id
  where si.id = p_service_item_id
  for update of s;

  if not found then
    raise exception using errcode = 'P0002', message = 'Service item was not found';
  end if;

  select * into v_item
  from public.service_items si
  where si.id = p_service_item_id and si.service_id = v_service.id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Service item does not belong to its Service';
  end if;

  if v_service.status in ('Cancelled', 'Void') then
    raise exception using errcode = '23514', message = 'Cancelled or Void Services cannot be structurally corrected';
  end if;

  select to_jsonb(x) into v_old_attribution
  from private.resolve_service_item_economic_attribution(v_item.id) x;

  select jsonb_build_object(
    'service', to_jsonb(v_service),
    'target_service_item', to_jsonb(v_item),
    'source_component', (
      select to_jsonb(ec) from public.equipment_components ec
      where ec.source_service_item_id = v_item.id
      order by ec.created_at, ec.id limit 1
    ),
    'source_part_warranty', (
      select to_jsonb(siw) from public.service_item_warranties siw
      where siw.service_item_id = v_item.id
      order by siw.created_at, siw.id limit 1
    ),
    'shared_cost_allocations', coalesce((
      select jsonb_agg(to_jsonb(sca) order by sca.cost_type, sca.created_at, sca.id)
      from public.service_cost_allocations sca where sca.service_id = v_service.id
    ), '[]'::jsonb)
  ) into v_before;

  if v_item.part_id is not null then
  if p_part_id is not null then
    select p.component_role_id, p.equipment_tracking_enabled,
           p.part_warranty_eligible, p.default_warranty_months
      into v_new_part_role_id, v_new_part_tracking,
           v_new_part_warranty_eligible, v_new_part_warranty_months
    from public.parts p
    where p.id = p_part_id and p.is_active
    for key share;

    if not found then
      raise exception using errcode = '23503', message = 'corrected Part must be an active configured Part';
    end if;
  end if;

  if p_item_type = 'Replacement' and p_part_id is null then
    raise exception using errcode = '23514', message = 'a Replacement requires a configured Part';
  end if;

  v_component_required := p_item_type = 'Replacement'
    and coalesce(v_new_part_tracking, false);

  if v_component_required and v_new_part_role_id is null then
    raise exception using errcode = '23514', message = 'tracked replacement Part requires a component role';
  end if;

  if v_component_required and p_quantity <> 1 then
    raise exception using errcode = '23514',
      message = 'component-changing Replacement quantity must be exactly 1';
  end if;

  if p_part_warranty_requested and (p_coverage_type <> 'Paid'
      or p_item_type <> 'Replacement'
      or p_part_id is null
      or coalesce(v_new_part_warranty_eligible, false) is not true
      or p_quantity <> 1) then
    raise exception using errcode = '23514',
      message = 'a new part warranty requires an eligible one-unit Paid Replacement';
  end if;

  if p_coverage_type = 'Part Warranty' then
    if p_equipment_warranty_id is not null or p_amc_cycle_id is not null then
      raise exception using errcode = '23514',
        message = 'Part Warranty coverage cannot retain Equipment Warranty or AMC references';
    end if;

    if p_part_warranty_requested then
      raise exception using errcode = '23514',
        message = 'Part Warranty replacement renewal is derived automatically';
    end if;

    select * into v_claimed_warranty
    from public.service_item_warranties siw
    where siw.id = p_service_item_warranty_id
      and siw.equipment_id = v_service.equipment_id
      and siw.part_id = p_part_id
      and v_service.service_date between siw.start_date and siw.end_date
      and siw.status = 'Active'
    for update;

    if not found or v_service.status <> 'Completed'
       or p_item_type <> 'Replacement'
       or p_quantity <> 1
       or coalesce(v_new_part_warranty_eligible, false) is not true then
      raise exception using errcode = '23514',
        message = 'Part Warranty coverage requires an active matching eligible one-unit completed Replacement';
    end if;

    if exists (
      select 1 from public.service_item_warranties child
      where child.replaced_warranty_id = v_claimed_warranty.id
    ) then
      raise exception using errcode = '23514',
        message = 'Part Warranty coverage cannot be corrected because the claimed warranty has later history';
    end if;
  elsif p_coverage_type = 'Equipment Warranty' then
    if p_amc_cycle_id is not null or p_service_item_warranty_id is not null
       or not exists (
         select 1 from public.equipment_warranties ew
         where ew.id = p_equipment_warranty_id
           and ew.equipment_id = v_service.equipment_id
           and v_service.service_date between ew.start_date and ew.end_date
           and ew.status not in ('Cancelled', 'Void')
       ) then
      raise exception using errcode = '23514',
        message = 'Equipment Warranty coverage must reference this equipment warranty on the Service Date';
    end if;
  elsif p_coverage_type = 'AMC' then
    if p_equipment_warranty_id is not null or p_service_item_warranty_id is not null
       or not exists (
         select 1 from public.amc_cycles ac
         where ac.id = p_amc_cycle_id
           and ac.equipment_id = v_service.equipment_id
           and v_service.service_date between ac.start_date and ac.end_date
           and ac.status not in ('Cancelled', 'Void')
       ) then
      raise exception using errcode = '23514',
        message = 'AMC coverage must reference this equipment AMC cycle on the Service Date';
    end if;
  elsif p_equipment_warranty_id is not null
     or p_amc_cycle_id is not null
     or p_service_item_warranty_id is not null then
    raise exception using errcode = '23514',
      message = 'Paid, Complimentary, and Other coverage cannot retain a coverage reference';
  end if;

  v_warranty_required := p_coverage_type = 'Part Warranty' or p_part_warranty_requested;

  if v_warranty_required and (v_service.status <> 'Completed'
      or coalesce(v_new_part_warranty_months, 0) <= 0) then
    raise exception using errcode = '23514',
      message = 'part warranty creation requires a completed Service and a positive configured warranty duration';
  end if;

  perform set_config('app.service_correction_in_progress', 'on', true);

  -- Reverse only the source component caused by this Service item.
  select * into v_source_component
  from public.equipment_components ec
  where ec.source_service_item_id = v_item.id
  order by ec.created_at, ec.id
  limit 1
  for update;

  if found then
    perform pg_advisory_xact_lock(
      hashtextextended(v_service.equipment_id::text || ':' || v_source_component.component_role_id::text, 0)
    );

    if v_source_component.removed_date is not null
       or exists (
         select 1 from public.equipment_components ec
         where ec.equipment_id = v_service.equipment_id
           and ec.component_role_id = v_source_component.component_role_id
           and ec.id <> v_source_component.id
           and ec.installed_date >= v_service.service_date
       ) then
      raise exception using errcode = '23514',
        message = 'This work item cannot be structurally changed because the recorded replacement has later component history';
    end if;

    select * into v_prior_component
    from public.equipment_components ec
    where ec.equipment_id = v_service.equipment_id
      and ec.component_role_id = v_source_component.component_role_id
      and ec.id <> v_source_component.id
      and ec.installed_date < v_service.service_date
      and ec.removed_date = v_service.service_date
    order by ec.installed_date desc, ec.created_at desc, ec.id desc
    limit 1
    for update;
    v_had_prior_component := found;

    delete from public.equipment_components where id = v_source_component.id;

    if v_had_prior_component then
      update public.equipment_components
      set removed_date = null
      where id = v_prior_component.id;
    end if;
  end if;

  -- Reverse only the part warranty created by this Service item.
  select * into v_source_warranty
  from public.service_item_warranties siw
  where siw.service_item_id = v_item.id
  order by siw.created_at, siw.id
  limit 1
  for update;

  if found then
    if exists (
      select 1 from public.service_item_warranties child
      where child.replaced_warranty_id = v_source_warranty.id
    ) or exists (
      select 1 from public.service_items si
      where si.service_item_warranty_id = v_source_warranty.id
        and si.id <> v_item.id
    ) then
      raise exception using errcode = '23514',
        message = 'This work item cannot be structurally changed because the recorded replacement has later warranty history';
    end if;

    if v_source_warranty.replaced_warranty_id is not null then
      select siw.id, siw.end_date into v_parent_warranty_id, v_parent_warranty_end_date
      from public.service_item_warranties siw
      where siw.id = v_source_warranty.replaced_warranty_id
      for update;
    end if;

    delete from public.service_item_warranties where id = v_source_warranty.id;

    if v_parent_warranty_id is not null then
      update public.service_item_warranties
      set status = case when v_parent_warranty_end_date < current_date then 'Expired' else 'Active' end
      where id = v_parent_warranty_id;
    end if;
  end if;

  if v_component_required then
    perform pg_advisory_xact_lock(
      hashtextextended(v_service.equipment_id::text || ':' || v_new_part_role_id::text, 0)
    );

    if exists (
      select 1 from public.equipment_components ec
      where ec.equipment_id = v_service.equipment_id
        and ec.component_role_id = v_new_part_role_id
        and ec.installed_date >= v_service.service_date
    ) then
      raise exception using errcode = '23514',
        message = 'component chronology is ambiguous because a replacement already exists on or after the Service Date';
    end if;
  end if;

  update public.service_items
  set item_type = p_item_type,
      part_id = p_part_id,
      quantity = p_quantity,
      coverage_type = p_coverage_type,
      equipment_warranty_id = case when p_coverage_type = 'Equipment Warranty' then p_equipment_warranty_id else null end,
      amc_cycle_id = case when p_coverage_type = 'AMC' then p_amc_cycle_id else null end,
      service_item_warranty_id = case when p_coverage_type = 'Part Warranty' then p_service_item_warranty_id else null end,
      updates_equipment_component = v_component_required
  where id = v_item.id;

  if v_component_required then
    select * into v_prior_component
    from public.equipment_components ec
    where ec.equipment_id = v_service.equipment_id
      and ec.component_role_id = v_new_part_role_id
      and ec.installed_date < v_service.service_date
      and ec.removed_date is null
    order by ec.installed_date desc, ec.created_at desc, ec.id desc
    limit 1
    for update;

    if found then
      update public.equipment_components
      set removed_date = v_service.service_date
      where id = v_prior_component.id;
    end if;

    insert into public.equipment_components(
      equipment_id, part_id, component_role_id, installed_date, source_service_item_id
    ) values (
      v_service.equipment_id, p_part_id, v_new_part_role_id, v_service.service_date, v_item.id
    );
  end if;

  if v_warranty_required then
    v_duration := v_new_part_warranty_months;
    v_end_date := (v_service.service_date + make_interval(months => v_duration) - interval '1 day')::date;

    if p_coverage_type = 'Part Warranty' then
      update public.service_item_warranties
      set status = 'Replaced'
      where id = v_claimed_warranty.id;
    end if;

    insert into public.service_item_warranties(
      service_item_id, equipment_id, part_id, start_date, end_date,
      duration_months, status, replaced_warranty_id
    ) values (
      v_item.id, v_service.equipment_id, p_part_id, v_service.service_date, v_end_date,
      v_duration, case when v_end_date < current_date then 'Expired' else 'Active' end,
      case when p_coverage_type = 'Part Warranty' then v_claimed_warranty.id else null end
    );
  end if;

  select to_jsonb(x) into v_new_attribution
  from private.resolve_service_item_economic_attribution(v_item.id) x;

  if p_shared_cost_allocations is not null then
    perform private.apply_service_cost_allocations(v_service.id, p_shared_cost_allocations);
  elsif exists (
    select 1 from public.service_cost_allocations sca
    where sca.service_id = v_service.id and sca.source_service_item_id = v_item.id
  ) and v_old_attribution is distinct from v_new_attribution then
    raise exception using errcode = '23514',
      message = 'replacement shared-cost allocations are required because this correction changes their economic target';
  end if;

  select coalesce(sum(sp.amount), 0) into v_paid
  from public.service_payments sp
  where sp.service_id = v_service.id and sp.payment_status = 'Valid';

  if v_service.financial_model_version = 2 then
    v_charge := v_service.final_customer_charge;
  else
    select coalesce(sum(si.actual_customer_price * si.quantity), 0) into v_charge
    from public.service_items si where si.service_id = v_service.id;
  end if;

  if v_charge is null or v_paid > v_charge then
    raise exception using errcode = '23514',
      message = 'structural correction would make valid payments exceed the authoritative Service charge';
  end if;

  select jsonb_build_object(
    'service', to_jsonb(s),
    'target_service_item', to_jsonb(si),
    'source_component', (
      select to_jsonb(ec) from public.equipment_components ec
      where ec.source_service_item_id = si.id
      order by ec.created_at, ec.id limit 1
    ),
    'source_part_warranty', (
      select to_jsonb(siw) from public.service_item_warranties siw
      where siw.service_item_id = si.id
      order by siw.created_at, siw.id limit 1
    ),
    'shared_cost_allocations', coalesce((
      select jsonb_agg(to_jsonb(sca) order by sca.cost_type, sca.created_at, sca.id)
      from public.service_cost_allocations sca where sca.service_id = s.id
    ), '[]'::jsonb)
  ) into v_after
  from public.services s
  join public.service_items si on si.id = v_item.id
  where s.id = v_service.id;

  insert into public.service_corrections(
    service_id, correction_note, before_snapshot, after_snapshot, corrected_by
  ) values (
    v_service.id, p_correction_reason, v_before, v_after, auth.uid()
  );

  return v_item.id;
end;
$function$;

alter function public.amend_service_item_structurally(
  uuid, text, uuid, numeric, text, uuid, uuid, uuid, boolean, jsonb, text
) owner to postgres;

revoke all on function public.amend_service_item_structurally(
  uuid, text, uuid, numeric, text, uuid, uuid, uuid, boolean, jsonb, text
) from public;
revoke all on function public.amend_service_item_structurally(
  uuid, text, uuid, numeric, text, uuid, uuid, uuid, boolean, jsonb, text
) from anon;
grant execute on function public.amend_service_item_structurally(
  uuid, text, uuid, numeric, text, uuid, uuid, uuid, boolean, jsonb, text
) to authenticated;
