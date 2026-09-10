-- Phase 3.2.1B: read-only business-performance reporting over canonical attribution events.
create or replace function public.get_finance_performance(p_date_from date, p_date_to date)
returns table (
  category text,
  revenue numeric,
  product_cost numeric,
  installation_direct_cost numeric,
  warranty_direct_cost numeric,
  service_item_direct_cost numeric,
  shared_direct_cost numeric,
  known_direct_cost numeric,
  unknown_cost_count bigint,
  gross_profit numeric,
  gross_profit_known boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with categories(category, sort_order) as (
    values ('Product Sales'::text,1),('Paid Service',2),('AMC',3),('Complimentary / Goodwill',4),('Unallocated',5),('Consolidated',6)
  ), revenue as (
    select 'Product Sales'::text category, coalesce(sum(si.actual_unit_price * si.quantity),0)::numeric amount
    from public.sales s join public.sale_items si on si.sale_id=s.id
    where s.status in ('Confirmed','Completed') and s.sale_date between p_date_from and p_date_to
    union all
    select 'Paid Service'::text, coalesce(sum(sf.revenue),0)::numeric
    from public.services s join private.service_financial_rows() sf on sf.service_id=s.id
    where s.status='Completed' and s.service_date between p_date_from and p_date_to
    union all
    select 'AMC'::text, coalesce(sum(ac.agreed_price),0)::numeric
    from public.amc_cycles ac
    where ac.status in ('Active','Expired') and ac.start_date between p_date_from and p_date_to
  ), costs as (
    select * from private.economic_cost_attribution(p_date_from,p_date_to)
  ), category_costs as (
    select c.category,
      coalesce(sum(x.amount) filter (where x.amount_known and x.source_type='Sale' and x.cost_type='Product'),0)::numeric product_cost,
      coalesce(sum(x.amount) filter (where x.amount_known and x.source_type='Installation'),0)::numeric installation_direct_cost,
      coalesce(sum(x.amount) filter (where x.amount_known and x.source_type='Service' and x.cost_type='Item' and c.category='Product Sales'),0)::numeric warranty_direct_cost,
      coalesce(sum(x.amount) filter (where x.amount_known and x.source_type='Service' and x.cost_type='Item' and c.category<>'Product Sales'),0)::numeric service_item_direct_cost,
      coalesce(sum(x.amount) filter (where x.amount_known and x.source_type='Service' and x.cost_type in ('Technician','Travel','Other')),0)::numeric shared_direct_cost,
      coalesce(sum(x.amount) filter (where x.amount_known),0)::numeric known_direct_cost,
      count(*) filter (where not x.amount_known)::bigint unknown_cost_count
    from categories c left join costs x on x.economic_bucket=c.category
    where c.category<>'Consolidated'
    group by c.category
  ), rows as (
    select c.category,c.sort_order,coalesce(r.amount,0)::numeric revenue,
      cc.product_cost,cc.installation_direct_cost,cc.warranty_direct_cost,cc.service_item_direct_cost,cc.shared_direct_cost,cc.known_direct_cost,cc.unknown_cost_count
    from categories c left join revenue r on r.category=c.category left join category_costs cc on cc.category=c.category
    where c.category<>'Consolidated'
  ), consolidated as (
    select 'Consolidated'::text category,6 sort_order,
      coalesce(sum(revenue) filter (where category in ('Product Sales','Paid Service','AMC')),0)::numeric revenue,
      coalesce(sum(product_cost),0)::numeric product_cost,coalesce(sum(installation_direct_cost),0)::numeric installation_direct_cost,
      coalesce(sum(warranty_direct_cost),0)::numeric warranty_direct_cost,coalesce(sum(service_item_direct_cost),0)::numeric service_item_direct_cost,
      coalesce(sum(shared_direct_cost),0)::numeric shared_direct_cost,coalesce(sum(known_direct_cost),0)::numeric known_direct_cost,
      coalesce(sum(unknown_cost_count),0)::bigint unknown_cost_count
    from rows
  ), all_rows as (select * from rows union all select * from consolidated)
  select category,revenue,product_cost,installation_direct_cost,warranty_direct_cost,service_item_direct_cost,shared_direct_cost,known_direct_cost,unknown_cost_count,
    revenue-known_direct_cost gross_profit,(unknown_cost_count=0) gross_profit_known
  from all_rows order by sort_order;
$$;

revoke all on function public.get_finance_performance(date,date) from public, anon;
grant execute on function public.get_finance_performance(date,date) to authenticated;
grant execute on function private.resolve_service_item_economic_attribution(uuid) to authenticated;
grant execute on function private.service_cost_attribution(uuid) to authenticated;
grant execute on function private.installation_cost_attribution() to authenticated;
grant execute on function private.sale_product_cost_attribution() to authenticated;
grant execute on function private.economic_cost_attribution(date,date) to authenticated;

