-- Allows the V2 creation workflow's internal financial-field update without weakening external amendment protections.
-- The transaction-local setting is consumed only by the existing correction guard.

CREATE OR REPLACE FUNCTION public.create_service_with_items_v2(p_submission_key uuid, p_equipment_id uuid, p_service_date date, p_service_type_id uuid, p_status text, p_items jsonb, p_final_customer_charge numeric DEFAULT NULL::numeric, p_travel_cost numeric DEFAULT 0, p_other_direct_cost numeric DEFAULT 0, p_other_direct_cost_note text DEFAULT NULL::text, p_customer_charge_note text DEFAULT NULL::text, p_technician_id uuid DEFAULT NULL::uuid, p_issue_reported text DEFAULT NULL::text, p_diagnosis text DEFAULT NULL::text, p_work_performed text DEFAULT NULL::text, p_tds_in numeric DEFAULT NULL::numeric, p_tds_out numeric DEFAULT NULL::numeric, p_next_service_due date DEFAULT NULL::date, p_technician_charge numeric DEFAULT 0, p_equipment_warranty_id uuid DEFAULT NULL::uuid, p_amc_cycle_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(service_id uuid, service_code text, created boolean, service_item_id uuid, equipment_component_id uuid, new_part_warranty_id uuid)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_fp text; v_existing public.services%rowtype; v_chargeable numeric; v_items jsonb; v_row record;
begin
  perform set_config('app.service_correction_in_progress', 'on', true);

  if p_submission_key is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode='22023', message='submission_key and an items JSON array are required';
  end if;
  if p_final_customer_charge is not null and p_final_customer_charge < 0
     or coalesce(p_travel_cost,0)<0 or coalesce(p_other_direct_cost,0)<0 or coalesce(p_technician_charge,0)<0 then
    raise exception using errcode='22023', message='service financial amounts cannot be negative';
  end if;
  select coalesce(sum(case when value->>'coverage_type'='Paid'
    then (value->>'standard_price')::numeric * coalesce(nullif(value->>'quantity','')::numeric,1) else 0 end),0)
    into v_chargeable from jsonb_array_elements(p_items);
  if exists (select 1 from jsonb_array_elements(p_items) where nullif(value->>'standard_price','') is null) then
    raise exception using errcode='22023', message='V2 service items require standard_price';
  end if;
  if p_status='Completed' and p_final_customer_charge is null then
    raise exception using errcode='23514', message='completed V2 service requires final_customer_charge';
  end if;
  if coalesce(p_other_direct_cost,0)>0 and nullif(btrim(p_other_direct_cost_note),'') is null then
    raise exception using errcode='23514', message='other_direct_cost_note is required when other_direct_cost is positive';
  end if;
  if p_final_customer_charge > v_chargeable and nullif(btrim(p_customer_charge_note),'') is null then
    raise exception using errcode='23514', message='customer_charge_note is required when final_customer_charge exceeds chargeable subtotal';
  end if;
  v_fp:=md5(jsonb_build_object('equipment_id',p_equipment_id,'service_date',p_service_date,'service_type_id',p_service_type_id,'status',p_status,'items',p_items,'final_customer_charge',p_final_customer_charge,'travel_cost',coalesce(p_travel_cost,0),'other_direct_cost',coalesce(p_other_direct_cost,0),'other_direct_cost_note',nullif(btrim(p_other_direct_cost_note),''),'customer_charge_note',nullif(btrim(p_customer_charge_note),''),'technician_id',p_technician_id,'technician_charge',coalesce(p_technician_charge,0),'equipment_warranty_id',p_equipment_warranty_id,'amc_cycle_id',p_amc_cycle_id,'notes',nullif(btrim(p_notes),''))::text);
  select * into v_existing from public.services where submission_key=p_submission_key for update;
  if found and v_existing.financial_model_version=2 then
    if v_existing.financial_submission_fingerprint is distinct from v_fp then raise exception using errcode='23505', message='submission_key already belongs to a different V2 service request'; end if;
    return query select s.id,s.service_code,false,si.id,ec.id,sw.id from public.services s left join public.service_items si on si.service_id=s.id left join public.equipment_components ec on ec.source_service_item_id=si.id left join public.service_item_warranties sw on sw.service_item_id=si.id where s.id=v_existing.id order by si.created_at,si.id; return;
  elsif found then
    raise exception using errcode='23505', message='submission_key already belongs to a legacy service request';
  end if;
  select coalesce(jsonb_agg(value || jsonb_build_object('actual_customer_price',0)),'[]'::jsonb) into v_items from jsonb_array_elements(p_items);
  select * into v_row from public.create_service_with_items(p_submission_key,p_equipment_id,p_service_date,p_service_type_id,p_status,v_items,p_technician_id,p_issue_reported,p_diagnosis,p_work_performed,p_tds_in,p_tds_out,p_next_service_due,coalesce(p_technician_charge,0),p_equipment_warranty_id,p_amc_cycle_id,p_notes) limit 1;
  select * into v_existing from public.services where id=v_row.service_id for update;
  if v_existing.financial_model_version=2 then
    if v_existing.financial_submission_fingerprint is distinct from v_fp then raise exception using errcode='23505', message='submission_key already belongs to a different V2 service request'; end if;
  else
    update public.services set financial_model_version=2,final_customer_charge=p_final_customer_charge,travel_cost=coalesce(p_travel_cost,0),other_direct_cost=coalesce(p_other_direct_cost,0),other_direct_cost_note=nullif(btrim(p_other_direct_cost_note),''),customer_charge_note=nullif(btrim(p_customer_charge_note),''),financial_submission_fingerprint=v_fp where id=v_row.service_id;
  end if;
  return query select s.id,s.service_code,true,si.id,ec.id,sw.id from public.services s left join public.service_items si on si.service_id=s.id left join public.equipment_components ec on ec.source_service_item_id=si.id left join public.service_item_warranties sw on sw.service_item_id=si.id where s.id=v_row.service_id order by si.created_at,si.id;
end $function$;

revoke all on function public.create_service_with_items_v2(uuid, uuid, date, uuid, text, jsonb, numeric, numeric, numeric, text, text, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) from public;
revoke all on function public.create_service_with_items_v2(uuid, uuid, date, uuid, text, jsonb, numeric, numeric, numeric, text, text, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) from anon;
grant execute on function public.create_service_with_items_v2(uuid, uuid, date, uuid, text, jsonb, numeric, numeric, numeric, text, text, uuid, text, text, text, numeric, numeric, date, numeric, uuid, uuid, text) to authenticated;
