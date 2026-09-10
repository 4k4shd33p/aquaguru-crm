-- Phase 2.4: safe entry of incomplete historical business records.
-- created_at remains the CRM-entry timestamp; business-date columns remain authoritative.

alter table public.sale_items
  alter column actual_unit_price drop not null,
  alter column discount drop not null;

insert into public.payment_methods (name, is_active)
values ('Unknown / Not Recorded', true)
on conflict (name) do update set is_active = true;

create or replace function private.activate_sale_origin_equipment_warranty()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_sale_id uuid;
  v_warranty_months integer;
  v_end_date date;
begin
  if new.installation_classification <> 'Initial Installation'
     or new.status <> 'Completed'
     or new.installation_date is null then
    return new;
  end if;

  select si.sale_id, si.warranty_months
    into v_sale_id, v_warranty_months
    from public.equipment e
    join public.sale_items si on si.id = e.sale_item_id
    where e.id = new.equipment_id
      and e.source = 'Aquaguru Sale'
      and e.sale_item_id = new.sale_item_id;

  if not found or v_warranty_months is null or v_warranty_months <= 0 then
    return new;
  end if;

  v_end_date := (new.installation_date + make_interval(months => v_warranty_months) - interval '1 day')::date;

  insert into public.equipment_warranties as ew (
    equipment_id, sale_id, installation_id, start_date, end_date,
    duration_months, status, is_automatic_sale_origin
  )
  values (
    new.equipment_id, v_sale_id, new.id, new.installation_date, v_end_date,
    v_warranty_months, case when v_end_date < current_date then 'Expired' else 'Active' end, true
  )
  on conflict (installation_id) where is_automatic_sale_origin do nothing;

  return new;
end;
$$;

create or replace function public.create_historical_sale_with_items(
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
  v_existing_fingerprint text;
  v_fingerprint text;
  v_item jsonb;
  v_unit_locations jsonb;
  v_reconcile_ids jsonb;
  v_sale_item_id uuid;
  v_product_model_id uuid;
  v_equipment_type_id uuid;
  v_quantity integer;
  v_standard_unit_price numeric;
  v_actual_unit_price numeric;
  v_unit_cost numeric;
  v_discount numeric;
  v_warranty_months integer;
  v_location_id uuid;
  v_reconcile_equipment_id uuid;
  v_equipment_id uuid;
  v_equipment_code text;
  v_unit_index integer;
begin
  if p_submission_key is null or p_customer_id is null or p_sale_date is null then
    raise exception using errcode = '22004', message = 'submission_key, customer_id, and the actual historical sale date are required';
  end if;
  if p_status not in ('Draft', 'Confirmed', 'Completed', 'Cancelled', 'Void', 'Unknown') then
    raise exception using errcode = '22023', message = 'sale status is not supported';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'items must be a non-empty JSON array';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'customer_id', p_customer_id, 'sale_date', p_sale_date, 'status', p_status,
    'invoice_number', nullif(btrim(p_invoice_number), ''),
    'invoice_date', p_invoice_date, 'lead_source_id', p_lead_source_id,
    'source_detail', nullif(btrim(p_source_detail), ''),
    'notes', nullif(btrim(p_notes), ''), 'items', p_items
  )::text);

  insert into public.sales as s (
    submission_key, submission_fingerprint, customer_id, sale_date, status,
    invoice_number, invoice_date, lead_source_id, source_detail, notes
  )
  values (
    p_submission_key, v_fingerprint, p_customer_id, p_sale_date, p_status,
    nullif(btrim(p_invoice_number), ''), p_invoice_date, p_lead_source_id,
    nullif(btrim(p_source_detail), ''), nullif(btrim(p_notes), '')
  )
  on conflict (submission_key) do nothing
  returning s.id, s.sale_code into v_sale_id, v_sale_code;

  if not found then
    select s.id, s.sale_code, s.submission_fingerprint
      into v_sale_id, v_sale_code, v_existing_fingerprint
      from public.sales s where s.submission_key = p_submission_key;
    if not found then
      raise exception using errcode = '23505', message = 'submission_key conflict could not be resolved';
    end if;
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = '23505', message = 'submission_key already belongs to a different historical sale request';
    end if;
    return query
      select v_sale_id, v_sale_code, false, e.sale_item_id, e.id, e.equipment_code
      from public.equipment e
      where e.sale_item_id in (select si.id from public.sale_items si where si.sale_id = v_sale_id)
      order by e.sale_item_id, e.equipment_code;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'each sale item must be a JSON object';
    end if;
    v_product_model_id := nullif(v_item ->> 'product_model_id', '')::uuid;
    v_quantity := nullif(v_item ->> 'quantity', '')::integer;
    v_standard_unit_price := nullif(v_item ->> 'standard_unit_price', '')::numeric;
    v_actual_unit_price := nullif(v_item ->> 'actual_unit_price', '')::numeric;
    v_unit_cost := nullif(v_item ->> 'unit_cost', '')::numeric;
    v_discount := nullif(v_item ->> 'discount', '')::numeric;
    v_warranty_months := nullif(v_item ->> 'warranty_months', '')::integer;

    if v_product_model_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception using errcode = '22004', message = 'product_model_id and a positive quantity are required for every sale item';
    end if;
    if p_status in ('Confirmed', 'Completed') and v_actual_unit_price is null then
      raise exception using errcode = '23514', message = 'a confirmed historical sale requires a known selling price; use Draft or Unknown until it is known';
    end if;
    if coalesce(v_standard_unit_price, 0) < 0 or coalesce(v_actual_unit_price, 0) < 0
       or coalesce(v_unit_cost, 0) < 0 or coalesce(v_discount, 0) < 0
       or (v_warranty_months is not null and v_warranty_months < 0) then
      raise exception using errcode = '22023', message = 'historical money and warranty values cannot be negative';
    end if;

    if v_item ? 'unit_locations' then
      v_unit_locations := v_item -> 'unit_locations';
      if jsonb_typeof(v_unit_locations) <> 'array' or jsonb_array_length(v_unit_locations) <> v_quantity then
        raise exception using errcode = '22023', message = 'unit_locations must contain exactly one entry per quantity unit';
      end if;
    else
      v_unit_locations := jsonb_build_array();
    end if;
    if v_item ? 'reconcile_equipment_ids' then
      v_reconcile_ids := v_item -> 'reconcile_equipment_ids';
      if jsonb_typeof(v_reconcile_ids) <> 'array' or jsonb_array_length(v_reconcile_ids) <> v_quantity then
        raise exception using errcode = '22023', message = 'reconcile_equipment_ids must contain exactly one entry per quantity unit';
      end if;
    else
      v_reconcile_ids := jsonb_build_array();
    end if;

    select pm.equipment_type_id into v_equipment_type_id
      from public.product_models pm where pm.id = v_product_model_id;
    if not found then
      raise exception using errcode = '23503', message = 'product_model_id does not reference an available product model';
    end if;

    insert into public.sale_items (
      sale_id, product_model_id, quantity, standard_unit_price,
      actual_unit_price, unit_cost, discount, warranty_months, notes
    ) values (
      v_sale_id, v_product_model_id, v_quantity, v_standard_unit_price,
      v_actual_unit_price, v_unit_cost, v_discount, v_warranty_months,
      nullif(btrim(v_item ->> 'notes'), '')
    ) returning id into v_sale_item_id;

    for v_unit_index in 0..v_quantity - 1 loop
      v_location_id := case when jsonb_array_length(v_unit_locations) > v_unit_index then nullif(v_unit_locations ->> v_unit_index, '')::uuid else null end;
      v_reconcile_equipment_id := case when jsonb_array_length(v_reconcile_ids) > v_unit_index then nullif(v_reconcile_ids ->> v_unit_index, '')::uuid else null end;

      if v_location_id is not null and not exists (
        select 1 from public.locations l where l.id = v_location_id and l.customer_id = p_customer_id
      ) then
        raise exception using errcode = '23503', message = 'each equipment location must belong to the historical sale customer';
      end if;

      if v_reconcile_equipment_id is not null then
        update public.equipment e
           set sale_item_id = v_sale_item_id, source = 'Aquaguru Sale',
               location_id = coalesce(v_location_id, e.location_id)
         where e.id = v_reconcile_equipment_id
           and e.customer_id = p_customer_id
           and e.product_model_id = v_product_model_id
           and e.sale_item_id is null
         returning e.id, e.equipment_code into v_equipment_id, v_equipment_code;
        if not found then
          raise exception using errcode = '23514', message = 'selected existing equipment cannot be reconciled to this historical sale';
        end if;
      else
        if exists (
          select 1 from public.equipment e
          where e.customer_id = p_customer_id
            and e.product_model_id = v_product_model_id
            and e.sale_item_id is null
            and e.location_id is not distinct from v_location_id
        ) then
          raise exception using errcode = '23514',
            message = 'matching existing equipment is already recorded; select it for reconciliation instead of creating a duplicate';
        end if;
        insert into public.equipment as e (
          customer_id, location_id, equipment_type_id, product_model_id, sale_item_id, source
        ) values (
          p_customer_id, v_location_id, v_equipment_type_id, v_product_model_id, v_sale_item_id, 'Aquaguru Sale'
        ) returning e.id, e.equipment_code into v_equipment_id, v_equipment_code;
      end if;

      sale_id := v_sale_id; sale_code := v_sale_code; created := true;
      sale_item_id := v_sale_item_id; equipment_id := v_equipment_id; equipment_code := v_equipment_code;
      return next;
    end loop;
  end loop;
end;
$$;

revoke all on function public.create_historical_sale_with_items(uuid,uuid,date,text,jsonb,text,date,uuid,text,text) from public;
revoke all on function public.create_historical_sale_with_items(uuid,uuid,date,text,jsonb,text,date,uuid,text,text) from anon;
grant execute on function public.create_historical_sale_with_items(uuid,uuid,date,text,jsonb,text,date,uuid,text,text) to authenticated;
