-- Atomic, idempotent sale creation with one equipment record per sold unit.

alter table public.sales
  add column submission_key uuid,
  add constraint sales_submission_key_key unique (submission_key);

alter table public.equipment
  add column sale_item_id uuid references public.sale_items(id) on delete restrict;

create index equipment_sale_item_id_idx on public.equipment(sale_item_id);

create or replace function public.create_sale_with_items(
  p_submission_key uuid,
  p_customer_id uuid,
  p_sale_date date,
  p_status text,
  p_items jsonb,
  p_invoice_number text default null,
  p_invoice_date date default null,
  p_lead_source_id uuid default null,
  p_source_detail text default null,
  p_notes text default null
)
returns table (
  sale_id uuid,
  sale_code text,
  created boolean,
  sale_item_id uuid,
  equipment_id uuid,
  equipment_code text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_sale_id uuid;
  v_sale_code text;
  v_created boolean := false;
  v_item jsonb;
  v_unit_locations jsonb;
  v_sale_item_id uuid;
  v_product_model_id uuid;
  v_equipment_type_id uuid;
  v_quantity integer;
  v_standard_unit_price numeric;
  v_actual_unit_price numeric;
  v_unit_cost numeric;
  v_discount numeric;
  v_location_id uuid;
  v_equipment_id uuid;
  v_equipment_code text;
  v_unit_index integer;
begin
  if p_submission_key is null then
    raise exception using errcode = '22004', message = 'submission_key is required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'items must be a non-empty JSON array';
  end if;

  insert into public.sales (
    submission_key,
    customer_id,
    sale_date,
    status,
    invoice_number,
    invoice_date,
    lead_source_id,
    source_detail,
    notes
  )
  values (
    p_submission_key,
    p_customer_id,
    p_sale_date,
    p_status,
    nullif(btrim(p_invoice_number), ''),
    p_invoice_date,
    p_lead_source_id,
    nullif(btrim(p_source_detail), ''),
    nullif(btrim(p_notes), '')
  )
  on conflict (submission_key) do nothing
  returning id, sale_code into v_sale_id, v_sale_code;

  if not found then
    select s.id, s.sale_code
      into v_sale_id, v_sale_code
      from public.sales s
      where s.submission_key = p_submission_key;

    return query
      select v_sale_id, v_sale_code, false, e.sale_item_id, e.id, e.equipment_code
      from public.equipment e
      where e.sale_item_id in (
        select si.id from public.sale_items si where si.sale_id = v_sale_id
      )
      order by e.sale_item_id, e.equipment_code;
    return;
  end if;

  v_created := true;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'each sale item must be a JSON object';
    end if;

    v_product_model_id := nullif(v_item ->> 'product_model_id', '')::uuid;
    v_quantity := nullif(v_item ->> 'quantity', '')::integer;
    v_standard_unit_price := nullif(v_item ->> 'standard_unit_price', '')::numeric;
    v_actual_unit_price := nullif(v_item ->> 'actual_unit_price', '')::numeric;
    v_unit_cost := nullif(v_item ->> 'unit_cost', '')::numeric;
    v_discount := coalesce(nullif(v_item ->> 'discount', '')::numeric, 0);

    if v_product_model_id is null or v_quantity is null or v_actual_unit_price is null then
      raise exception using errcode = '22004', message = 'product_model_id, quantity, and actual_unit_price are required for every sale item';
    end if;

    if v_quantity <= 0 then
      raise exception using errcode = '22023', message = 'sale item quantity must be greater than zero';
    end if;

    if v_item ? 'unit_locations' then
      v_unit_locations := v_item -> 'unit_locations';
      if jsonb_typeof(v_unit_locations) <> 'array' or jsonb_array_length(v_unit_locations) <> v_quantity then
        raise exception using errcode = '22023', message = 'unit_locations must contain exactly one entry per quantity unit';
      end if;
    else
      v_unit_locations := null;
    end if;

    select pm.equipment_type_id
      into v_equipment_type_id
      from public.product_models pm
      where pm.id = v_product_model_id;

    if not found then
      raise exception using errcode = '23503', message = 'product_model_id does not reference an available product model';
    end if;

    insert into public.sale_items (
      sale_id,
      product_model_id,
      quantity,
      standard_unit_price,
      actual_unit_price,
      unit_cost,
      discount,
      notes
    )
    values (
      v_sale_id,
      v_product_model_id,
      v_quantity,
      v_standard_unit_price,
      v_actual_unit_price,
      v_unit_cost,
      v_discount,
      nullif(btrim(v_item ->> 'notes'), '')
    )
    returning id into v_sale_item_id;

    for v_unit_index in 0..v_quantity - 1 loop
      v_location_id := null;

      if v_unit_locations is not null then
        v_location_id := nullif(v_unit_locations ->> v_unit_index, '')::uuid;
      end if;

      if v_location_id is not null and not exists (
        select 1
        from public.locations l
        where l.id = v_location_id
          and l.customer_id = p_customer_id
      ) then
        raise exception using errcode = '23503', message = 'each equipment location must belong to the sale customer';
      end if;

      insert into public.equipment (
        customer_id,
        location_id,
        equipment_type_id,
        product_model_id,
        sale_item_id,
        source
      )
      values (
        p_customer_id,
        v_location_id,
        v_equipment_type_id,
        v_product_model_id,
        v_sale_item_id,
        'Aquaguru Sale'
      )
      returning id, equipment_code into v_equipment_id, v_equipment_code;

      sale_id := v_sale_id;
      sale_code := v_sale_code;
      created := v_created;
      sale_item_id := v_sale_item_id;
      equipment_id := v_equipment_id;
      equipment_code := v_equipment_code;
      return next;
    end loop;
  end loop;
end;
$$;

revoke all on function public.create_sale_with_items(uuid, uuid, date, text, jsonb, text, date, uuid, text, text) from public;
grant execute on function public.create_sale_with_items(uuid, uuid, date, text, jsonb, text, date, uuid, text, text) to authenticated;

