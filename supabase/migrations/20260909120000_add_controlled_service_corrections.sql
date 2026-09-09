-- Controlled Service correction: auditable financial/header changes without rewriting physical history.
create table if not exists public.service_corrections (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  correction_note text not null check (nullif(btrim(correction_note),'') is not null),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  corrected_at timestamptz not null default now(),
  corrected_by uuid
);
create index if not exists service_corrections_service_id_corrected_at_idx on public.service_corrections(service_id, corrected_at desc);

create or replace function private.protect_service_correction_fields()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if current_setting('app.service_correction_in_progress',true) is distinct from 'on'
     and (new.service_date is distinct from old.service_date or new.technician_id is distinct from old.technician_id
       or new.next_service_due is distinct from old.next_service_due or new.notes is distinct from old.notes
       or new.final_customer_charge is distinct from old.final_customer_charge or new.technician_charge is distinct from old.technician_charge
       or new.travel_cost is distinct from old.travel_cost or new.other_direct_cost is distinct from old.other_direct_cost
       or new.other_direct_cost_note is distinct from old.other_direct_cost_note or new.customer_charge_note is distinct from old.customer_charge_note
       or new.equipment_id is distinct from old.equipment_id or new.service_code is distinct from old.service_code
       or new.service_type_id is distinct from old.service_type_id or new.status is distinct from old.status
       or new.relocation_destination_location_id is distinct from old.relocation_destination_location_id) then
    raise exception using errcode='42501', message='sensitive Service changes must use correct_service';
  end if;
  return new;
end $$;
drop trigger if exists protect_service_correction_fields on public.services;
create trigger protect_service_correction_fields before update on public.services for each row execute function private.protect_service_correction_fields();

create or replace function private.protect_service_item_correction_fields()
returns trigger language plpgsql set search_path to 'pg_catalog','public' as $$
begin
  if current_setting('app.service_correction_in_progress',true) is distinct from 'on'
     and (new.standard_price is distinct from old.standard_price or new.actual_customer_price is distinct from old.actual_customer_price
       or new.internal_cost is distinct from old.internal_cost or new.coverage_type is distinct from old.coverage_type
       or new.part_id is distinct from old.part_id or new.quantity is distinct from old.quantity
       or new.updates_equipment_component is distinct from old.updates_equipment_component
       or new.equipment_warranty_id is distinct from old.equipment_warranty_id or new.amc_cycle_id is distinct from old.amc_cycle_id
       or new.service_item_warranty_id is distinct from old.service_item_warranty_id) then
    raise exception using errcode='42501', message='sensitive Service item changes must use correct_service';
  end if;
  return new;
end $$;
drop trigger if exists protect_service_item_correction_fields on public.service_items;
create trigger protect_service_item_correction_fields before update on public.service_items for each row execute function private.protect_service_item_correction_fields();

create or replace function public.correct_service(
  p_service_id uuid, p_service_date date, p_technician_id uuid, p_next_service_due date, p_notes text,
  p_final_customer_charge numeric, p_technician_charge numeric, p_travel_cost numeric, p_other_direct_cost numeric,
  p_other_direct_cost_note text, p_customer_charge_note text, p_items jsonb, p_correction_note text)
returns uuid language plpgsql security invoker set search_path to 'pg_catalog','public' as $$
declare
  v_service public.services%rowtype; v_before jsonb; v_after jsonb; v_paid numeric; v_charge numeric;
  v_sensitive boolean:=false; v_has_relocation boolean; v_item_count integer; v_input_count integer;
begin
  select * into v_service from public.services where id=p_service_id for update;
  if not found then raise exception using errcode='P0002',message='Service was not found'; end if;
  if p_service_date is null then raise exception using errcode='23514',message='Service Date is required'; end if;
  select exists(select 1 from public.equipment_location_history where source_service_id=p_service_id)
    or v_service.relocation_destination_location_id is not null into v_has_relocation;
  if v_has_relocation and p_service_date is distinct from v_service.service_date then
    raise exception using errcode='23514',message='Service Date is locked for a relocation Service because Location History must remain unchanged';
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x where not (x ? 'id')) then
    raise exception using errcode='22023',message='each corrected Service item must identify its existing item';
  end if;
  select count(*) into v_input_count from jsonb_array_elements(coalesce(p_items,'[]'::jsonb));
  select count(*) into v_item_count from public.service_items where service_id=p_service_id;
  if v_input_count <> v_item_count or exists(
    select 1 from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as i(id uuid)
    left join public.service_items si on si.id=i.id and si.service_id=p_service_id where si.id is null
  ) then raise exception using errcode='23514',message='Service item identity is locked; correct only the existing items for this Service'; end if;
  if exists(select 1 from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as i(id uuid,standard_price numeric,actual_customer_price numeric,internal_cost numeric)
    join public.service_items si on si.id=i.id
    where i.standard_price is distinct from si.standard_price or i.actual_customer_price is distinct from si.actual_customer_price or i.internal_cost is distinct from si.internal_cost) then v_sensitive:=true; end if;
  if v_service.financial_model_version=2 and (
       p_final_customer_charge is distinct from v_service.final_customer_charge or p_technician_charge is distinct from v_service.technician_charge
       or p_travel_cost is distinct from v_service.travel_cost or p_other_direct_cost is distinct from v_service.other_direct_cost
       or p_other_direct_cost_note is distinct from v_service.other_direct_cost_note or p_customer_charge_note is distinct from v_service.customer_charge_note) then v_sensitive:=true; end if;
  if v_sensitive and nullif(btrim(p_correction_note),'') is null then raise exception using errcode='23514',message='a correction reason is required for financial changes'; end if;
  select jsonb_build_object('service',to_jsonb(v_service),'items',coalesce(jsonb_agg(to_jsonb(si) order by si.id),'[]'::jsonb))
    into v_before from public.service_items si where si.service_id=p_service_id;
  perform set_config('app.service_correction_in_progress','on',true);
  update public.services set service_date=p_service_date,technician_id=p_technician_id,next_service_due=p_next_service_due,notes=nullif(btrim(p_notes),''),
    final_customer_charge=case when financial_model_version=2 then p_final_customer_charge else final_customer_charge end,
    technician_charge=case when financial_model_version=2 then p_technician_charge else technician_charge end,
    travel_cost=case when financial_model_version=2 then p_travel_cost else travel_cost end,
    other_direct_cost=case when financial_model_version=2 then p_other_direct_cost else other_direct_cost end,
    other_direct_cost_note=case when financial_model_version=2 then nullif(btrim(p_other_direct_cost_note),'') else other_direct_cost_note end,
    customer_charge_note=case when financial_model_version=2 then nullif(btrim(p_customer_charge_note),'') else customer_charge_note end
    where id=p_service_id;
  update public.service_items si set standard_price=i.standard_price,actual_customer_price=i.actual_customer_price,internal_cost=i.internal_cost
    from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as i(id uuid,standard_price numeric,actual_customer_price numeric,internal_cost numeric)
    where si.id=i.id and si.service_id=p_service_id;
  select coalesce(sum(amount),0) into v_paid from public.service_payments where service_id=p_service_id and payment_status='Valid';
  if v_service.financial_model_version=2 then
    select final_customer_charge into v_charge from public.services where id=p_service_id;
  else
    select coalesce(sum(actual_customer_price*quantity),0) into v_charge from public.service_items where service_id=p_service_id;
  end if;
  if v_charge is null then raise exception using errcode='23514',message='Service correction requires a known final customer charge'; end if;
  if v_paid>v_charge then raise exception using errcode='23514',message='corrected Service value cannot be below valid payments received'; end if;
  select jsonb_build_object('service',to_jsonb(s),'items',coalesce((select jsonb_agg(to_jsonb(si) order by si.id) from public.service_items si where si.service_id=s.id),'[]'::jsonb))
    into v_after from public.services s where s.id=p_service_id;
  insert into public.service_corrections(service_id,correction_note,before_snapshot,after_snapshot,corrected_by)
    values(p_service_id,coalesce(nullif(btrim(p_correction_note),''),'Header correction'),v_before,v_after,auth.uid());
  return p_service_id;
end $$;

revoke all on function public.correct_service(uuid,date,uuid,date,text,numeric,numeric,numeric,numeric,text,text,jsonb,text) from public;
revoke all on function public.correct_service(uuid,date,uuid,date,text,numeric,numeric,numeric,numeric,text,text,jsonb,text) from anon;
grant execute on function public.correct_service(uuid,date,uuid,date,text,numeric,numeric,numeric,numeric,text,text,jsonb,text) to authenticated;
