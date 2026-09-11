-- Phase 3.2.1C.4: Installation / Additional Work Finance reporting.
-- Read-only reporting only. Legacy installation_charge remains excluded.

create or replace function private.economic_cost_attribution(
  p_from date default null,
  p_to date default null
)
returns table(
  event_date date, source_type text, source_id uuid, source_service_item_id uuid,
  cost_type text, economic_bucket text, sale_id uuid, paid_service_id uuid,
  amc_cycle_id uuid, amount numeric, amount_known boolean, attribution_reason text
)
language sql stable set search_path = '' as $$
  select x.event_date,'Service'::text,x.service_id,x.source_service_item_id,x.cost_type,
    x.economic_bucket,x.sale_id,x.paid_service_id,x.amc_cycle_id,x.amount,x.amount_known,x.attribution_reason
  from private.service_cost_attribution(null) x
  where (p_from is null or x.event_date >= p_from) and (p_to is null or x.event_date <= p_to)
  union all
  select x.event_date,'Sale'::text,x.sale_id,x.sale_item_id,'Product'::text,
    'Product Sales'::text,x.sale_id,null::uuid,null::uuid,x.amount,x.amount_known,x.attribution_reason
  from private.sale_product_cost_attribution() x
  where (p_from is null or x.event_date >= p_from) and (p_to is null or x.event_date <= p_to)
  union all
  select x.event_date,'Installation'::text,x.installation_id,null::uuid,x.cost_type,
    x.economic_bucket,x.sale_id,null::uuid,null::uuid,x.amount,x.amount_known,x.attribution_reason
  from private.installation_cost_attribution() x
  where (p_from is null or x.event_date >= p_from) and (p_to is null or x.event_date <= p_to)
  union all
  select x.event_date,'Installation Work'::text,x.installation_id,x.work_item_id,x.cost_type,
    x.economic_bucket,x.sale_id,null::uuid,null::uuid,x.amount,x.amount_known,x.attribution_reason
  from private.installation_work_item_cost_attribution() x
  where (p_from is null or x.event_date >= p_from) and (p_to is null or x.event_date <= p_to);
$$;

create or replace function public.get_finance_performance(p_date_from date, p_date_to date)
returns table(
  category text, revenue numeric, product_cost numeric, installation_direct_cost numeric,
  warranty_direct_cost numeric, service_item_direct_cost numeric, shared_direct_cost numeric,
  known_direct_cost numeric, unknown_cost_count bigint, gross_profit numeric, gross_profit_known boolean
)
language sql stable set search_path = '' as $$
  with categories(category, sort_order) as (
    values
      ('Product Sales'::text,1),
      ('Paid Service',2),
      ('AMC',3),
      ('Installation / Additional Work',4),
      ('Complimentary / Goodwill',5),
      ('Unallocated',6),
      ('Consolidated',7)
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
    union all
    select 'Installation / Additional Work'::text,
      coalesce(sum(wi.customer_charge) filter (where wi.commercial_treatment='Paid'),0)::numeric
    from public.installation_work_items wi
    join public.installations i on i.id=wi.installation_id
    where i.status='Completed' and i.installation_date between p_date_from and p_date_to
  ), costs as (
    select * from private.economic_cost_attribution(p_date_from,p_date_to)
  ), category_costs as (
    select c.category,
      coalesce(sum(x.amount) filter (where x.amount_known and x.source_type='Sale' and x.cost_type='Product'),0)::numeric product_cost,
      coalesce(sum(x.amount) filter (where x.amount_known and x.source_type in ('Installation','Installation Work')),0)::numeric installation_direct_cost,
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
      cc.product_cost,cc.installation_direct_cost,cc.warranty_direct_cost,
      cc.service_item_direct_cost,cc.shared_direct_cost,cc.known_direct_cost,cc.unknown_cost_count
    from categories c
    left join revenue r on r.category=c.category
    left join category_costs cc on cc.category=c.category
    where c.category<>'Consolidated'
  ), consolidated as (
    select 'Consolidated'::text category,7 sort_order,
      coalesce(sum(revenue) filter (where category in ('Product Sales','Paid Service','AMC','Installation / Additional Work')),0)::numeric revenue,
      coalesce(sum(product_cost),0)::numeric product_cost,
      coalesce(sum(installation_direct_cost),0)::numeric installation_direct_cost,
      coalesce(sum(warranty_direct_cost),0)::numeric warranty_direct_cost,
      coalesce(sum(service_item_direct_cost),0)::numeric service_item_direct_cost,
      coalesce(sum(shared_direct_cost),0)::numeric shared_direct_cost,
      coalesce(sum(known_direct_cost),0)::numeric known_direct_cost,
      coalesce(sum(unknown_cost_count),0)::bigint unknown_cost_count
    from rows
  ), all_rows as (
    select * from rows union all select * from consolidated
  )
  select category,revenue,product_cost,installation_direct_cost,warranty_direct_cost,
    service_item_direct_cost,shared_direct_cost,known_direct_cost,unknown_cost_count,
    revenue-known_direct_cost gross_profit,(unknown_cost_count=0) gross_profit_known
  from all_rows
  order by sort_order;
$$;

create or replace function public.get_installation_finance_summary(p_date_from date, p_date_to date)
returns table(
  installation_value numeric,
  installation_collections numeric,
  installation_outstanding_as_of numeric
)
language sql stable set search_path = 'public', 'pg_temp' as $$
  with completed_installations as (
    select i.id,i.installation_date,
      coalesce(sum(wi.customer_charge) filter (where wi.commercial_treatment='Paid'),0)::numeric as value
    from public.installations i
    left join public.installation_work_items wi on wi.installation_id=i.id
    where i.status='Completed' and i.installation_date is not null
    group by i.id,i.installation_date
  ), period_value as (
    select coalesce(sum(value),0)::numeric as value
    from completed_installations
    where installation_date between p_date_from and p_date_to
  ), period_collections as (
    select coalesce(sum(ip.amount),0)::numeric as value
    from public.installation_payments ip
    join completed_installations ci on ci.id=ip.installation_id
    where ip.payment_status='Valid' and ip.payment_date between p_date_from and p_date_to
  ), outstanding as (
    select coalesce(sum(ci.value),0)::numeric
      - coalesce((
        select sum(ip.amount)
        from public.installation_payments ip
        join completed_installations pci on pci.id=ip.installation_id
        where ip.payment_status='Valid' and ip.payment_date<=p_date_to
      ),0)::numeric as value
    from completed_installations ci
    where ci.installation_date<=p_date_to
  )
  select pv.value,pc.value,o.value
  from period_value pv cross join period_collections pc cross join outstanding o;
$$;

create or replace function public.get_equipment_lifetime_economics(p_equipment_id uuid)
returns table(
  equipment_id uuid,
  sale_id uuid,
  product_revenue numeric,
  paid_installation_revenue numeric,
  product_cost numeric,
  normal_installation_direct_cost numeric,
  included_absorbed_additional_work_cost numeric,
  warranty_cost numeric,
  paid_installation_direct_cost numeric,
  combined_known_direct_cost numeric,
  unknown_cost_count bigint,
  combined_gross_profit numeric,
  gross_profit_known boolean
)
language sql stable set search_path = '' as $$
  with context as (
    select e.id equipment_id,si.sale_id,si.actual_unit_price product_revenue,si.unit_cost product_cost
    from public.equipment e
    left join public.sale_items si on si.id=e.sale_item_id
    where e.id=p_equipment_id
  ), installations as (
    select i.id,i.equipment_id
    from public.installations i
    where i.equipment_id=p_equipment_id
      and i.status='Completed'
      and i.installation_classification='Initial Installation'
      and i.installation_date is not null
  ), work as (
    select wi.commercial_treatment,wi.direct_cost,wi.customer_charge
    from public.installation_work_items wi
    join installations i on i.id=wi.installation_id
  ), normal_cost as (
    select coalesce(sum(x.amount),0)::numeric amount,
      count(*) filter (where not x.amount_known)::bigint unknown_count
    from private.installation_cost_attribution() x
    join installations i on i.id=x.installation_id
  ), warranty_cost as (
    select coalesce(sum(x.amount),0)::numeric amount,
      count(*) filter (where not x.amount_known)::bigint unknown_count
    from private.service_cost_attribution(null) x
    join public.services s on s.id=x.service_id
    where s.equipment_id=p_equipment_id
      and x.economic_bucket='Product Sales'
      and x.cost_type='Item'
  ), work_cost as (
    select
      coalesce(sum(direct_cost) filter (where commercial_treatment='Included' and direct_cost is not null),0)::numeric included_cost,
      coalesce(sum(direct_cost) filter (where commercial_treatment='Paid' and direct_cost is not null),0)::numeric paid_cost,
      count(*) filter (where commercial_treatment in ('Included','Paid') and direct_cost is null)::bigint unknown_count,
      coalesce(sum(customer_charge) filter (where commercial_treatment='Paid'),0)::numeric paid_revenue
    from work
  )
  select c.equipment_id,c.sale_id,
    coalesce(c.product_revenue,0)::numeric,
    wc.paid_revenue,
    coalesce(c.product_cost,0)::numeric,
    nc.amount,wc.included_cost,wcst.amount,wc.paid_cost,
    coalesce(c.product_cost,0)+nc.amount+wc.included_cost+wcst.amount+wc.paid_cost,
    ((case when c.sale_id is not null and c.product_cost is null then 1 else 0 end)+nc.unknown_count+wc.unknown_count+wcst.unknown_count)::bigint,
    coalesce(c.product_revenue,0)+wc.paid_revenue-(coalesce(c.product_cost,0)+nc.amount+wc.included_cost+wcst.amount+wc.paid_cost),
    ((case when c.sale_id is null or c.product_cost is not null then 0 else 1 end)+nc.unknown_count+wc.unknown_count+wcst.unknown_count)=0
  from context c cross join normal_cost nc cross join warranty_cost wcst cross join work_cost wc;
$$;

revoke all on function private.installation_work_item_cost_attribution() from public, anon;
grant execute on function private.installation_work_item_cost_attribution() to authenticated;
revoke all on function public.get_installation_finance_summary(date, date) from public, anon;
grant execute on function public.get_installation_finance_summary(date, date) to authenticated;
revoke all on function public.get_equipment_lifetime_economics(uuid) from public, anon;
grant execute on function public.get_equipment_lifetime_economics(uuid) to authenticated;
notify pgrst, 'reload schema';
