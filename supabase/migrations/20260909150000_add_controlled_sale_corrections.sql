-- Phase 2.1: controlled, auditable Sale header and snapshot corrections.
-- Product/quantity, customer, equipment, payments, and downstream warranty records remain immutable.

create table public.sale_corrections (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  correction_note text,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  corrected_by uuid,
  corrected_at timestamptz not null default now()
);

create index sale_corrections_sale_corrected_at_idx
  on public.sale_corrections (sale_id, corrected_at desc);

alter table public.sale_corrections enable row level security;

revoke all on table public.sale_corrections from public;
revoke all on table public.sale_corrections from anon;
grant select, insert on table public.sale_corrections to authenticated;

create policy authenticated_read_sale_corrections
  on public.sale_corrections for select to authenticated using (true);

create policy authenticated_insert_sale_corrections
  on public.sale_corrections for insert to authenticated with check (true);

create or replace function private.require_sale_correction_context()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_setting('app.sale_correction_in_progress', true) is distinct from 'on' then
    raise exception using
      errcode = '42501',
      message = 'use correct_sale for Sale corrections';
  end if;
  return new;
end;
$$;

create trigger sales_require_correction_context
before update of sale_date, lead_source_id, invoice_number, invoice_date, source_detail, notes
on public.sales
for each row execute function private.require_sale_correction_context();

create trigger sale_items_require_correction_context
before update of standard_unit_price, actual_unit_price, unit_cost, discount, warranty_months
on public.sale_items
for each row execute function private.require_sale_correction_context();

create or replace function public.correct_sale(
  p_sale_id uuid,
  p_sale_date date,
  p_lead_source_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_source_detail text,
  p_notes text,
  p_items jsonb,
  p_correction_note text default null
)
returns table (
  sale_id uuid,
  sale_code text,
  corrected boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_sale public.sales%rowtype;
  v_before_snapshot jsonb;
  v_after_snapshot jsonb;
  v_item_count integer;
  v_requested_count integer;
  v_distinct_requested_count integer;
  v_received numeric;
  v_corrected_value numeric;
  v_financial_change boolean;
  v_any_change boolean;
  v_normalized_invoice_number text;
  v_normalized_source_detail text;
  v_normalized_notes text;
  v_normalized_correction_note text;
begin
  if p_sale_id is null then
    raise exception using errcode = '22004', message = 'sale is required';
  end if;

  if p_sale_date is null then
    raise exception using errcode = '22004', message = 'sale date is required';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'sale items must be a JSON array';
  end if;

  select s.* into v_sale
  from public.sales s
  where s.id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'sale was not found';
  end if;

  if p_lead_source_id is not null and not exists (
    select 1 from public.lead_sources ls where ls.id = p_lead_source_id
  ) then
    raise exception using errcode = '23503', message = 'lead source was not found';
  end if;

  v_normalized_invoice_number := nullif(btrim(p_invoice_number), '');
  v_normalized_source_detail := nullif(btrim(p_source_detail), '');
  v_normalized_notes := nullif(btrim(p_notes), '');
  v_normalized_correction_note := nullif(btrim(p_correction_note), '');

  select count(*) into v_item_count
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select count(*), count(distinct r.id)
    into v_requested_count, v_distinct_requested_count
  from jsonb_to_recordset(p_items) as r(
    id uuid,
    standard_unit_price numeric,
    actual_unit_price numeric,
    unit_cost numeric,
    warranty_months integer
  );

  if v_requested_count <> v_item_count
     or v_distinct_requested_count <> v_item_count
     or exists (
       select 1
       from public.sale_items si
       left join jsonb_to_recordset(p_items) as r(
         id uuid,
         standard_unit_price numeric,
         actual_unit_price numeric,
         unit_cost numeric,
         warranty_months integer
       ) on r.id = si.id
       where si.sale_id = p_sale_id and r.id is null
     ) then
    raise exception using
      errcode = '22023',
      message = 'corrections must include each existing Sale item exactly once';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as r(
      id uuid,
      standard_unit_price numeric,
      actual_unit_price numeric,
      unit_cost numeric,
      warranty_months integer
    )
    where r.actual_unit_price is null
       or r.actual_unit_price < 0
       or r.standard_unit_price < 0
       or r.unit_cost < 0
       or r.warranty_months < 0
       or (r.standard_unit_price is not null and r.standard_unit_price < r.actual_unit_price)
  ) then
    raise exception using
      errcode = '22023',
      message = 'prices and warranty months must be valid; usual price cannot be below selling price';
  end if;

  select jsonb_build_object(
    'sale', jsonb_build_object(
      'sale_date', v_sale.sale_date,
      'lead_source_id', v_sale.lead_source_id,
      'invoice_number', v_sale.invoice_number,
      'invoice_date', v_sale.invoice_date,
      'source_detail', v_sale.source_detail,
      'notes', v_sale.notes
    ),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', si.id,
      'product_model_id', si.product_model_id,
      'quantity', si.quantity,
      'standard_unit_price', si.standard_unit_price,
      'actual_unit_price', si.actual_unit_price,
      'unit_cost', si.unit_cost,
      'discount', si.discount,
      'warranty_months', si.warranty_months
    ) order by si.id), '[]'::jsonb)
  ) into v_before_snapshot
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select jsonb_build_object(
    'sale', jsonb_build_object(
      'sale_date', p_sale_date,
      'lead_source_id', p_lead_source_id,
      'invoice_number', v_normalized_invoice_number,
      'invoice_date', p_invoice_date,
      'source_detail', v_normalized_source_detail,
      'notes', v_normalized_notes
    ),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', si.id,
      'product_model_id', si.product_model_id,
      'quantity', si.quantity,
      'standard_unit_price', r.standard_unit_price,
      'actual_unit_price', r.actual_unit_price,
      'unit_cost', r.unit_cost,
      'discount', greatest(coalesce(r.standard_unit_price, r.actual_unit_price) - r.actual_unit_price, 0),
      'warranty_months', r.warranty_months
    ) order by si.id), '[]'::jsonb)
  ) into v_after_snapshot
  from public.sale_items si
  join jsonb_to_recordset(p_items) as r(
    id uuid,
    standard_unit_price numeric,
    actual_unit_price numeric,
    unit_cost numeric,
    warranty_months integer
  ) on r.id = si.id
  where si.sale_id = p_sale_id;

  v_financial_change := exists (
    select 1
    from public.sale_items si
    join jsonb_to_recordset(p_items) as r(
      id uuid,
      standard_unit_price numeric,
      actual_unit_price numeric,
      unit_cost numeric,
      warranty_months integer
    ) on r.id = si.id
    where si.sale_id = p_sale_id
      and (
        si.standard_unit_price is distinct from r.standard_unit_price
        or si.actual_unit_price is distinct from r.actual_unit_price
        or si.unit_cost is distinct from r.unit_cost
        or si.warranty_months is distinct from r.warranty_months
      )
  );

  v_any_change := v_before_snapshot is distinct from v_after_snapshot;

  if not v_any_change then
    return query select v_sale.id, v_sale.sale_code, false;
    return;
  end if;

  if v_financial_change and v_normalized_correction_note is null then
    raise exception using
      errcode = '22004',
      message = 'a correction note is required when changing Sale prices, cost, or warranty months';
  end if;

  if exists (
    select 1
    from public.sale_items si
    join jsonb_to_recordset(p_items) as r(
      id uuid,
      standard_unit_price numeric,
      actual_unit_price numeric,
      unit_cost numeric,
      warranty_months integer
    ) on r.id = si.id
    where si.sale_id = p_sale_id
      and si.warranty_months is distinct from r.warranty_months
      and exists (
        select 1
        from public.equipment e
        join public.equipment_warranties ew on ew.equipment_id = e.id
        where e.sale_item_id = si.id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'warranty months cannot be corrected after an Equipment Warranty has been activated';
  end if;

  select coalesce(sum(r.actual_unit_price * si.quantity), 0)
    into v_corrected_value
  from public.sale_items si
  join jsonb_to_recordset(p_items) as r(
    id uuid,
    standard_unit_price numeric,
    actual_unit_price numeric,
    unit_cost numeric,
    warranty_months integer
  ) on r.id = si.id
  where si.sale_id = p_sale_id;

  select
    coalesce((select sum(sp.amount)
      from public.sale_payments sp
      where sp.sale_id = p_sale_id), 0)
    + coalesce((select sum(ep.amount)
      from public.emi_accounts ea
      join public.emi_payments ep on ep.emi_account_id = ea.id
      where ea.sale_id = p_sale_id
        and ea.status in ('Active', 'Completed', 'Defaulted')), 0)
    into v_received;

  if v_corrected_value < v_received then
    raise exception using
      errcode = '23514',
      message = format('corrected Sale value (%s) cannot be below recorded Sale and EMI payments (%s)', v_corrected_value, v_received);
  end if;

  perform set_config('app.sale_correction_in_progress', 'on', true);

  update public.sales s
  set sale_date = p_sale_date,
      lead_source_id = p_lead_source_id,
      invoice_number = v_normalized_invoice_number,
      invoice_date = p_invoice_date,
      source_detail = v_normalized_source_detail,
      notes = v_normalized_notes
  where s.id = p_sale_id;

  update public.sale_items si
  set standard_unit_price = r.standard_unit_price,
      actual_unit_price = r.actual_unit_price,
      unit_cost = r.unit_cost,
      discount = greatest(coalesce(r.standard_unit_price, r.actual_unit_price) - r.actual_unit_price, 0),
      warranty_months = r.warranty_months
  from jsonb_to_recordset(p_items) as r(
    id uuid,
    standard_unit_price numeric,
    actual_unit_price numeric,
    unit_cost numeric,
    warranty_months integer
  )
  where si.sale_id = p_sale_id
    and si.id = r.id;

  insert into public.sale_corrections (
    sale_id, correction_note, before_snapshot, after_snapshot, corrected_by
  ) values (
    p_sale_id, v_normalized_correction_note, v_before_snapshot, v_after_snapshot, auth.uid()
  );

  return query select v_sale.id, v_sale.sale_code, true;
end;
$$;

revoke all on function public.correct_sale(uuid, date, uuid, text, date, text, text, jsonb, text) from public;
revoke all on function public.correct_sale(uuid, date, uuid, text, date, text, text, jsonb, text) from anon;
grant execute on function public.correct_sale(uuid, date, uuid, text, date, text, text, jsonb, text) to authenticated;
