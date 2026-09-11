-- Phase 3.4.1: derived lifetime economics for one AMC cycle.
-- This is a read-only view of the canonical Phase 3.2.1A cost-attribution events.
create or replace function public.get_amc_cycle_economics(p_amc_cycle_id uuid)
returns table(
  amc_cycle_id uuid,
  contract_value numeric,
  known_direct_cost numeric,
  unknown_cost_count bigint,
  gross_profit_to_date numeric,
  gross_profit_known boolean,
  amount_received numeric,
  amount_due numeric,
  service_costs jsonb
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cycle as (
    select ac.id, ac.agreed_price
    from public.amc_cycles ac
    where ac.id = p_amc_cycle_id
  ),
  attributed_costs as (
    select x.*
    from private.service_cost_attribution(null) x
    join cycle c on c.id = x.amc_cycle_id
    where x.economic_bucket = 'AMC'
  ),
  costs as (
    select
      coalesce(sum(x.amount) filter (where x.amount_known), 0)::numeric as known_direct_cost,
      count(*) filter (where not x.amount_known)::bigint as unknown_cost_count
    from attributed_costs x
  ),
  payments as (
    select coalesce(sum(ap.amount) filter (where ap.payment_status = 'Valid'), 0)::numeric as amount_received
    from public.amc_payments ap
    join cycle c on c.id = ap.amc_cycle_id
  ),
  service_costs as (
    select
      x.service_id,
      s.service_code,
      s.service_date,
      coalesce(sum(x.amount) filter (where x.amount_known), 0)::numeric as known_direct_cost,
      count(*) filter (where not x.amount_known)::bigint as unknown_cost_count
    from attributed_costs x
    join public.services s on s.id = x.service_id
    group by x.service_id, s.service_code, s.service_date
  ),
  trace as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'service_id', sc.service_id,
          'service_code', sc.service_code,
          'service_date', sc.service_date,
          'known_direct_cost', sc.known_direct_cost,
          'unknown_cost_count', sc.unknown_cost_count
        )
        order by sc.service_date desc, sc.service_code desc
      ),
      '[]'::jsonb
    ) as service_costs
    from service_costs sc
  )
  select
    c.id,
    c.agreed_price,
    costs.known_direct_cost,
    costs.unknown_cost_count,
    case when c.agreed_price is null then null else c.agreed_price - costs.known_direct_cost end,
    c.agreed_price is not null and costs.unknown_cost_count = 0,
    payments.amount_received,
    case when c.agreed_price is null then null else c.agreed_price - payments.amount_received end,
    trace.service_costs
  from cycle c
  cross join costs
  cross join payments
  cross join trace;
$function$;

revoke execute on function public.get_amc_cycle_economics(uuid) from public;
revoke execute on function public.get_amc_cycle_economics(uuid) from anon;
grant execute on function public.get_amc_cycle_economics(uuid) to authenticated;
