-- Phase 1A.1: make Service outstanding calculations financial-model-version aware.
create or replace function public.get_finance_outstanding(
  p_category text,
  p_as_of date,
  p_offset integer,
  p_limit integer
)
returns table(
  category text,
  transaction_id uuid,
  transaction_code text,
  customer_id uuid,
  customer_name text,
  transaction_date date,
  transaction_value numeric,
  collections_as_of numeric,
  outstanding numeric,
  direct_cost numeric,
  direct_cost_available boolean,
  contribution numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
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
    select 'Service'::text category, sv.id transaction_id, sv.service_code transaction_code,
           c.id customer_id, c.name customer_name, sv.service_date transaction_date,
           sf.revenue transaction_value,
           sf.direct_cost_available,
           sf.direct_cost
    from public.services sv
    join public.equipment e on e.id=sv.equipment_id
    join public.customers c on c.id=e.customer_id
    join private.service_financial_rows() sf on sf.service_id=sv.id
    where sv.status='Completed' and sv.service_date <= p_as_of
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

revoke all on function public.get_finance_outstanding(text,date,integer,integer) from public;
revoke all on function public.get_finance_outstanding(text,date,integer,integer) from anon;
grant execute on function public.get_finance_outstanding(text,date,integer,integer) to authenticated;
