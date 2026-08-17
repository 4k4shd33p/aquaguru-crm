-- REVIEW ONLY: Finance reporting functions. Do not apply until separately approved.
-- Date basis: values/costs use the supplied transaction-date range; collections use
-- payment_date in the supplied range; outstanding is a balance as at p_date_to.
-- Installation charges are excluded: V1 has no installation-payment ledger or approved settlement model.

create or replace function public.get_finance_summary(p_date_from date, p_date_to date)
returns table (
  sales_value numeric, sales_direct_collections numeric, sales_emi_collections numeric, sales_collections numeric,
  sales_known_direct_cost numeric, sales_direct_cost_available boolean, sales_contribution numeric, sales_contribution_available boolean,
  service_value numeric, service_collections numeric, service_known_direct_cost numeric, service_direct_cost_available boolean,
  service_contribution numeric, service_contribution_available boolean,
  amc_value numeric, amc_value_available boolean, amc_collections numeric,
  total_transaction_value numeric, total_transaction_value_available boolean, total_collections numeric,
  sales_outstanding_as_of numeric, service_outstanding_as_of numeric, amc_outstanding_as_of numeric,
  total_outstanding_as_of numeric, total_outstanding_available boolean
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  with
  valid_sales as (
    select s.id, s.sale_date from public.sales as s where s.status in ('Confirmed', 'Completed')
  ),
  sales_in_range as (
    select vs.id from valid_sales as vs where vs.sale_date between p_date_from and p_date_to
  ),
  sales_metrics as (
    select coalesce(sum(si.actual_unit_price * si.quantity), 0) as value,
           coalesce(bool_and(si.unit_cost is not null), true) as cost_available,
           coalesce(sum(si.unit_cost * si.quantity), 0) as known_cost
    from sales_in_range as sr left join public.sale_items as si on si.sale_id = sr.id
  ),
  sales_direct_collections as (
    select coalesce(sum(sp.amount), 0) as amount
    from public.sale_payments as sp join valid_sales as vs on vs.id = sp.sale_id
    where sp.payment_date between p_date_from and p_date_to
  ),
  sales_emi_collections as (
    select coalesce(sum(ep.amount), 0) as amount
    from public.emi_payments as ep
    join public.emi_accounts as ea on ea.id = ep.emi_account_id and ea.status in ('Active', 'Completed', 'Defaulted')
    join valid_sales as vs on vs.id = ea.sale_id
    where ep.payment_date between p_date_from and p_date_to
  ),
  valid_services as (
    select sv.id, sv.service_date, sv.technician_charge from public.services as sv where sv.status = 'Completed'
  ),
  services_in_range as (
    select vs.id, vs.technician_charge from valid_services as vs where vs.service_date between p_date_from and p_date_to
  ),
  service_line_metrics as (
    select coalesce(sum(si.actual_customer_price * si.quantity), 0) as value,
           coalesce(bool_and(si.internal_cost is not null), true) as cost_available,
           coalesce(sum(si.internal_cost * si.quantity), 0) as known_cost
    from services_in_range as sr left join public.service_items as si on si.service_id = sr.id
  ),
  service_technician_metrics as (
    select coalesce(bool_and(sr.technician_charge is not null), true) as cost_available,
           coalesce(sum(sr.technician_charge), 0) as known_cost
    from services_in_range as sr
  ),
  service_collections as (
    select coalesce(sum(sp.amount), 0) as amount
    from public.service_payments as sp join valid_services as vs on vs.id = sp.service_id
    where sp.payment_date between p_date_from and p_date_to
  ),
  valid_amcs as (
    select ac.id, ac.start_date, ac.agreed_price from public.amc_cycles as ac where ac.status in ('Active', 'Expired')
  ),
  amcs_in_range as (
    select va.id, va.agreed_price from valid_amcs as va where va.start_date between p_date_from and p_date_to
  ),
  amc_metrics as (
    select coalesce(bool_and(ar.agreed_price is not null), true) as value_available,
           coalesce(sum(ar.agreed_price), 0) as known_value
    from amcs_in_range as ar
  ),
  amc_collections as (
    select coalesce(sum(ap.amount), 0) as amount
    from public.amc_payments as ap join valid_amcs as va on va.id = ap.amc_cycle_id
    where ap.payment_date between p_date_from and p_date_to
  ),
  sales_as_of as (
    select coalesce(sum(si.actual_unit_price * si.quantity), 0) as value
    from valid_sales as vs join public.sale_items as si on si.sale_id = vs.id where vs.sale_date <= p_date_to
  ),
  sales_as_of_direct_collections as (
    select coalesce(sum(sp.amount), 0) as amount
    from public.sale_payments as sp join valid_sales as vs on vs.id = sp.sale_id where sp.payment_date <= p_date_to
  ),
  sales_as_of_emi_collections as (
    select coalesce(sum(ep.amount), 0) as amount
    from public.emi_payments as ep
    join public.emi_accounts as ea on ea.id = ep.emi_account_id and ea.status in ('Active', 'Completed', 'Defaulted')
    join valid_sales as vs on vs.id = ea.sale_id where ep.payment_date <= p_date_to
  ),
  services_as_of as (
    select coalesce(sum(si.actual_customer_price * si.quantity), 0) as value
    from valid_services as vs join public.service_items as si on si.service_id = vs.id where vs.service_date <= p_date_to
  ),
  services_as_of_collections as (
    select coalesce(sum(sp.amount), 0) as amount
    from public.service_payments as sp join valid_services as vs on vs.id = sp.service_id where sp.payment_date <= p_date_to
  ),
  amcs_as_of as (
    select coalesce(bool_and(va.agreed_price is not null), true) as value_available,
           coalesce(sum(va.agreed_price), 0) as value
    from valid_amcs as va where va.start_date <= p_date_to
  ),
  amcs_as_of_collections as (
    select coalesce(sum(ap.amount), 0) as amount
    from public.amc_payments as ap join valid_amcs as va on va.id = ap.amc_cycle_id where ap.payment_date <= p_date_to
  )
  select
    sm.value, sdc.amount, sec.amount, sdc.amount + sec.amount,
    case when sm.cost_available then sm.known_cost else null end, sm.cost_available,
    case when sm.cost_available then sm.value - sm.known_cost else null end, sm.cost_available,
    slm.value, svc.amount,
    case when slm.cost_available and stm.cost_available then slm.known_cost + stm.known_cost else null end,
    slm.cost_available and stm.cost_available,
    case when slm.cost_available and stm.cost_available then slm.value - slm.known_cost - stm.known_cost else null end,
    slm.cost_available and stm.cost_available,
    case when amm.value_available then amm.known_value else null end, amm.value_available, amc.amount,
    case when amm.value_available then sm.value + slm.value + amm.known_value else null end, amm.value_available,
    sdc.amount + sec.amount + svc.amount + amc.amount,
    sao.value - sadc.amount - saec.amount,
    svo.value - svoc.amount,
    case when aao.value_available then aao.value - aaoc.amount else null end,
    case when aao.value_available then sao.value - sadc.amount - saec.amount + svo.value - svoc.amount + aao.value - aaoc.amount else null end,
    aao.value_available
  from sales_metrics sm cross join sales_direct_collections sdc cross join sales_emi_collections sec
  cross join service_line_metrics slm cross join service_technician_metrics stm cross join service_collections svc
  cross join amc_metrics amm cross join amc_collections amc
  cross join sales_as_of sao cross join sales_as_of_direct_collections sadc cross join sales_as_of_emi_collections saec
  cross join services_as_of svo cross join services_as_of_collections svoc
  cross join amcs_as_of aao cross join amcs_as_of_collections aaoc;
$$;

create or replace function public.get_finance_recent_collections(p_date_from date, p_date_to date, p_limit integer)
returns table (
  payment_date date, collection_type text, payment_id uuid, payment_code text,
  transaction_id uuid, transaction_code text, customer_id uuid, customer_name text,
  payment_method_id uuid, payment_method_name text, amount numeric
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  with collections as (
    select sp.payment_date, 'Sale'::text, sp.id, sp.payment_code, s.id, s.sale_code, c.id, c.name, pm.id, pm.name, sp.amount
    from public.sale_payments sp
    join public.sales s on s.id = sp.sale_id and s.status in ('Confirmed', 'Completed')
    join public.customers c on c.id = s.customer_id join public.payment_methods pm on pm.id = sp.payment_method_id
    union all
    select ep.payment_date, 'EMI'::text, ep.id, ep.payment_code, s.id, s.sale_code, c.id, c.name, pm.id, pm.name, ep.amount
    from public.emi_payments ep
    join public.emi_accounts ea on ea.id = ep.emi_account_id and ea.status in ('Active', 'Completed', 'Defaulted')
    join public.sales s on s.id = ea.sale_id and s.status in ('Confirmed', 'Completed')
    join public.customers c on c.id = s.customer_id join public.payment_methods pm on pm.id = ep.payment_method_id
    union all
    select sp.payment_date, 'Service'::text, sp.id, sp.payment_code, sv.id, sv.service_code, c.id, c.name, pm.id, pm.name, sp.amount
    from public.service_payments sp
    join public.services sv on sv.id = sp.service_id and sv.status = 'Completed'
    join public.equipment e on e.id = sv.equipment_id join public.customers c on c.id = e.customer_id
    join public.payment_methods pm on pm.id = sp.payment_method_id
    union all
    select ap.payment_date, 'AMC'::text, ap.id, ap.payment_code, ac.id, ac.amc_code, c.id, c.name, pm.id, pm.name, ap.amount
    from public.amc_payments ap
    join public.amc_cycles ac on ac.id = ap.amc_cycle_id and ac.status in ('Active', 'Expired')
    join public.equipment e on e.id = ac.equipment_id join public.customers c on c.id = e.customer_id
    join public.payment_methods pm on pm.id = ap.payment_method_id
  )
  select * from collections where payment_date between p_date_from and p_date_to
  order by payment_date desc, collection_type, payment_code, payment_id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

create or replace function public.get_finance_outstanding(p_category text, p_as_of date, p_offset integer, p_limit integer)
returns table (
  category text, transaction_id uuid, transaction_code text, customer_id uuid, customer_name text, transaction_date date,
  transaction_value numeric, collections_as_of numeric, outstanding numeric,
  direct_cost numeric, direct_cost_available boolean, contribution numeric, total_count bigint
)
language sql stable security invoker set search_path = public, pg_temp
as $$
  with
  sale_rows as (
    select 'Sales'::text category, s.id transaction_id, s.sale_code transaction_code, c.id customer_id, c.name customer_name, s.sale_date transaction_date,
           coalesce(sum(si.actual_unit_price * si.quantity), 0) transaction_value,
           coalesce(bool_and(si.unit_cost is not null), true) direct_cost_available,
           coalesce(sum(si.unit_cost * si.quantity), 0) direct_cost
    from public.sales s join public.customers c on c.id=s.customer_id left join public.sale_items si on si.sale_id=s.id
    where s.status in ('Confirmed','Completed') and s.sale_date <= p_as_of
    group by s.id,s.sale_code,c.id,c.name,s.sale_date
  ),
  sale_direct_paid as (
    select sp.sale_id, sum(sp.amount) amount from public.sale_payments sp
    join public.sales s on s.id=sp.sale_id and s.status in ('Confirmed','Completed')
    where sp.payment_date <= p_as_of group by sp.sale_id
  ),
  sale_emi_paid as (
    select ea.sale_id, sum(ep.amount) amount from public.emi_payments ep
    join public.emi_accounts ea on ea.id=ep.emi_account_id and ea.status in ('Active','Completed','Defaulted')
    join public.sales s on s.id=ea.sale_id and s.status in ('Confirmed','Completed')
    where ep.payment_date <= p_as_of group by ea.sale_id
  ),
  service_rows as (
    select 'Service'::text category, sv.id transaction_id, sv.service_code transaction_code, c.id customer_id, c.name customer_name, sv.service_date transaction_date,
           coalesce(sum(si.actual_customer_price * si.quantity),0) transaction_value,
           coalesce(bool_and(si.internal_cost is not null), true) and sv.technician_charge is not null direct_cost_available,
           coalesce(sum(si.internal_cost * si.quantity),0) + coalesce(sv.technician_charge,0) direct_cost
    from public.services sv join public.equipment e on e.id=sv.equipment_id join public.customers c on c.id=e.customer_id
    left join public.service_items si on si.service_id=sv.id
    where sv.status='Completed' and sv.service_date <= p_as_of
    group by sv.id,sv.service_code,c.id,c.name,sv.service_date,sv.technician_charge
  ),
  service_paid as (
    select sp.service_id, sum(sp.amount) amount from public.service_payments sp
    join public.services sv on sv.id=sp.service_id and sv.status='Completed'
    where sp.payment_date <= p_as_of group by sp.service_id
  ),
  amc_rows as (
    select 'AMC'::text category, ac.id transaction_id, ac.amc_code transaction_code, c.id customer_id, c.name customer_name, ac.start_date transaction_date, ac.agreed_price transaction_value
    from public.amc_cycles ac join public.equipment e on e.id=ac.equipment_id join public.customers c on c.id=e.customer_id
    where ac.status in ('Active','Expired') and ac.start_date <= p_as_of
  ),
  amc_paid as (
    select ap.amc_cycle_id, sum(ap.amount) amount from public.amc_payments ap
    join public.amc_cycles ac on ac.id=ap.amc_cycle_id and ac.status in ('Active','Expired')
    where ap.payment_date <= p_as_of group by ap.amc_cycle_id
  ),
  unified as (
    select sr.category,sr.transaction_id,sr.transaction_code,sr.customer_id,sr.customer_name,sr.transaction_date,sr.transaction_value,
           coalesce(sdp.amount,0)+coalesce(sep.amount,0) collections_as_of,
           sr.transaction_value-coalesce(sdp.amount,0)-coalesce(sep.amount,0) outstanding,
           case when sr.direct_cost_available then sr.direct_cost else null end direct_cost,sr.direct_cost_available,
           case when sr.direct_cost_available then sr.transaction_value-sr.direct_cost else null end contribution
    from sale_rows sr left join sale_direct_paid sdp on sdp.sale_id=sr.transaction_id left join sale_emi_paid sep on sep.sale_id=sr.transaction_id
    union all
    select sr.category,sr.transaction_id,sr.transaction_code,sr.customer_id,sr.customer_name,sr.transaction_date,sr.transaction_value,
           coalesce(sp.amount,0),sr.transaction_value-coalesce(sp.amount,0),
           case when sr.direct_cost_available then sr.direct_cost else null end,sr.direct_cost_available,
           case when sr.direct_cost_available then sr.transaction_value-sr.direct_cost else null end
    from service_rows sr left join service_paid sp on sp.service_id=sr.transaction_id
    union all
    select ar.category,ar.transaction_id,ar.transaction_code,ar.customer_id,ar.customer_name,ar.transaction_date,ar.transaction_value,
           coalesce(ap.amount,0),case when ar.transaction_value is null then null else ar.transaction_value-coalesce(ap.amount,0) end,
           null::numeric,false,null::numeric
    from amc_rows ar left join amc_paid ap on ap.amc_cycle_id=ar.transaction_id
  ),
  filtered as (
    select *,count(*) over() total_count from unified
    where (p_category is null or category=p_category) and (transaction_value is null or outstanding <> 0)
  )
  select * from filtered order by transaction_date desc,category,transaction_code,transaction_id
  offset greatest(0,coalesce(p_offset,0)) limit greatest(1,least(coalesce(p_limit,25),100));
$$;

revoke execute on function public.get_finance_summary(date,date) from public;
revoke execute on function public.get_finance_summary(date,date) from anon;
grant execute on function public.get_finance_summary(date,date) to authenticated;
revoke execute on function public.get_finance_recent_collections(date,date,integer) from public;
revoke execute on function public.get_finance_recent_collections(date,date,integer) from anon;
grant execute on function public.get_finance_recent_collections(date,date,integer) to authenticated;
revoke execute on function public.get_finance_outstanding(text,date,integer,integer) from public;
revoke execute on function public.get_finance_outstanding(text,date,integer,integer) from anon;
grant execute on function public.get_finance_outstanding(text,date,integer,integer) to authenticated;
