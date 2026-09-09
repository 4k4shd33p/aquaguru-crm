-- Controlled payment voids and corrections. Historical payment rows remain immutable.
do $$
declare t text;
begin
  foreach t in array array['sale_payments','service_payments','amc_payments','emi_payments'] loop
    execute format('alter table public.%I add column if not exists payment_status text not null default ''Valid''', t);
    execute format('alter table public.%I add column if not exists voided_at timestamptz', t);
    execute format('alter table public.%I add column if not exists void_reason text', t);
    execute format('alter table public.%I add column if not exists correction_of_payment_id uuid', t);
    execute format('alter table public.%I add column if not exists corrected_by_payment_id uuid', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_payment_status_check');
    execute format('alter table public.%I add constraint %I check (payment_status in (''Valid'', ''Voided'', ''Corrected''))', t, t || '_payment_status_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_payment_lifecycle_check');
    execute format('alter table public.%I add constraint %I check ((payment_status = ''Valid'' and voided_at is null and void_reason is null) or (payment_status in (''Voided'', ''Corrected'') and voided_at is not null and nullif(btrim(void_reason), '''') is not null))', t, t || '_payment_lifecycle_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_correction_of_payment_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (correction_of_payment_id) references public.%I(id) on delete restrict', t, t || '_correction_of_payment_id_fkey', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_corrected_by_payment_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (corrected_by_payment_id) references public.%I(id) on delete restrict', t, t || '_corrected_by_payment_id_fkey', t);
    execute format('create index if not exists %I on public.%I (payment_date desc, id) where payment_status = ''Valid''', t || '_valid_payment_date_idx', t);
  end loop;
end $$;

create or replace function private.protect_payment_history()
returns trigger language plpgsql set search_path to 'pg_catalog', 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.correction_of_payment_id is not null and current_setting('app.payment_correction_in_progress', true) is distinct from 'on' then
      raise exception using errcode='42501', message='payment corrections must use correct_payment';
    end if;
    return new;
  end if;
  if new.payment_date is distinct from old.payment_date or new.amount is distinct from old.amount
     or new.payment_method_id is distinct from old.payment_method_id or new.reference_number is distinct from old.reference_number
     or new.notes is distinct from old.notes then
    raise exception using errcode='42501', message='recorded payments cannot be edited; void or correct the payment instead';
  end if;
  if (new.payment_status is distinct from old.payment_status or new.voided_at is distinct from old.voided_at
      or new.void_reason is distinct from old.void_reason or new.correction_of_payment_id is distinct from old.correction_of_payment_id
      or new.corrected_by_payment_id is distinct from old.corrected_by_payment_id)
     and current_setting('app.payment_correction_in_progress', true) is distinct from 'on' then
    raise exception using errcode='42501', message='payment lifecycle changes must use void_payment or correct_payment';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['sale_payments','service_payments','amc_payments','emi_payments'] loop
    execute format('drop trigger if exists protect_payment_history on public.%I', t);
    execute format('create trigger protect_payment_history before insert or update on public.%I for each row execute function private.protect_payment_history()', t);
  end loop;
end $$;

create or replace function private.payment_parent_id(p_payment_table text, p_payment_id uuid)
returns uuid language plpgsql stable set search_path to 'pg_catalog', 'public' as $$
declare v_parent_id uuid;
begin
  case p_payment_table
    when 'sale_payments' then select sale_id into v_parent_id from public.sale_payments where id=p_payment_id;
    when 'service_payments' then select service_id into v_parent_id from public.service_payments where id=p_payment_id;
    when 'amc_payments' then select amc_cycle_id into v_parent_id from public.amc_payments where id=p_payment_id;
    when 'emi_payments' then select emi_account_id into v_parent_id from public.emi_payments where id=p_payment_id;
    else raise exception using errcode='22023', message='unsupported payment type';
  end case;
  return v_parent_id;
end $$;

create or replace function private.assert_payment_replacement_ceiling(p_payment_table text, p_parent_id uuid, p_amount numeric)
returns void language plpgsql set search_path to 'pg_catalog', 'public' as $$
declare v_limit numeric; v_received numeric; v_sale_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode='23514', message='corrected payment amount must be greater than zero';
  end if;
  case p_payment_table
    when 'sale_payments' then
      select coalesce(sum(si.actual_unit_price * si.quantity), 0) into v_limit
      from public.sales s left join public.sale_items si on si.sale_id=s.id where s.id=p_parent_id group by s.id;
      select coalesce(sum(sp.amount),0) + coalesce((select sum(ep.amount) from public.emi_payments ep join public.emi_accounts ea on ea.id=ep.emi_account_id where ea.sale_id=p_parent_id and ep.payment_status='Valid'),0)
      into v_received from public.sale_payments sp where sp.sale_id=p_parent_id and sp.payment_status='Valid';
    when 'emi_payments' then
      select sale_id into v_sale_id from public.emi_accounts where id=p_parent_id for update;
      select coalesce(sum(si.actual_unit_price * si.quantity), 0) into v_limit
      from public.sales s left join public.sale_items si on si.sale_id=s.id where s.id=v_sale_id group by s.id;
      select coalesce(sum(sp.amount),0) + coalesce((select sum(ep.amount) from public.emi_payments ep join public.emi_accounts ea on ea.id=ep.emi_account_id where ea.sale_id=v_sale_id and ep.payment_status='Valid'),0)
      into v_received from public.sale_payments sp where sp.sale_id=v_sale_id and sp.payment_status='Valid';
    when 'service_payments' then
      select case when s.financial_model_version=2 then s.final_customer_charge else coalesce(sum(si.actual_customer_price*si.quantity),0) end
      into v_limit from public.services s left join public.service_items si on si.service_id=s.id where s.id=p_parent_id group by s.id;
      select coalesce(sum(amount),0) into v_received from public.service_payments where service_id=p_parent_id and payment_status='Valid';
    when 'amc_payments' then
      select agreed_price into v_limit from public.amc_cycles where id=p_parent_id for update;
      select coalesce(sum(amount),0) into v_received from public.amc_payments where amc_cycle_id=p_parent_id and payment_status='Valid';
    else raise exception using errcode='22023', message='unsupported payment type';
  end case;
  if v_limit is null then raise exception using errcode='23514', message='payment requires a known authoritative transaction value'; end if;
  if v_received + p_amount > v_limit then raise exception using errcode='23514', message='corrected payment exceeds the authoritative transaction value'; end if;
end $$;

create or replace function public.void_payment(p_payment_table text, p_payment_id uuid, p_reason text)
returns table(payment_id uuid, payment_status text)
language plpgsql security invoker set search_path to 'pg_catalog', 'public' as $$
declare v_status text; v_parent_id uuid;
begin
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='23514', message='a void reason is required'; end if;
  if p_payment_table not in ('sale_payments','service_payments','amc_payments','emi_payments') then raise exception using errcode='22023', message='unsupported payment type'; end if;
  execute format('select payment_status, %I from public.%I where id=$1 for update',
    case p_payment_table when 'sale_payments' then 'sale_id' when 'service_payments' then 'service_id' when 'amc_payments' then 'amc_cycle_id' else 'emi_account_id' end, p_payment_table)
    into v_status, v_parent_id using p_payment_id;
  if not found then raise exception using errcode='P0002', message='payment was not found'; end if;
  if v_status <> 'Valid' then raise exception using errcode='23514', message='only valid payments can be voided'; end if;
  perform set_config('app.payment_correction_in_progress','on',true);
  execute format('update public.%I set payment_status=''Voided'', voided_at=now(), void_reason=$2 where id=$1', p_payment_table)
    using p_payment_id, btrim(p_reason);
  return query execute format('select id, payment_status from public.%I where id=$1',p_payment_table) using p_payment_id;
end $$;

create or replace function public.correct_payment(
  p_payment_table text, p_payment_id uuid, p_payment_date date, p_amount numeric,
  p_payment_method_id uuid, p_reference_number text, p_notes text, p_reason text)
returns table(original_payment_id uuid, replacement_payment_id uuid, replacement_payment_code text)
language plpgsql security invoker set search_path to 'pg_catalog', 'public' as $$
declare v_status text; v_parent_id uuid; v_replacement_id uuid; v_replacement_code text; v_parent_column text;
begin
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='23514', message='a correction reason is required'; end if;
  if p_payment_date is null then raise exception using errcode='23514', message='a corrected payment date is required'; end if;
  if p_payment_method_id is null then raise exception using errcode='23502', message='a corrected payment method is required'; end if;
  if p_payment_table not in ('sale_payments','service_payments','amc_payments','emi_payments') then raise exception using errcode='22023', message='unsupported payment type'; end if;
  v_parent_column := case p_payment_table when 'sale_payments' then 'sale_id' when 'service_payments' then 'service_id' when 'amc_payments' then 'amc_cycle_id' else 'emi_account_id' end;
  execute format('select payment_status, %I from public.%I where id=$1 for update',v_parent_column,p_payment_table) into v_status,v_parent_id using p_payment_id;
  if not found then raise exception using errcode='P0002', message='payment was not found'; end if;
  if v_status <> 'Valid' then raise exception using errcode='23514', message='only valid payments can be corrected'; end if;
  perform set_config('app.payment_correction_in_progress','on',true);
  execute format('update public.%I set payment_status=''Corrected'', voided_at=now(), void_reason=$2 where id=$1',p_payment_table) using p_payment_id,btrim(p_reason);
  perform private.assert_payment_replacement_ceiling(p_payment_table,v_parent_id,p_amount);
  execute format('insert into public.%I (%I,payment_date,amount,payment_method_id,reference_number,notes,correction_of_payment_id) values ($1,$2,$3,$4,$5,$6,$7) returning id,payment_code',p_payment_table,v_parent_column)
    into v_replacement_id,v_replacement_code using v_parent_id,p_payment_date,p_amount,p_payment_method_id,nullif(btrim(p_reference_number),''),nullif(btrim(p_notes),''),p_payment_id;
  execute format('update public.%I set corrected_by_payment_id=$2 where id=$1',p_payment_table) using p_payment_id,v_replacement_id;
  return query select p_payment_id,v_replacement_id,v_replacement_code;
end $$;

create or replace function private.validate_service_payment_financials()
returns trigger language plpgsql set search_path to 'pg_catalog', 'public' as $$
declare v_service public.services%rowtype; v_charge numeric; v_paid numeric;
begin
  select * into v_service from public.services where id=new.service_id for update;
  if not found then raise exception using errcode='23503', message='service payment must reference an existing service'; end if;
  if v_service.status in ('Cancelled','Void') then raise exception using errcode='23514', message='payments are not allowed for Cancelled or Void services'; end if;
  if v_service.financial_model_version=2 then v_charge:=v_service.final_customer_charge;
  else select coalesce(sum(actual_customer_price*quantity),0) into v_charge from public.service_items where service_id=v_service.id; end if;
  if v_charge is null then raise exception using errcode='23514', message='service payment requires a known final customer charge'; end if;
  select coalesce(sum(amount),0) into v_paid from public.service_payments
    where service_id=new.service_id and payment_status='Valid' and (tg_op='INSERT' or id<>old.id);
  if new.payment_status='Valid' and v_paid+new.amount>v_charge then raise exception using errcode='23514', message='service payment exceeds the authoritative service charge'; end if;
  return new;
end $$;

create or replace function public.get_finance_summary(p_date_from date,p_date_to date)
returns table(sales_value numeric,sales_direct_collections numeric,sales_emi_collections numeric,sales_collections numeric,sales_known_direct_cost numeric,sales_direct_cost_available boolean,sales_contribution numeric,sales_contribution_available boolean,service_value numeric,service_collections numeric,service_known_direct_cost numeric,service_direct_cost_available boolean,service_contribution numeric,service_contribution_available boolean,amc_value numeric,amc_value_available boolean,amc_collections numeric,total_transaction_value numeric,total_transaction_value_available boolean,total_collections numeric,sales_outstanding_as_of numeric,service_outstanding_as_of numeric,amc_outstanding_as_of numeric,total_outstanding_as_of numeric,total_outstanding_available boolean)
language sql stable set search_path to 'public','pg_temp' as $$
with vs as(select id,sale_date from sales where status in('Confirmed','Completed')),
sm as(select coalesce(sum(si.actual_unit_price*si.quantity),0)v,coalesce(bool_and(si.unit_cost is not null),true)ok,coalesce(sum(si.unit_cost*si.quantity),0)c from vs join sale_items si on si.sale_id=vs.id where sale_date between p_date_from and p_date_to),
sc as(select coalesce(sum(amount),0)v from sale_payments sp join vs on vs.id=sp.sale_id where sp.payment_status='Valid' and payment_date between p_date_from and p_date_to),
ec as(select coalesce(sum(ep.amount),0)v from emi_payments ep join emi_accounts ea on ea.id=ep.emi_account_id and ea.status in('Active','Completed','Defaulted') join vs on vs.id=ea.sale_id where ep.payment_status='Valid' and payment_date between p_date_from and p_date_to),
sf as(select s.id,s.service_date,f.revenue,f.direct_cost,f.direct_cost_available from services s join private.service_financial_rows() f on f.service_id=s.id where s.status='Completed'),
sx as(select coalesce(sum(revenue),0)v,coalesce(bool_and(direct_cost_available),true)ok,coalesce(sum(direct_cost),0)c from sf where service_date between p_date_from and p_date_to),
sp as(select coalesce(sum(amount),0)v from service_payments p join sf on sf.id=p.service_id where p.payment_status='Valid' and payment_date between p_date_from and p_date_to),
va as(select id,start_date,agreed_price from amc_cycles where status in('Active','Expired')),
am as(select coalesce(bool_and(agreed_price is not null),true)ok,coalesce(sum(agreed_price),0)v from va where start_date between p_date_from and p_date_to),
ap as(select coalesce(sum(amount),0)v from amc_payments p join va on va.id=p.amc_cycle_id where p.payment_status='Valid' and payment_date between p_date_from and p_date_to),
sa as(select coalesce(sum(si.actual_unit_price*si.quantity),0)-coalesce((select sum(amount) from sale_payments p join vs on vs.id=p.sale_id where p.payment_status='Valid' and payment_date<=p_date_to),0)-coalesce((select sum(ep.amount) from emi_payments ep join emi_accounts ea on ea.id=ep.emi_account_id join vs on vs.id=ea.sale_id where ep.payment_status='Valid' and payment_date<=p_date_to),0) v from vs join sale_items si on si.sale_id=vs.id where sale_date<=p_date_to),
sfa as(select coalesce(sum(revenue),0)-coalesce((select sum(p.amount) from service_payments p join sf on sf.id=p.service_id where p.payment_status='Valid' and payment_date<=p_date_to),0)v from sf where service_date<=p_date_to),
aa as(select coalesce(sum(agreed_price),0)-coalesce((select sum(p.amount) from amc_payments p join va on va.id=p.amc_cycle_id where p.payment_status='Valid' and payment_date<=p_date_to),0)v from va where start_date<=p_date_to)
select sm.v,sc.v,ec.v,sc.v+ec.v,case when sm.ok then sm.c end,sm.ok,case when sm.ok then sm.v-sm.c end,sm.ok,sx.v,sp.v,case when sx.ok then sx.c end,sx.ok,case when sx.ok then sx.v-sx.c end,sx.ok,case when am.ok then am.v end,am.ok,ap.v,case when am.ok then sm.v+sx.v+am.v end,am.ok,sc.v+ec.v+sp.v+ap.v,sa.v,sfa.v,aa.v,sa.v+sfa.v+aa.v,true from sm cross join sc cross join ec cross join sx cross join sp cross join am cross join ap cross join sa cross join sfa cross join aa;
$$;

create or replace function public.get_finance_outstanding(p_category text,p_as_of date,p_offset integer,p_limit integer)
returns table(category text,transaction_id uuid,transaction_code text,customer_id uuid,customer_name text,transaction_date date,transaction_value numeric,collections_as_of numeric,outstanding numeric,direct_cost numeric,direct_cost_available boolean,contribution numeric,total_count bigint)
language sql stable set search_path to 'public','pg_temp' as $$
with sale_rows as (select 'Sales'::text category,s.id transaction_id,s.sale_code transaction_code,c.id customer_id,c.name customer_name,s.sale_date transaction_date,coalesce(sum(si.actual_unit_price*si.quantity),0) transaction_value,coalesce(bool_and(si.unit_cost is not null),true) direct_cost_available,coalesce(sum(si.unit_cost*si.quantity),0) direct_cost from public.sales s join public.customers c on c.id=s.customer_id left join public.sale_items si on si.sale_id=s.id where s.status in ('Confirmed','Completed') and s.sale_date<=p_as_of group by s.id,s.sale_code,c.id,c.name,s.sale_date),
sale_direct_paid as (select sp.sale_id,sum(sp.amount) amount from public.sale_payments sp join public.sales s on s.id=sp.sale_id and s.status in ('Confirmed','Completed') where sp.payment_status='Valid' and sp.payment_date<=p_as_of group by sp.sale_id),
sale_emi_paid as (select ea.sale_id,sum(ep.amount) amount from public.emi_payments ep join public.emi_accounts ea on ea.id=ep.emi_account_id and ea.status in ('Active','Completed','Defaulted') join public.sales s on s.id=ea.sale_id and s.status in ('Confirmed','Completed') where ep.payment_status='Valid' and ep.payment_date<=p_as_of group by ea.sale_id),
service_rows as (select 'Service'::text category,sv.id transaction_id,sv.service_code transaction_code,c.id customer_id,c.name customer_name,sv.service_date transaction_date,sf.revenue transaction_value,sf.direct_cost_available,sf.direct_cost from public.services sv join public.equipment e on e.id=sv.equipment_id join public.customers c on c.id=e.customer_id join private.service_financial_rows() sf on sf.service_id=sv.id where sv.status='Completed' and sv.service_date<=p_as_of),
service_paid as (select sp.service_id,sum(sp.amount) amount from public.service_payments sp join public.services sv on sv.id=sp.service_id and sv.status='Completed' where sp.payment_status='Valid' and sp.payment_date<=p_as_of group by sp.service_id),
amc_rows as (select 'AMC'::text category,ac.id transaction_id,ac.amc_code transaction_code,c.id customer_id,c.name customer_name,ac.start_date transaction_date,ac.agreed_price transaction_value from public.amc_cycles ac join public.equipment e on e.id=ac.equipment_id join public.customers c on c.id=e.customer_id where ac.status in ('Active','Expired') and ac.start_date<=p_as_of),
amc_paid as (select ap.amc_cycle_id,sum(ap.amount) amount from public.amc_payments ap join public.amc_cycles ac on ac.id=ap.amc_cycle_id and ac.status in ('Active','Expired') where ap.payment_status='Valid' and ap.payment_date<=p_as_of group by ap.amc_cycle_id),
unified as (select sr.category,sr.transaction_id,sr.transaction_code,sr.customer_id,sr.customer_name,sr.transaction_date,sr.transaction_value,coalesce(sdp.amount,0)+coalesce(sep.amount,0) collections_as_of,sr.transaction_value-coalesce(sdp.amount,0)-coalesce(sep.amount,0) outstanding,case when sr.direct_cost_available then sr.direct_cost else null end direct_cost,sr.direct_cost_available,case when sr.direct_cost_available then sr.transaction_value-sr.direct_cost else null end contribution from sale_rows sr left join sale_direct_paid sdp on sdp.sale_id=sr.transaction_id left join sale_emi_paid sep on sep.sale_id=sr.transaction_id union all select sr.category,sr.transaction_id,sr.transaction_code,sr.customer_id,sr.customer_name,sr.transaction_date,sr.transaction_value,coalesce(sp.amount,0),sr.transaction_value-coalesce(sp.amount,0),case when sr.direct_cost_available then sr.direct_cost else null end,sr.direct_cost_available,case when sr.direct_cost_available then sr.transaction_value-sr.direct_cost else null end from service_rows sr left join service_paid sp on sp.service_id=sr.transaction_id union all select ar.category,ar.transaction_id,ar.transaction_code,ar.customer_id,ar.customer_name,ar.transaction_date,ar.transaction_value,coalesce(ap.amount,0),case when ar.transaction_value is null then null else ar.transaction_value-coalesce(ap.amount,0) end,null::numeric,false,null::numeric from amc_rows ar left join amc_paid ap on ap.amc_cycle_id=ar.transaction_id),
filtered as (select *,count(*) over() total_count from unified where (p_category is null or category=p_category) and (transaction_value is null or outstanding<>0))
select * from filtered order by transaction_date desc,category,transaction_code,transaction_id offset greatest(0,coalesce(p_offset,0)) limit greatest(1,least(coalesce(p_limit,25),100));
$$;

create or replace function public.get_finance_recent_collections(p_date_from date,p_date_to date,p_limit integer)
returns table(payment_date date,collection_type text,payment_id uuid,payment_code text,transaction_id uuid,transaction_code text,customer_id uuid,customer_name text,payment_method_id uuid,payment_method_name text,amount numeric)
language sql stable set search_path to 'public','pg_temp' as $$
with collections(payment_date,collection_type,payment_id,payment_code,transaction_id,transaction_code,customer_id,customer_name,payment_method_id,payment_method_name,amount) as (
select sp.payment_date,'Sale'::text,sp.id,sp.payment_code,s.id,s.sale_code,c.id,c.name,pm.id,pm.name,sp.amount from public.sale_payments sp join public.sales s on s.id=sp.sale_id and s.status in ('Confirmed','Completed') join public.customers c on c.id=s.customer_id join public.payment_methods pm on pm.id=sp.payment_method_id where sp.payment_status='Valid'
union all select ep.payment_date,'EMI'::text,ep.id,ep.payment_code,s.id,s.sale_code,c.id,c.name,pm.id,pm.name,ep.amount from public.emi_payments ep join public.emi_accounts ea on ea.id=ep.emi_account_id and ea.status in ('Active','Completed','Defaulted') join public.sales s on s.id=ea.sale_id and s.status in ('Confirmed','Completed') join public.customers c on c.id=s.customer_id join public.payment_methods pm on pm.id=ep.payment_method_id where ep.payment_status='Valid'
union all select sp.payment_date,'Service'::text,sp.id,sp.payment_code,sv.id,sv.service_code,c.id,c.name,pm.id,pm.name,sp.amount from public.service_payments sp join public.services sv on sv.id=sp.service_id and sv.status='Completed' join public.equipment e on e.id=sv.equipment_id join public.customers c on c.id=e.customer_id join public.payment_methods pm on pm.id=sp.payment_method_id where sp.payment_status='Valid'
union all select ap.payment_date,'AMC'::text,ap.id,ap.payment_code,ac.id,ac.amc_code,c.id,c.name,pm.id,pm.name,ap.amount from public.amc_payments ap join public.amc_cycles ac on ac.id=ap.amc_cycle_id and ac.status in ('Active','Expired') join public.equipment e on e.id=ac.equipment_id join public.customers c on c.id=e.customer_id join public.payment_methods pm on pm.id=ap.payment_method_id where ap.payment_status='Valid'
)
select * from collections where payment_date between p_date_from and p_date_to order by payment_date desc,collection_type,payment_code,payment_id limit greatest(1,least(coalesce(p_limit,25),100));
$$;

revoke all on function public.void_payment(text,uuid,text) from public;
revoke all on function public.void_payment(text,uuid,text) from anon;
grant execute on function public.void_payment(text,uuid,text) to authenticated;
revoke all on function public.correct_payment(text,uuid,date,numeric,uuid,text,text,text) from public;
revoke all on function public.correct_payment(text,uuid,date,numeric,uuid,text,text,text) from anon;
grant execute on function public.correct_payment(text,uuid,date,numeric,uuid,text,text,text) to authenticated;
