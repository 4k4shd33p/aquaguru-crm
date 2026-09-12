-- Phase 3.4.2: expose the existing canonical service-cost attribution as a
-- read-only, authenticated reporting projection for Service Detail.
create or replace function public.get_service_economics_breakdown(p_service_id uuid)
returns table (
  service_id uuid,
  known_direct_cost numeric,
  unknown_cost_count bigint,
  cost_contexts jsonb
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with attributed_costs as (
    select attribution.*
    from private.service_cost_attribution(p_service_id) as attribution
  ),
  components as (
    select
      attributed_costs.economic_bucket,
      attributed_costs.cost_type,
      coalesce(sum(attributed_costs.amount) filter (where attributed_costs.amount_known), 0)::numeric as known_direct_cost,
      count(*) filter (where not attributed_costs.amount_known)::bigint as unknown_cost_count
    from attributed_costs
    group by attributed_costs.economic_bucket, attributed_costs.cost_type
  ),
  context_rollups as (
    select
      components.economic_bucket,
      coalesce(sum(components.known_direct_cost), 0)::numeric as known_direct_cost,
      coalesce(sum(components.unknown_cost_count), 0)::bigint as unknown_cost_count,
      jsonb_agg(
        jsonb_build_object(
          'cost_type', components.cost_type,
          'known_direct_cost', components.known_direct_cost,
          'unknown_cost_count', components.unknown_cost_count
        )
        order by case components.cost_type
          when 'Item' then 1
          when 'Technician' then 2
          when 'Travel' then 3
          when 'Other' then 4
          else 5
        end
      ) as components
    from components
    group by components.economic_bucket
  ),
  totals as (
    select
      coalesce(sum(context_rollups.known_direct_cost), 0)::numeric as known_direct_cost,
      coalesce(sum(context_rollups.unknown_cost_count), 0)::bigint as unknown_cost_count
    from context_rollups
  )
  select
    p_service_id,
    totals.known_direct_cost,
    totals.unknown_cost_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'economic_bucket', context_rollups.economic_bucket,
          'known_direct_cost', context_rollups.known_direct_cost,
          'unknown_cost_count', context_rollups.unknown_cost_count,
          'components', context_rollups.components
        )
        order by case context_rollups.economic_bucket
          when 'Paid Service' then 1
          when 'AMC' then 2
          when 'Product Sales' then 3
          when 'Complimentary / Goodwill' then 4
          when 'Unallocated' then 5
          else 6
        end
      ) filter (where context_rollups.economic_bucket is not null),
      '[]'::jsonb
    ) as cost_contexts
  from totals
  left join context_rollups on true
  group by totals.known_direct_cost, totals.unknown_cost_count
$function$;

revoke execute on function public.get_service_economics_breakdown(uuid) from public;
revoke execute on function public.get_service_economics_breakdown(uuid) from anon;
grant execute on function public.get_service_economics_breakdown(uuid) to authenticated;
