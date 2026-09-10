-- Phase 3.2.1A: derived cross-module direct-cost attribution.
-- Revenue and payment ledgers remain authoritative in their existing tables/functions.

alter table public.installations
  add column if not exists travel_cost numeric,
  add column if not exists other_direct_cost numeric,
  add column if not exists other_direct_cost_note text,
  add constraint installations_travel_cost_check check (travel_cost is null or travel_cost >= 0),
  add constraint installations_other_direct_cost_check check (other_direct_cost is null or other_direct_cost >= 0);

create table if not exists public.service_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  cost_type text not null check (cost_type in ('Technician', 'Travel', 'Other')),
  economic_bucket text not null check (economic_bucket in ('Product Sales', 'Paid Service', 'AMC', 'Complimentary / Goodwill', 'Unallocated')),
  amount numeric not null check (amount >= 0),
  source_service_item_id uuid references public.service_items(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete restrict,
  paid_service_id uuid references public.services(id) on delete restrict,
  amc_cycle_id uuid references public.amc_cycles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (economic_bucket = 'Unallocated' and source_service_item_id is null and sale_id is null and paid_service_id is null and amc_cycle_id is null)
    or economic_bucket <> 'Unallocated'
  )
);

create index if not exists service_cost_allocations_service_cost_type_idx
  on public.service_cost_allocations (service_id, cost_type);

alter table public.service_cost_allocations enable row level security;
revoke all on table public.service_cost_allocations from public, anon;
grant select, insert, update, delete on table public.service_cost_allocations to authenticated;
create policy authenticated_crm_access on public.service_cost_allocations
  for all to authenticated using (true) with check (true);

create or replace function private.resolve_service_item_economic_attribution(p_service_item_id uuid)
returns table (
  economic_bucket text,
  sale_id uuid,
  paid_service_id uuid,
  amc_cycle_id uuid,
  source_service_item_id uuid,
  attribution_known boolean,
  attribution_reason text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_item_id uuid := p_service_item_id;
  v_seen uuid[] := array[]::uuid[];
  v_coverage text;
  v_service_id uuid;
  v_amc_id uuid;
  v_equipment_warranty_id uuid;
  v_part_warranty_id uuid;
  v_sale_id uuid;
  v_source_item_id uuid;
begin
  loop
    if v_item_id is null or v_item_id = any(v_seen) then
      return query select 'Unallocated'::text, null::uuid, null::uuid, null::uuid, p_service_item_id, false, 'Missing or cyclic warranty source'::text;
      return;
    end if;
    v_seen := array_append(v_seen, v_item_id);

    select si.coverage_type, si.service_id, si.amc_cycle_id, si.equipment_warranty_id, si.service_item_warranty_id
      into v_coverage, v_service_id, v_amc_id, v_equipment_warranty_id, v_part_warranty_id
    from public.service_items si where si.id = v_item_id;
    if not found then
      return query select 'Unallocated'::text, null::uuid, null::uuid, null::uuid, p_service_item_id, false, 'Service item not found'::text;
      return;
    end if;

    if v_coverage = 'Paid' then
      return query select 'Paid Service'::text, null::uuid, v_service_id, null::uuid, v_item_id, true, 'Paid service item'::text;
      return;
    elsif v_coverage = 'AMC' and v_amc_id is not null then
      return query select 'AMC'::text, null::uuid, null::uuid, v_amc_id, v_item_id, true, 'AMC-covered service item'::text;
      return;
    elsif v_coverage = 'Equipment Warranty' then
      select coalesce(ew.sale_id, sale_item.sale_id)
        into v_sale_id
      from public.service_items si
      join public.services s on s.id = si.service_id
      join public.equipment e on e.id = s.equipment_id
      left join public.equipment_warranties ew on ew.id = si.equipment_warranty_id
      left join public.sale_items sale_item on sale_item.id = e.sale_item_id
      where si.id = v_item_id;
      if v_sale_id is not null then
        return query select 'Product Sales'::text, v_sale_id, null::uuid, null::uuid, v_item_id, true, 'Equipment warranty sale link'::text;
      end if;
      return query select 'Unallocated'::text, null::uuid, null::uuid, null::uuid, v_item_id, false, 'Equipment warranty has no deterministic sale'::text;
      return;
    elsif v_coverage = 'Part Warranty' then
      select siw.service_item_id into v_source_item_id
      from public.service_item_warranties siw
      where siw.id = v_part_warranty_id;
      if v_source_item_id is null then
        return query select 'Unallocated'::text, null::uuid, null::uuid, null::uuid, v_item_id, false, 'Part warranty source is unavailable'::text;
        return;
      end if;
      v_item_id := v_source_item_id;
    elsif v_coverage = 'Complimentary' then
      return query select 'Complimentary / Goodwill'::text, null::uuid, null::uuid, null::uuid, v_item_id, true, 'Complimentary service item'::text;
      return;
    else
      return query select 'Unallocated'::text, null::uuid, null::uuid, null::uuid, v_item_id, false, 'Coverage is Other or unresolved'::text;
      return;
    end if;
  end loop;
end;
$$;

create or replace function private.validate_service_cost_allocation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cost numeric;
  v_allocated numeric;
  v_attr record;
begin
  if new.economic_bucket = 'Unallocated' then
    new.source_service_item_id := null;
    new.sale_id := null;
    new.paid_service_id := null;
    new.amc_cycle_id := null;
  else
    if new.source_service_item_id is null then
      raise exception 'a deterministic source service item is required for % allocation', new.economic_bucket using errcode = '23514';
    end if;
    if not exists (select 1 from public.service_items si where si.id = new.source_service_item_id and si.service_id = new.service_id) then
      raise exception 'allocation source item must belong to the allocation service' using errcode = '23514';
    end if;
    select * into v_attr from private.resolve_service_item_economic_attribution(new.source_service_item_id);
    if not v_attr.attribution_known or v_attr.economic_bucket <> new.economic_bucket then
      raise exception 'allocation bucket does not match the deterministic source-item attribution' using errcode = '23514';
    end if;
    new.sale_id := v_attr.sale_id;
    new.paid_service_id := v_attr.paid_service_id;
    new.amc_cycle_id := v_attr.amc_cycle_id;
  end if;

  select case new.cost_type when 'Technician' then s.technician_charge when 'Travel' then s.travel_cost else s.other_direct_cost end
    into v_cost from public.services s where s.id = new.service_id for update;
  if v_cost is null then
    raise exception '% shared cost is unknown; it cannot be allocated', new.cost_type using errcode = '23514';
  end if;
  select coalesce(sum(a.amount), 0) into v_allocated
  from public.service_cost_allocations a
  where a.service_id = new.service_id and a.cost_type = new.cost_type and a.id is distinct from new.id;
  if v_allocated + new.amount > v_cost then
    raise exception 'allocated % cost exceeds the authoritative service-level cost', new.cost_type using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_service_cost_allocation on public.service_cost_allocations;
create trigger validate_service_cost_allocation before insert or update on public.service_cost_allocations
  for each row execute function private.validate_service_cost_allocation();

create or replace function private.service_cost_attribution(p_service_id uuid default null)
returns table (
  event_date date,
  service_id uuid,
  source_service_item_id uuid,
  cost_type text,
  economic_bucket text,
  sale_id uuid,
  paid_service_id uuid,
  amc_cycle_id uuid,
  amount numeric,
  amount_known boolean,
  attribution_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with active_services as (
    select s.* from public.services s
    where (p_service_id is null or s.id = p_service_id)
      and s.status not in ('Cancelled', 'Void')
  ), item_events as (
    select s.service_date, s.id service_id, si.id source_service_item_id, 'Item'::text cost_type,
           a.economic_bucket, a.sale_id, a.paid_service_id, a.amc_cycle_id,
           case when si.internal_cost is null then null else si.internal_cost * si.quantity end amount,
           (si.internal_cost is not null) amount_known, a.attribution_reason
    from active_services s join public.service_items si on si.service_id=s.id
    cross join lateral private.resolve_service_item_economic_attribution(si.id) a
  ), shared_source as (
    select s.id service_id, s.service_date, x.cost_type, x.cost,
      count(*) filter (where a.attribution_known and a.economic_bucket <> 'Unallocated') as resolved_lines,
      count(*) filter (where not a.attribution_known or a.economic_bucket = 'Unallocated') as unresolved_lines,
      count(distinct concat_ws('|',a.economic_bucket,a.sale_id::text,a.paid_service_id::text,a.amc_cycle_id::text)) filter (where a.attribution_known and a.economic_bucket <> 'Unallocated') as target_count,
      min(a.economic_bucket) filter (where a.attribution_known and a.economic_bucket <> 'Unallocated') as pure_bucket,
      (min(a.sale_id::text) filter (where a.attribution_known and a.economic_bucket <> 'Unallocated'))::uuid as pure_sale_id,
      (min(a.paid_service_id::text) filter (where a.attribution_known and a.economic_bucket <> 'Unallocated'))::uuid as pure_paid_service_id,
      (min(a.amc_cycle_id::text) filter (where a.attribution_known and a.economic_bucket <> 'Unallocated'))::uuid as pure_amc_cycle_id
    from active_services s
    cross join lateral (values ('Technician'::text,s.technician_charge),('Travel'::text,s.travel_cost),('Other'::text,s.other_direct_cost)) x(cost_type,cost)
    left join public.service_items si on si.service_id=s.id
    left join lateral private.resolve_service_item_economic_attribution(si.id) a on si.id is not null
    group by s.id,s.service_date,x.cost_type,x.cost
  ), pure_shared as (
    select service_date event_date, service_id, null::uuid source_service_item_id, cost_type, pure_bucket economic_bucket,
           pure_sale_id sale_id, pure_paid_service_id paid_service_id, pure_amc_cycle_id amc_cycle_id,
           cost amount, (cost is not null) amount_known, 'Pure service shared cost'::text attribution_reason
    from shared_source where unresolved_lines=0 and resolved_lines>0 and target_count=1
  ), mixed_allocations as (
    select ss.service_date event_date, a.service_id, a.source_service_item_id, a.cost_type, a.economic_bucket,
           a.sale_id, a.paid_service_id, a.amc_cycle_id, a.amount, true amount_known, 'Explicit shared-cost allocation'::text attribution_reason
    from shared_source ss join public.service_cost_allocations a on a.service_id=ss.service_id and a.cost_type=ss.cost_type
    where not (ss.unresolved_lines=0 and ss.resolved_lines>0 and ss.target_count=1)
  ), mixed_remainder as (
    select ss.service_date event_date, ss.service_id, null::uuid source_service_item_id, ss.cost_type,
           'Unallocated'::text economic_bucket, null::uuid sale_id, null::uuid paid_service_id, null::uuid amc_cycle_id,
           case when ss.cost is null then null else ss.cost - coalesce((select sum(a.amount) from public.service_cost_allocations a where a.service_id=ss.service_id and a.cost_type=ss.cost_type),0) end amount,
           (ss.cost is not null) amount_known,
           case when ss.cost is null then 'Unknown shared cost' else 'Mixed or unresolved shared-cost remainder' end attribution_reason
    from shared_source ss where not (ss.unresolved_lines=0 and ss.resolved_lines>0 and ss.target_count=1)
  )
  select * from item_events
  union all select * from pure_shared
  union all select * from mixed_allocations
  union all select * from mixed_remainder;
$$;

create or replace function private.installation_cost_attribution()
returns table (
  event_date date,
  installation_id uuid,
  cost_type text,
  economic_bucket text,
  sale_id uuid,
  amount numeric,
  amount_known boolean,
  attribution_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.installation_date, i.id, c.cost_type,
    case when si.sale_id is not null then 'Product Sales' else 'Unallocated' end,
    si.sale_id, c.amount, (c.amount is not null),
    case when si.sale_id is not null then 'Initial installation of sale-generated equipment' else 'No originating Aquaguru sale' end
  from public.installations i
  join public.equipment e on e.id=i.equipment_id
  left join public.sale_items si on si.id=e.sale_item_id
  cross join lateral (values ('Technician'::text,i.technician_charge),('Travel'::text,i.travel_cost),('Other'::text,i.other_direct_cost)) c(cost_type,amount)
  where i.installation_classification='Initial Installation'
    and i.status='Completed' and i.installation_date is not null;
$$;

create or replace function private.sale_product_cost_attribution()
returns table (
  event_date date,
  sale_id uuid,
  sale_item_id uuid,
  amount numeric,
  amount_known boolean,
  attribution_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.sale_date, s.id, si.id,
    case when si.unit_cost is null then null else si.unit_cost * si.quantity end,
    (si.unit_cost is not null), 'Sale item product cost'::text
  from public.sales s join public.sale_items si on si.sale_id=s.id
  where s.status not in ('Cancelled', 'Void');
$$;

create or replace function private.economic_cost_attribution(p_from date default null, p_to date default null)
returns table (
  event_date date,
  source_type text,
  source_id uuid,
  source_service_item_id uuid,
  cost_type text,
  economic_bucket text,
  sale_id uuid,
  paid_service_id uuid,
  amc_cycle_id uuid,
  amount numeric,
  amount_known boolean,
  attribution_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.event_date,'Service'::text,x.service_id,x.source_service_item_id,x.cost_type,x.economic_bucket,x.sale_id,x.paid_service_id,x.amc_cycle_id,x.amount,x.amount_known,x.attribution_reason
  from private.service_cost_attribution(null) x
  where (p_from is null or x.event_date >= p_from) and (p_to is null or x.event_date <= p_to)
  union all
  select x.event_date,'Sale'::text,x.sale_id,x.sale_item_id,'Product'::text,'Product Sales'::text,x.sale_id,null::uuid,null::uuid,x.amount,x.amount_known,x.attribution_reason
  from private.sale_product_cost_attribution() x
  where (p_from is null or x.event_date >= p_from) and (p_to is null or x.event_date <= p_to)
  union all
  select x.event_date,'Installation'::text,x.installation_id,null::uuid,x.cost_type,x.economic_bucket,x.sale_id,null::uuid,null::uuid,x.amount,x.amount_known,x.attribution_reason
  from private.installation_cost_attribution() x
  where (p_from is null or x.event_date >= p_from) and (p_to is null or x.event_date <= p_to);
$$;

revoke all on function private.resolve_service_item_economic_attribution(uuid) from public;
revoke all on function private.service_cost_attribution(uuid) from public;
revoke all on function private.installation_cost_attribution() from public;
revoke all on function private.sale_product_cost_attribution() from public;
revoke all on function private.economic_cost_attribution(date,date) from public;

