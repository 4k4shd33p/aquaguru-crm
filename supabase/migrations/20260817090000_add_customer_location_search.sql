-- Read-only, RLS-respecting customer search surface for the Customers module.
-- This function deliberately runs as the caller, so existing authenticated CRM RLS
-- policies continue to govern every row it can return.
create or replace function public.search_customers(
  p_search_text text default null,
  p_customer_type_id uuid default null,
  p_is_active boolean default null,
  p_city text default null,
  p_area text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  id uuid,
  customer_code text,
  name text,
  customer_type_id uuid,
  customer_type_name text,
  phone text,
  alternate_phone text,
  email text,
  notes text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  representative_area text,
  representative_city text,
  representative_pincode text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with inputs as (
    select
      nullif(btrim(p_search_text), '') as search_text,
      nullif(btrim(p_city), '') as city,
      nullif(btrim(p_area), '') as area
  ),
  filtered_customers as (
    select
      c.id,
      c.customer_code,
      c.name,
      c.customer_type_id,
      ct.name as customer_type_name,
      c.phone,
      c.alternate_phone,
      c.email,
      c.notes,
      c.is_active,
      c.created_at,
      c.updated_at,
      representative_location.area as representative_area,
      representative_location.city as representative_city,
      representative_location.pincode as representative_pincode
    from public.customers c
    left join public.customer_types ct on ct.id = c.customer_type_id
    cross join inputs i
    left join lateral (
      select l.area, l.city, l.pincode
      from public.locations l
      where l.customer_id = c.id
        and l.is_active
      order by l.created_at asc, l.id asc
      limit 1
    ) representative_location on true
    where (p_customer_type_id is null or c.customer_type_id = p_customer_type_id)
      and (p_is_active is null or c.is_active = p_is_active)
      and (
        i.search_text is null
        or c.name ilike '%' || i.search_text || '%'
        or c.phone ilike '%' || i.search_text || '%'
        or c.customer_code ilike '%' || i.search_text || '%'
        or exists (
          select 1
          from public.locations l
          where l.customer_id = c.id
            and l.is_active
            and (
              l.area ilike '%' || i.search_text || '%'
              or l.city ilike '%' || i.search_text || '%'
              or l.pincode ilike '%' || i.search_text || '%'
            )
        )
      )
      and (
        i.city is null
        or exists (
          select 1
          from public.locations l
          where l.customer_id = c.id
            and l.is_active
            and lower(btrim(l.city)) = lower(i.city)
        )
      )
      and (
        i.area is null
        or exists (
          select 1
          from public.locations l
          where l.customer_id = c.id
            and l.is_active
            and lower(btrim(l.area)) = lower(i.area)
        )
      )
  )
  select
    f.*,
    count(*) over ()::bigint as total_count
  from filtered_customers f
  order by f.created_at desc, f.id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.search_customers(text, uuid, boolean, text, text, integer, integer) from public, anon;
grant execute on function public.search_customers(text, uuid, boolean, text, text, integer, integer) to authenticated;
