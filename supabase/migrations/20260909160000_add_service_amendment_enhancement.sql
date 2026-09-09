-- Service amendment enhancement: auditable descriptive corrections and safe item additions.
create or replace function private.protect_service_correction_fields()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if current_setting('app.service_correction_in_progress',true) is distinct from 'on'
     and (new.service_date is distinct from old.service_date or new.technician_id is distinct from old.technician_id
       or new.issue_reported is distinct from old.issue_reported or new.diagnosis is distinct from old.diagnosis
       or new.work_performed is distinct from old.work_performed or new.tds_in is distinct from old.tds_in
       or new.tds_out is distinct from old.tds_out or new.next_service_due is distinct from old.next_service_due
       or new.notes is distinct from old.notes or new.final_customer_charge is distinct from old.final_customer_charge
       or new.technician_charge is distinct from old.technician_charge or new.travel_cost is distinct from old.travel_cost
       or new.other_direct_cost is distinct from old.other_direct_cost or new.other_direct_cost_note is distinct from old.other_direct_cost_note
       or new.customer_charge_note is distinct from old.customer_charge_note or new.equipment_id is distinct from old.equipment_id
       or new.service_code is distinct from old.service_code or new.service_type_id is distinct from old.service_type_id
       or new.status is distinct from old.status or new.relocation_destination_location_id is distinct from old.relocation_destination_location_id) then
    raise exception using errcode='42501', message='Service corrections must use amend_service';
  end if;
  return new;
end $$;

create or replace function private.protect_service_item_correction_fields()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if current_setting('app.service_correction_in_progress',true) is distinct from 'on'
     and (new.part_id is distinct from old.part_id or new.item_type is distinct from old.item_type
       or new.description is distinct from old.description or new.quantity is distinct from old.quantity
       or new.standard_price is distinct from old.standard_price or new.actual_customer_price is distinct from old.actual_customer_price
       or new.internal_cost is distinct from old.internal_cost or new.coverage_type is distinct from old.coverage_type
       or new.equipment_warranty_id is distinct from old.equipment_warranty_id or new.amc_cycle_id is distinct from old.amc_cycle_id
       or new.service_item_warranty_id is distinct from old.service_item_warranty_id
       or new.updates_equipment_component is distinct from old.updates_equipment_component or new.notes is distinct from old.notes) then
    raise exception using errcode='42501', message='Service item corrections must use amend_service';
  end if;
  return new;
end $$;

create or replace function private.protect_service_item_correction_delete()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if current_setting('app.service_correction_in_progress',true) is distinct from 'on' then
    raise exception using errcode='42501', message='Service item removal must use amend_service';
  end if;
  return old;
end $$;

drop trigger if exists protect_service_item_correction_delete on public.service_items;
create trigger protect_service_item_correction_delete
before delete on public.service_items for each row execute function private.protect_service_item_correction_delete();

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

  select jsonb_build_object('service',to_jsonb(v_service),'items',
    coalesce((select jsonb_agg(to_jsonb(si) order by si.created_at,si.id) from public.service_items si where si.service_id=p_service_id),'[]'::jsonb))
    into v_before;

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
        v_internal_cost:=case when v_item ? 'internal_cost' then coalesce(nullif(v_item->>'internal_cost','')::numeric,0) else v_existing.internal_cost end;
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
    v_actual_customer_price:=coalesce(nullif(v_item->>'actual_customer_price','')::numeric,0); v_internal_cost:=coalesce(nullif(v_item->>'internal_cost','')::numeric,0);
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

  if v_financial_change and nullif(btrim(p_correction_note),'') is null then raise exception using errcode='23514',message='a correction reason is required for financial or item changes'; end if;
  select coalesce(sum(amount),0) into v_paid from public.service_payments where service_id=p_service_id and payment_status='Valid';
  if v_service.financial_model_version=2 then select final_customer_charge into v_charge from public.services where id=p_service_id; else select coalesce(sum(actual_customer_price*quantity),0) into v_charge from public.service_items where service_id=p_service_id; end if;
  if v_charge is null then raise exception using errcode='23514',message='Service amendment requires a known final customer charge'; end if;
  if v_paid>v_charge then raise exception using errcode='23514',message='amended Service value cannot be below valid payments received'; end if;
  select jsonb_build_object('service',to_jsonb(s),'items',coalesce((select jsonb_agg(to_jsonb(si) order by si.created_at,si.id) from public.service_items si where si.service_id=s.id),'[]'::jsonb)) into v_after from public.services s where s.id=p_service_id;
  insert into public.service_corrections(service_id,correction_note,before_snapshot,after_snapshot,corrected_by) values(p_service_id,coalesce(nullif(btrim(p_correction_note),''),'Descriptive amendment'),v_before,v_after,auth.uid());
  return p_service_id;
end $$;

revoke all on function public.amend_service(uuid,jsonb,jsonb,text) from public;
revoke all on function public.amend_service(uuid,jsonb,jsonb,text) from anon;
grant execute on function public.amend_service(uuid,jsonb,jsonb,text) to authenticated;
