-- Phase 1A: versioned Service financial model. V1 history remains item-priced.
alter table public.services
  add column financial_model_version smallint,
  add column final_customer_charge numeric(14,2),
  add column travel_cost numeric(14,2),
  add column other_direct_cost numeric(14,2),
  add column other_direct_cost_note text,
  add column customer_charge_note text,
  add column financial_submission_fingerprint text;

update public.services set financial_model_version = 1 where financial_model_version is null;

alter table public.services
  alter column financial_model_version set not null,
  alter column financial_model_version set default 1,
  add constraint services_financial_model_version_check check (financial_model_version in (1,2)),
  add constraint services_final_customer_charge_check check (final_customer_charge is null or final_customer_charge >= 0),
  add constraint services_travel_cost_check check (travel_cost is null or travel_cost >= 0),
  add constraint services_other_direct_cost_check check (other_direct_cost is null or other_direct_cost >= 0);

create or replace function private.validate_service_financial_header()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.financial_model_version = 2 then
    if new.status = 'Completed' and new.final_customer_charge is null then
      raise exception using errcode='23514', message='completed V2 service requires final_customer_charge';
    end if;
    if coalesce(new.other_direct_cost,0) > 0
       and nullif(btrim(new.other_direct_cost_note),'') is null then
      raise exception using errcode='23514', message='other_direct_cost_note is required when other_direct_cost is positive';
    end if;
  end if;
  return new;
end $$;

create or replace function private.validate_service_item_financial_model()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare v_version smallint;
begin
  select financial_model_version into v_version from public.services where id=new.service_id;
  if v_version = 2 then
    if new.actual_customer_price <> 0 then
      raise exception using errcode='23514', message='V2 service items must use zero actual_customer_price; service revenue is stored on the Service';
    end if;
    if new.standard_price is null then
      raise exception using errcode='23514', message='V2 service items require standard_price';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists validate_service_financial_header on public.services;
create trigger validate_service_financial_header before insert or update on public.services
for each row execute function private.validate_service_financial_header();

drop trigger if exists validate_service_item_financial_model on public.service_items;
create trigger validate_service_item_financial_model before insert or update on public.service_items
for each row execute function private.validate_service_item_financial_model();

create or replace function private.service_financial_rows()
returns table (service_id uuid, revenue numeric, direct_cost numeric, direct_cost_available boolean)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select s.id,
    case when s.financial_model_version=2 then s.final_customer_charge
         else coalesce(sum(si.actual_customer_price * si.quantity),0) end,
    case when (
      coalesce(bool_and(si.internal_cost is not null),true)
      and s.technician_charge is not null
      and (s.financial_model_version=1 or (s.travel_cost is not null and s.other_direct_cost is not null))
    ) then coalesce(sum(si.internal_cost * si.quantity),0)
       + coalesce(s.technician_charge,0) + coalesce(s.travel_cost,0) + coalesce(s.other_direct_cost,0)
    else null end,
    coalesce(bool_and(si.internal_cost is not null),true)
      and s.technician_charge is not null
      and (s.financial_model_version=1 or (s.travel_cost is not null and s.other_direct_cost is not null))
  from public.services s left join public.service_items si on si.service_id=s.id
  group by s.id;
$$;

create or replace function private.validate_service_payment_financials()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare v_service public.services%rowtype; v_charge numeric; v_paid numeric;
begin
  select * into v_service from public.services where id=new.service_id for update;
  if not found then
    raise exception using errcode='23503', message='service payment must reference an existing service';
  end if;
  if v_service.status in ('Cancelled','Void') then
    raise exception using errcode='23514', message='payments are not allowed for Cancelled or Void services';
  end if;
  if v_service.financial_model_version=2 then
    v_charge:=v_service.final_customer_charge;
  else
    select coalesce(sum(actual_customer_price*quantity),0) into v_charge from public.service_items where service_id=v_service.id;
  end if;
  if v_charge is null then
    raise exception using errcode='23514', message='service payment requires a known final customer charge';
  end if;
  select coalesce(sum(amount),0) into v_paid from public.service_payments
    where service_id=new.service_id and (tg_op='INSERT' or id<>old.id);
  if v_paid + new.amount > v_charge then
    raise exception using errcode='23514', message='service payment exceeds the authoritative service charge';
  end if;
  return new;
end $$;

drop trigger if exists validate_service_payment_financials on public.service_payments;
create trigger validate_service_payment_financials before insert or update on public.service_payments
for each row execute function private.validate_service_payment_financials();

create or replace function public.create_service_with_items_v2(
  p_submission_key uuid, p_equipment_id uuid, p_service_date date, p_service_type_id uuid, p_status text,
  p_items jsonb, p_final_customer_charge numeric default null, p_travel_cost numeric default 0,
  p_other_direct_cost numeric default 0, p_other_direct_cost_note text default null,
  p_customer_charge_note text default null, p_technician_id uuid default null,
  p_issue_reported text default null, p_diagnosis text default null, p_work_performed text default null,
  p_tds_in numeric default null, p_tds_out numeric default null, p_next_service_due date default null,
  p_technician_charge numeric default 0, p_equipment_warranty_id uuid default null,
  p_amc_cycle_id uuid default null, p_notes text default null
) returns table(service_id uuid, service_code text, created boolean, service_item_id uuid,
  equipment_component_id uuid, new_part_warranty_id uuid)
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare v_fp text; v_existing public.services%rowtype; v_chargeable numeric; v_items jsonb; v_row record;
begin
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
end $$;

revoke all on function public.create_service_with_items_v2(uuid,uuid,date,uuid,text,jsonb,numeric,numeric,numeric,text,text,uuid,text,text,text,numeric,numeric,date,numeric,uuid,uuid,text) from public;
revoke all on function public.create_service_with_items_v2(uuid,uuid,date,uuid,text,jsonb,numeric,numeric,numeric,text,text,uuid,text,text,text,numeric,numeric,date,numeric,uuid,uuid,text) from anon;
grant execute on function public.create_service_with_items_v2(uuid,uuid,date,uuid,text,jsonb,numeric,numeric,numeric,text,text,uuid,text,text,text,numeric,numeric,date,numeric,uuid,uuid,text) to authenticated;

create or replace function public.get_finance_summary(p_date_from date,p_date_to date)
returns table(sales_value numeric,sales_direct_collections numeric,sales_emi_collections numeric,sales_collections numeric,sales_known_direct_cost numeric,sales_direct_cost_available boolean,sales_contribution numeric,sales_contribution_available boolean,service_value numeric,service_collections numeric,service_known_direct_cost numeric,service_direct_cost_available boolean,service_contribution numeric,service_contribution_available boolean,amc_value numeric,amc_value_available boolean,amc_collections numeric,total_transaction_value numeric,total_transaction_value_available boolean,total_collections numeric,sales_outstanding_as_of numeric,service_outstanding_as_of numeric,amc_outstanding_as_of numeric,total_outstanding_as_of numeric,total_outstanding_available boolean)
language sql stable security invoker set search_path=public,pg_temp as $$
with vs as(select id,sale_date from sales where status in('Confirmed','Completed')),
sm as(select coalesce(sum(si.actual_unit_price*si.quantity),0)v,coalesce(bool_and(si.unit_cost is not null),true)ok,coalesce(sum(si.unit_cost*si.quantity),0)c from vs join sale_items si on si.sale_id=vs.id where sale_date between p_date_from and p_date_to),
sc as(select coalesce(sum(amount),0)v from sale_payments sp join vs on vs.id=sp.sale_id where payment_date between p_date_from and p_date_to),
ec as(select coalesce(sum(ep.amount),0)v from emi_payments ep join emi_accounts ea on ea.id=ep.emi_account_id and ea.status in('Active','Completed','Defaulted') join vs on vs.id=ea.sale_id where ep.payment_date between p_date_from and p_date_to),
sf as(select s.id,s.service_date,f.revenue,f.direct_cost,f.direct_cost_available from services s join private.service_financial_rows() f on f.service_id=s.id where s.status='Completed'),
sx as(select coalesce(sum(revenue),0)v,coalesce(bool_and(direct_cost_available),true)ok,coalesce(sum(direct_cost),0)c from sf where service_date between p_date_from and p_date_to),
sp as(select coalesce(sum(amount),0)v from service_payments p join sf on sf.id=p.service_id where payment_date between p_date_from and p_date_to),
va as(select id,start_date,agreed_price from amc_cycles where status in('Active','Expired')),
am as(select coalesce(bool_and(agreed_price is not null),true)ok,coalesce(sum(agreed_price),0)v from va where start_date between p_date_from and p_date_to),
ap as(select coalesce(sum(amount),0)v from amc_payments p join va on va.id=p.amc_cycle_id where payment_date between p_date_from and p_date_to),
sa as(select coalesce(sum(si.actual_unit_price*si.quantity),0)-coalesce((select sum(amount) from sale_payments p join vs on vs.id=p.sale_id where payment_date<=p_date_to),0)-coalesce((select sum(ep.amount) from emi_payments ep join emi_accounts ea on ea.id=ep.emi_account_id join vs on vs.id=ea.sale_id where payment_date<=p_date_to),0) v from vs join sale_items si on si.sale_id=vs.id where sale_date<=p_date_to),
sfa as(select coalesce(sum(revenue),0)-coalesce((select sum(p.amount) from service_payments p join sf on sf.id=p.service_id where p.payment_date<=p_date_to),0)v from sf where service_date<=p_date_to),
aa as(select coalesce(sum(agreed_price),0)-coalesce((select sum(p.amount) from amc_payments p join va on va.id=p.amc_cycle_id where p.payment_date<=p_date_to),0)v from va where start_date<=p_date_to)
select sm.v,sc.v,ec.v,sc.v+ec.v,case when sm.ok then sm.c end,sm.ok,case when sm.ok then sm.v-sm.c end,sm.ok,sx.v,sp.v,case when sx.ok then sx.c end,sx.ok,case when sx.ok then sx.v-sx.c end,sx.ok,case when am.ok then am.v end,am.ok,ap.v,case when am.ok then sm.v+sx.v+am.v end,am.ok,sc.v+ec.v+sp.v+ap.v,sa.v,sfa.v,aa.v,sa.v+sfa.v+aa.v,true from sm cross join sc cross join ec cross join sx cross join sp cross join am cross join ap cross join sa cross join sfa cross join aa;
$$;

create index services_completed_service_date_idx on public.services(service_date) where status='Completed';
create index service_payments_payment_date_service_id_idx on public.service_payments(payment_date,service_id);
