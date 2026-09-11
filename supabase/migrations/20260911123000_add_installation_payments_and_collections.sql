-- Phase 3.2.1C.3: Installation payments for Paid Additional Work only.
-- No Installation EMI, receipt ledger, or business-performance category is introduced here.

create table public.installation_payments (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete restrict,
  submission_key uuid not null unique,
  submission_fingerprint text not null,
  payment_date date not null,
  amount numeric not null check (amount > 0),
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  reference_number text,
  notes text,
  payment_status text not null default 'Valid' check (payment_status in ('Valid', 'Corrected', 'Voided')),
  voided_at timestamptz,
  void_reason text,
  correction_of_payment_id uuid references public.installation_payments(id) on delete restrict,
  corrected_by_payment_id uuid references public.installation_payments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (payment_status = 'Valid' and voided_at is null and void_reason is null)
    or (payment_status in ('Corrected', 'Voided') and voided_at is not null and nullif(btrim(void_reason), '') is not null)
  )
);
create index installation_payments_installation_id_idx on public.installation_payments(installation_id);
create index installation_payments_valid_installation_idx on public.installation_payments(installation_id) where payment_status = 'Valid';
alter table public.installation_payments enable row level security;
create policy "authenticated_crm_read" on public.installation_payments
  for select to authenticated using (true);
create policy "authenticated_crm_insert_via_rpc" on public.installation_payments
  for insert to authenticated
  with check (current_setting('app.installation_payment_write_in_progress', true) = 'on');
create policy "authenticated_crm_update_via_rpc" on public.installation_payments
  for update to authenticated
  using (current_setting('app.installation_payment_write_in_progress', true) = 'on')
  with check (current_setting('app.installation_payment_write_in_progress', true) = 'on');
create trigger installation_payments_set_updated_at
  before update on public.installation_payments for each row execute function private.set_updated_at();
create trigger installation_payments_protect_history
  before insert or update on public.installation_payments for each row execute function private.protect_payment_history();

create or replace function private.installation_work_items_payable_value(p_work_items jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce(sum(w.customer_charge) filter (where w.commercial_treatment = 'Paid'), 0)
  from jsonb_to_recordset(coalesce(p_work_items, '[]'::jsonb))
    as w(commercial_treatment text, customer_charge numeric);
$$;

create or replace function private.installation_payable_value(p_installation_id uuid)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(wi.customer_charge) filter (where wi.commercial_treatment = 'Paid'), 0)
  from public.installation_work_items wi
  where wi.installation_id = p_installation_id;
$$;

create or replace function private.assert_installation_payment_ceiling(
  p_installation_id uuid,
  p_amount numeric
) returns void language plpgsql set search_path = 'pg_catalog', 'public' as $$
declare
  v_status text;
  v_payable numeric;
  v_received numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '23514', message = 'Installation payment amount must be greater than zero';
  end if;

  select i.status into v_status
  from public.installations i
  where i.id = p_installation_id
  for update;

  if v_status is null then
    raise exception using errcode = '23503', message = 'Installation payment must reference an existing Installation';
  end if;
  if v_status <> 'Completed' then
    raise exception using errcode = '23514', message = 'Installation payments are allowed only after completion';
  end if;

  v_payable := private.installation_payable_value(p_installation_id);
  select coalesce(sum(ip.amount), 0) into v_received
  from public.installation_payments ip
  where ip.installation_id = p_installation_id
    and ip.payment_status = 'Valid';

  if v_received + p_amount > v_payable then
    raise exception using errcode = '23514',
      message = 'Installation payment exceeds the authoritative Paid Additional Work value';
  end if;
end;
$$;

create or replace function private.validate_installation_payment_financials()
returns trigger language plpgsql set search_path = 'pg_catalog', 'public' as $$
begin
  if new.payment_status = 'Valid' then
    perform private.assert_installation_payment_ceiling(new.installation_id, new.amount);
  end if;
  return new;
end;
$$;
create trigger installation_payments_validate_financials
  before insert or update on public.installation_payments
  for each row execute function private.validate_installation_payment_financials();

create or replace function private.enforce_installation_work_item_payment_floor()
returns trigger language plpgsql set search_path = 'pg_catalog', 'public' as $$
declare
  v_installation_id uuid := coalesce(new.installation_id, old.installation_id);
  v_received numeric;
begin
  select coalesce(sum(ip.amount), 0) into v_received
  from public.installation_payments ip
  where ip.installation_id = v_installation_id
    and ip.payment_status = 'Valid';

  if private.installation_payable_value(v_installation_id) < v_received then
    raise exception using errcode = '23514',
      message = 'Additional Work payable value cannot be reduced below valid Installation payments';
  end if;
  return null;
end;
$$;
create constraint trigger installation_work_items_payment_floor
  after insert or update or delete on public.installation_work_items
  deferrable initially deferred
  for each row execute function private.enforce_installation_work_item_payment_floor();

create or replace function public.record_installation_payment(
  p_submission_key uuid,
  p_installation_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method_id uuid,
  p_reference_number text,
  p_notes text
)
returns table(payment_id uuid, created boolean)
language plpgsql set search_path = 'pg_catalog', 'public' as $$
declare
  v_payment_id uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
begin
  if p_submission_key is null then
    raise exception using errcode = '22004', message = 'submission_key is required';
  end if;
  if p_installation_id is null or p_payment_date is null or p_payment_method_id is null then
    raise exception using errcode = '22004', message = 'Installation, payment date, and payment method are required';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'installation_id', p_installation_id,
    'payment_date', p_payment_date,
    'amount', p_amount,
    'payment_method_id', p_payment_method_id,
    'reference_number', nullif(btrim(p_reference_number), ''),
    'notes', nullif(btrim(p_notes), '')
  )::text);

  perform pg_advisory_xact_lock(hashtextextended(p_submission_key::text, 0));

  select ip.id, ip.submission_fingerprint
    into v_payment_id, v_existing_fingerprint
  from public.installation_payments ip
  where ip.submission_key = p_submission_key;

  if v_payment_id is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = '23505',
        message = 'submission_key already belongs to a different Installation payment request';
    end if;
    return query select v_payment_id, false;
    return;
  end if;

  perform private.assert_installation_payment_ceiling(p_installation_id, p_amount);
  perform set_config('app.installation_payment_write_in_progress', 'on', true);

  insert into public.installation_payments (
    installation_id, submission_key, submission_fingerprint, payment_date, amount,
    payment_method_id, reference_number, notes
  ) values (
    p_installation_id, p_submission_key, v_fingerprint, p_payment_date, p_amount,
    p_payment_method_id, nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), '')
  ) returning id into v_payment_id;

  return query select v_payment_id, true;
end;
$$;

create or replace function public.correct_installation_payment(
  p_payment_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method_id uuid,
  p_reference_number text,
  p_notes text,
  p_reason text
)
returns table(original_payment_id uuid, replacement_payment_id uuid)
language plpgsql set search_path = 'pg_catalog', 'public' as $$
declare
  v_status text;
  v_installation_id uuid;
  v_replacement_id uuid;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '23514', message = 'A correction reason is required';
  end if;
  if p_payment_date is null or p_payment_method_id is null then
    raise exception using errcode = '23514', message = 'A corrected payment date and method are required';
  end if;

  select ip.payment_status, ip.installation_id into v_status, v_installation_id
  from public.installation_payments ip
  where ip.id = p_payment_id
  for update;

  if v_status is null then
    raise exception using errcode = 'P0002', message = 'Installation payment was not found';
  end if;
  if v_status <> 'Valid' then
    raise exception using errcode = '23514', message = 'Only Valid Installation payments can be corrected';
  end if;

  perform set_config('app.payment_correction_in_progress', 'on', true);
  perform set_config('app.installation_payment_write_in_progress', 'on', true);

  update public.installation_payments
  set payment_status = 'Corrected', voided_at = now(), void_reason = btrim(p_reason)
  where id = p_payment_id;

  perform private.assert_installation_payment_ceiling(v_installation_id, p_amount);

  insert into public.installation_payments (
    installation_id, submission_key, submission_fingerprint, payment_date, amount,
    payment_method_id, reference_number, notes, correction_of_payment_id
  ) values (
    v_installation_id, gen_random_uuid(),
    md5(jsonb_build_object('correction_of_payment_id', p_payment_id, 'payment_date', p_payment_date, 'amount', p_amount, 'payment_method_id', p_payment_method_id, 'reference_number', nullif(btrim(p_reference_number), ''), 'notes', nullif(btrim(p_notes), ''))::text),
    p_payment_date, p_amount, p_payment_method_id, nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''), p_payment_id
  ) returning id into v_replacement_id;

  update public.installation_payments
  set corrected_by_payment_id = v_replacement_id
  where id = p_payment_id;

  return query select p_payment_id, v_replacement_id;
end;
$$;

create or replace function public.void_installation_payment(
  p_payment_id uuid,
  p_reason text
)
returns table(payment_id uuid, payment_status text)
language plpgsql set search_path = 'pg_catalog', 'public' as $$
declare
  v_status text;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '23514', message = 'A void reason is required';
  end if;

  select ip.payment_status into v_status
  from public.installation_payments ip
  where ip.id = p_payment_id
  for update;

  if v_status is null then
    raise exception using errcode = 'P0002', message = 'Installation payment was not found';
  end if;
  if v_status <> 'Valid' then
    raise exception using errcode = '23514', message = 'Only Valid Installation payments can be voided';
  end if;

  perform set_config('app.payment_correction_in_progress', 'on', true);
  perform set_config('app.installation_payment_write_in_progress', 'on', true);

  update public.installation_payments
  set payment_status = 'Voided', voided_at = now(), void_reason = btrim(p_reason)
  where id = p_payment_id;

  return query select p_payment_id, 'Voided'::text;
end;
$$;

create or replace function public.get_installation_payment_summary(p_installation_id uuid)
returns table(installation_id uuid, additional_work_value numeric, amount_received numeric, amount_due numeric)
language sql stable set search_path = 'public', 'pg_temp' as $$
  with payable as (
    select i.id, coalesce(sum(wi.customer_charge) filter (where wi.commercial_treatment = 'Paid'), 0) as value
    from public.installations i
    left join public.installation_work_items wi on wi.installation_id = i.id
    where i.id = p_installation_id
    group by i.id
  ), received as (
    select ip.installation_id, coalesce(sum(ip.amount), 0) as value
    from public.installation_payments ip
    where ip.installation_id = p_installation_id
      and ip.payment_status = 'Valid'
    group by ip.installation_id
  )
  select p.id, p.value, coalesce(r.value, 0), p.value - coalesce(r.value, 0)
  from payable p left join received r on r.installation_id = p.id;
$$;

CREATE OR REPLACE FUNCTION public.correct_installation(
  p_installation_id uuid,
  p_installation_date date,
  p_technician_id uuid,
  p_tds_in numeric,
  p_tds_out numeric,
  p_installation_charge numeric,
  p_technician_charge numeric,
  p_travel_cost numeric,
  p_other_direct_cost numeric,
  p_other_direct_cost_note text,
  p_notes text,
  p_work_items jsonb,
  p_correction_reason text
)
 RETURNS TABLE(installation_id uuid, installation_code text, equipment_warranty_id uuid, warranty_code text, warranty_reconciled boolean)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_installation public.installations%rowtype;
  v_warranty public.equipment_warranties%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_reason text;
  v_changed boolean;
  v_work_items jsonb;
  v_existing_work_items jsonb;
begin
  if p_installation_id is null or p_installation_date is null then
    raise exception using errcode = '22004', message = 'Installation and Actual Installation Date are required';
  end if;
  if p_tds_in is not null and p_tds_in < 0
     or p_tds_out is not null and p_tds_out < 0
     or p_installation_charge is not null and p_installation_charge < 0
     or p_technician_charge is not null and p_technician_charge < 0
     or p_travel_cost is not null and p_travel_cost < 0
     or p_other_direct_cost is not null and p_other_direct_cost < 0 then
    raise exception using errcode = '22023', message = 'TDS and charges must be zero or greater';
  end if;

  if p_other_direct_cost is not null and p_other_direct_cost > 0
     and nullif(btrim(p_other_direct_cost_note), '') is null then
    raise exception using errcode = '23514', message = 'other_direct_cost_note is required when other_direct_cost is positive';
  end if;

  v_reason := nullif(btrim(p_correction_reason), '');
  if v_reason is null then
    raise exception using errcode = '23514', message = 'A correction reason is required';
  end if;

  v_work_items := private.normalize_installation_work_items(p_work_items, true);

  if private.installation_work_items_payable_value(v_work_items) < coalesce((
    select sum(ip.amount)
    from public.installation_payments ip
    where ip.installation_id = p_installation_id
      and ip.payment_status = 'Valid'
  ), 0) then
    raise exception using errcode = '23514',
      message = 'Additional Work payable value cannot be reduced below valid Installation payments';
  end if;

  select * into v_installation
    from public.installations
    where id = p_installation_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Installation was not found';
  end if;
  if v_installation.status <> 'Completed'
     or v_installation.installation_classification <> 'Initial Installation' then
    raise exception using errcode = '23514', message = 'Only completed Initial Installations can be corrected here';
  end if;

  select * into v_warranty
    from public.equipment_warranties as ew
    where ew.installation_id = p_installation_id
      and ew.is_automatic_sale_origin
    for update;

  v_existing_work_items := private.installation_work_items_snapshot(p_installation_id);

  v_changed := (v_installation.installation_date, v_installation.technician_id,
                v_installation.tds_in, v_installation.tds_out,
                v_installation.installation_charge, v_installation.technician_charge,
                v_installation.travel_cost, v_installation.other_direct_cost,
                v_installation.other_direct_cost_note, v_installation.notes, v_existing_work_items)
               is distinct from
               (p_installation_date, p_technician_id, p_tds_in, p_tds_out,
                p_installation_charge, p_technician_charge, p_travel_cost,
                p_other_direct_cost, nullif(btrim(p_other_direct_cost_note), ''),
                nullif(btrim(p_notes), ''), v_work_items);

  if not v_changed then
    return query select v_installation.id, v_installation.installation_code,
      v_warranty.id, v_warranty.warranty_code, false;
    return;
  end if;

  v_before := jsonb_build_object('installation', to_jsonb(v_installation), 'automatic_warranty', to_jsonb(v_warranty), 'additional_work', v_existing_work_items);
  perform set_config('app.installation_correction_in_progress', 'on', true);

  update public.installations
    set installation_date = p_installation_date,
        technician_id = p_technician_id,
        tds_in = p_tds_in,
        tds_out = p_tds_out,
        installation_charge = p_installation_charge,
        technician_charge = p_technician_charge,
        travel_cost = p_travel_cost,
        other_direct_cost = p_other_direct_cost,
        other_direct_cost_note = nullif(btrim(p_other_direct_cost_note), ''),
        notes = nullif(btrim(p_notes), '')
    where id = p_installation_id;

  if exists (
    select 1 from jsonb_to_recordset(v_work_items) as w(id uuid, description text, quantity numeric, commercial_treatment text, customer_charge numeric, direct_cost numeric, notes text)
    where w.id is not null
      and not exists (select 1 from public.installation_work_items wi where wi.id = w.id and wi.installation_id = p_installation_id)
  ) then
    raise exception using errcode = '23503', message = 'Additional Work item does not belong to this Installation';
  end if;

  delete from public.installation_work_items wi
  where wi.installation_id = p_installation_id
    and not exists (
      select 1 from jsonb_to_recordset(v_work_items) as w(id uuid, description text, quantity numeric, commercial_treatment text, customer_charge numeric, direct_cost numeric, notes text)
      where w.id = wi.id
    );

  update public.installation_work_items wi
    set description = w.description, quantity = w.quantity, commercial_treatment = w.commercial_treatment,
        customer_charge = w.customer_charge, direct_cost = w.direct_cost, notes = w.notes
  from jsonb_to_recordset(v_work_items) as w(id uuid, description text, quantity numeric, commercial_treatment text, customer_charge numeric, direct_cost numeric, notes text)
  where w.id is not null and wi.id = w.id and wi.installation_id = p_installation_id;

  insert into public.installation_work_items (installation_id, description, quantity, commercial_treatment, customer_charge, direct_cost, notes)
  select p_installation_id, w.description, w.quantity, w.commercial_treatment, w.customer_charge, w.direct_cost, w.notes
  from jsonb_to_recordset(v_work_items) as w(id uuid, description text, quantity numeric, commercial_treatment text, customer_charge numeric, direct_cost numeric, notes text)
  where w.id is null;

  select * into v_installation from public.installations where id = p_installation_id;
  select * into v_warranty from public.equipment_warranties as ew
    where ew.installation_id = p_installation_id and ew.is_automatic_sale_origin;
  v_after := jsonb_build_object('installation', to_jsonb(v_installation), 'automatic_warranty', to_jsonb(v_warranty), 'additional_work', private.installation_work_items_snapshot(p_installation_id));

  insert into public.installation_corrections (
    installation_id, correction_reason, before_snapshot, after_snapshot, corrected_by
  ) values (
    p_installation_id, v_reason, v_before, v_after, auth.uid()
  );

  return query select v_installation.id, v_installation.installation_code,
    v_warranty.id, v_warranty.warranty_code,
    v_before -> 'automatic_warranty' is distinct from v_after -> 'automatic_warranty';
end;
$function$

;


create or replace function public.get_finance_summary(p_date_from date, p_date_to date)
returns table(
  sales_value numeric, sales_direct_collections numeric, sales_emi_collections numeric, sales_collections numeric,
  sales_known_direct_cost numeric, sales_direct_cost_available boolean, sales_contribution numeric, sales_contribution_available boolean,
  service_value numeric, service_collections numeric, service_known_direct_cost numeric, service_direct_cost_available boolean,
  service_contribution numeric, service_contribution_available boolean, amc_value numeric, amc_value_available boolean,
  amc_collections numeric, total_transaction_value numeric, total_transaction_value_available boolean, total_collections numeric,
  sales_outstanding_as_of numeric, service_outstanding_as_of numeric, amc_outstanding_as_of numeric,
  total_outstanding_as_of numeric, total_outstanding_available boolean
)
language sql stable set search_path = 'public', 'pg_temp' as $$
with
vs as (select id,sale_date from sales where status in('Confirmed','Completed')),
sm as (select coalesce(sum(si.actual_unit_price*si.quantity),0) v,coalesce(bool_and(si.unit_cost is not null),true) ok,coalesce(sum(si.unit_cost*si.quantity),0) c from vs join sale_items si on si.sale_id=vs.id where sale_date between p_date_from and p_date_to),
sc as (select coalesce(sum(amount),0) v from sale_payments sp join vs on vs.id=sp.sale_id where sp.payment_status='Valid' and payment_date between p_date_from and p_date_to),
ec as (select coalesce(sum(ep.amount),0) v from emi_payments ep join emi_accounts ea on ea.id=ep.emi_account_id and ea.status in('Active','Completed','Defaulted') join vs on vs.id=ea.sale_id where ep.payment_status='Valid' and payment_date between p_date_from and p_date_to),
sf as (select s.id,s.service_date,f.revenue,f.direct_cost,f.direct_cost_available from services s join private.service_financial_rows() f on f.service_id=s.id where s.status='Completed'),
sx as (select coalesce(sum(revenue),0) v,coalesce(bool_and(direct_cost_available),true) ok,coalesce(sum(direct_cost),0) c from sf where service_date between p_date_from and p_date_to),
sp as (select coalesce(sum(amount),0) v from service_payments p join sf on sf.id=p.service_id where p.payment_status='Valid' and payment_date between p_date_from and p_date_to),
va as (select id,start_date,agreed_price from amc_cycles where status in('Active','Expired')),
am as (select coalesce(bool_and(agreed_price is not null),true) ok,coalesce(sum(agreed_price),0) v from va where start_date between p_date_from and p_date_to),
ap as (select coalesce(sum(amount),0) v from amc_payments p join va on va.id=p.amc_cycle_id where p.payment_status='Valid' and payment_date between p_date_from and p_date_to),
vi as (select i.id,i.installation_date,coalesce(sum(wi.customer_charge) filter(where wi.commercial_treatment='Paid'),0) value from installations i left join installation_work_items wi on wi.installation_id=i.id where i.status='Completed' group by i.id,i.installation_date),
ip as (select coalesce(sum(p.amount),0) v from installation_payments p join vi on vi.id=p.installation_id where p.payment_status='Valid' and p.payment_date between p_date_from and p_date_to),
sa as (select coalesce(sum(si.actual_unit_price*si.quantity),0)-coalesce((select sum(amount) from sale_payments p join vs on vs.id=p.sale_id where p.payment_status='Valid' and payment_date<=p_date_to),0)-coalesce((select sum(ep.amount) from emi_payments ep join emi_accounts ea on ea.id=ep.emi_account_id join vs on vs.id=ea.sale_id where ep.payment_status='Valid' and payment_date<=p_date_to),0) v from vs join sale_items si on si.sale_id=vs.id where sale_date<=p_date_to),
sfa as (select coalesce(sum(revenue),0)-coalesce((select sum(p.amount) from service_payments p join sf on sf.id=p.service_id where p.payment_status='Valid' and payment_date<=p_date_to),0) v from sf where service_date<=p_date_to),
aa as (select coalesce(sum(agreed_price),0)-coalesce((select sum(p.amount) from amc_payments p join va on va.id=p.amc_cycle_id where p.payment_status='Valid' and payment_date<=p_date_to),0) v from va where start_date<=p_date_to),
ia as (select coalesce(sum(vi.value),0)-coalesce((select sum(p.amount) from installation_payments p join vi on vi.id=p.installation_id where p.payment_status='Valid' and p.payment_date<=p_date_to),0) v from vi where vi.installation_date<=p_date_to)
select sm.v,sc.v,ec.v,sc.v+ec.v,case when sm.ok then sm.c end,sm.ok,case when sm.ok then sm.v-sm.c end,sm.ok,
sx.v,sp.v,case when sx.ok then sx.c end,sx.ok,case when sx.ok then sx.v-sx.c end,sx.ok,
case when am.ok then am.v end,am.ok,ap.v,
case when am.ok then sm.v+sx.v+am.v end,am.ok,sc.v+ec.v+sp.v+ap.v+ip.v,
sa.v,sfa.v,aa.v,sa.v+sfa.v+aa.v+ia.v,true
from sm cross join sc cross join ec cross join sx cross join sp cross join am cross join ap cross join ip cross join sa cross join sfa cross join aa cross join ia;
$$;

create or replace function public.get_finance_outstanding(
  p_category text, p_as_of date, p_offset integer, p_limit integer
)
returns table(category text, transaction_id uuid, transaction_code text, customer_id uuid, customer_name text,
  transaction_date date, transaction_value numeric, collections_as_of numeric, outstanding numeric,
  direct_cost numeric, direct_cost_available boolean, contribution numeric, total_count bigint)
language sql stable set search_path = 'public', 'pg_temp' as $$
with
sale_rows as (select 'Sales'::text category,s.id transaction_id,s.sale_code transaction_code,c.id customer_id,c.name customer_name,s.sale_date transaction_date,coalesce(sum(si.actual_unit_price*si.quantity),0) transaction_value,coalesce(bool_and(si.unit_cost is not null),true) direct_cost_available,coalesce(sum(si.unit_cost*si.quantity),0) direct_cost from public.sales s join public.customers c on c.id=s.customer_id left join public.sale_items si on si.sale_id=s.id where s.status in ('Confirmed','Completed') and s.sale_date<=p_as_of group by s.id,s.sale_code,c.id,c.name,s.sale_date),
sale_direct_paid as (select sp.sale_id,sum(sp.amount) amount from public.sale_payments sp join public.sales s on s.id=sp.sale_id and s.status in ('Confirmed','Completed') where sp.payment_status='Valid' and sp.payment_date<=p_as_of group by sp.sale_id),
sale_emi_paid as (select ea.sale_id,sum(ep.amount) amount from public.emi_payments ep join public.emi_accounts ea on ea.id=ep.emi_account_id and ea.status in ('Active','Completed','Defaulted') join public.sales s on s.id=ea.sale_id and s.status in ('Confirmed','Completed') where ep.payment_status='Valid' and ep.payment_date<=p_as_of group by ea.sale_id),
service_rows as (select 'Service'::text category,sv.id transaction_id,sv.service_code transaction_code,c.id customer_id,c.name customer_name,sv.service_date transaction_date,sf.revenue transaction_value,sf.direct_cost_available,sf.direct_cost from public.services sv join public.equipment e on e.id=sv.equipment_id join public.customers c on c.id=e.customer_id join private.service_financial_rows() sf on sf.service_id=sv.id where sv.status='Completed' and sv.service_date<=p_as_of),
service_paid as (select sp.service_id,sum(sp.amount) amount from public.service_payments sp join public.services sv on sv.id=sp.service_id and sv.status='Completed' where sp.payment_status='Valid' and sp.payment_date<=p_as_of group by sp.service_id),
amc_rows as (select 'AMC'::text category,ac.id transaction_id,ac.amc_code transaction_code,c.id customer_id,c.name customer_name,ac.start_date transaction_date,ac.agreed_price transaction_value from public.amc_cycles ac join public.equipment e on e.id=ac.equipment_id join public.customers c on c.id=e.customer_id where ac.status in ('Active','Expired') and ac.start_date<=p_as_of),
amc_paid as (select ap.amc_cycle_id,sum(ap.amount) amount from public.amc_payments ap join public.amc_cycles ac on ac.id=ap.amc_cycle_id and ac.status in ('Active','Expired') where ap.payment_status='Valid' and ap.payment_date<=p_as_of group by ap.amc_cycle_id),
installation_rows as (select 'Installation'::text category,i.id transaction_id,i.installation_code transaction_code,c.id customer_id,c.name customer_name,i.installation_date transaction_date,coalesce(sum(wi.customer_charge) filter(where wi.commercial_treatment='Paid'),0) transaction_value from public.installations i join public.equipment e on e.id=i.equipment_id join public.customers c on c.id=e.customer_id left join public.installation_work_items wi on wi.installation_id=i.id where i.status='Completed' and i.installation_date<=p_as_of group by i.id,i.installation_code,c.id,c.name,i.installation_date),
installation_paid as (select ip.installation_id,sum(ip.amount) amount from public.installation_payments ip join public.installations i on i.id=ip.installation_id and i.status='Completed' where ip.payment_status='Valid' and ip.payment_date<=p_as_of group by ip.installation_id),
unified as (
select sr.category,sr.transaction_id,sr.transaction_code,sr.customer_id,sr.customer_name,sr.transaction_date,sr.transaction_value,coalesce(sdp.amount,0)+coalesce(sep.amount,0) collections_as_of,sr.transaction_value-coalesce(sdp.amount,0)-coalesce(sep.amount,0) outstanding,case when sr.direct_cost_available then sr.direct_cost else null end direct_cost,sr.direct_cost_available,case when sr.direct_cost_available then sr.transaction_value-sr.direct_cost else null end contribution from sale_rows sr left join sale_direct_paid sdp on sdp.sale_id=sr.transaction_id left join sale_emi_paid sep on sep.sale_id=sr.transaction_id
union all select sr.category,sr.transaction_id,sr.transaction_code,sr.customer_id,sr.customer_name,sr.transaction_date,sr.transaction_value,coalesce(sp.amount,0),sr.transaction_value-coalesce(sp.amount,0),case when sr.direct_cost_available then sr.direct_cost else null end,sr.direct_cost_available,case when sr.direct_cost_available then sr.transaction_value-sr.direct_cost else null end from service_rows sr left join service_paid sp on sp.service_id=sr.transaction_id
union all select ar.category,ar.transaction_id,ar.transaction_code,ar.customer_id,ar.customer_name,ar.transaction_date,ar.transaction_value,coalesce(ap.amount,0),case when ar.transaction_value is null then null else ar.transaction_value-coalesce(ap.amount,0) end,null::numeric,false,null::numeric from amc_rows ar left join amc_paid ap on ap.amc_cycle_id=ar.transaction_id
union all select ir.category,ir.transaction_id,ir.transaction_code,ir.customer_id,ir.customer_name,ir.transaction_date,ir.transaction_value,coalesce(ip.amount,0),ir.transaction_value-coalesce(ip.amount,0),null::numeric,false,null::numeric from installation_rows ir left join installation_paid ip on ip.installation_id=ir.transaction_id
),
filtered as (select *,count(*) over() total_count from unified where (p_category is null or category=p_category) and (transaction_value is null or outstanding<>0))
select * from filtered order by transaction_date desc,category,transaction_code,transaction_id offset greatest(0,coalesce(p_offset,0)) limit greatest(1,least(coalesce(p_limit,25),100));
$$;

create or replace function public.get_finance_recent_collections(
  p_date_from date, p_date_to date, p_limit integer
)
returns table(payment_date date, collection_type text, payment_id uuid, payment_code text, transaction_id uuid,
  transaction_code text, customer_id uuid, customer_name text, payment_method_id uuid, payment_method_name text, amount numeric)
language sql stable set search_path = 'public', 'pg_temp' as $$
with collections(payment_date,collection_type,payment_id,payment_code,transaction_id,transaction_code,customer_id,customer_name,payment_method_id,payment_method_name,amount) as (
select sp.payment_date,'Sale'::text,sp.id,sp.payment_code,s.id,s.sale_code,c.id,c.name,pm.id,pm.name,sp.amount from public.sale_payments sp join public.sales s on s.id=sp.sale_id and s.status in ('Confirmed','Completed') join public.customers c on c.id=s.customer_id join public.payment_methods pm on pm.id=sp.payment_method_id where sp.payment_status='Valid'
union all select ep.payment_date,'EMI'::text,ep.id,ep.payment_code,s.id,s.sale_code,c.id,c.name,pm.id,pm.name,ep.amount from public.emi_payments ep join public.emi_accounts ea on ea.id=ep.emi_account_id and ea.status in ('Active','Completed','Defaulted') join public.sales s on s.id=ea.sale_id and s.status in ('Confirmed','Completed') join public.customers c on c.id=s.customer_id join public.payment_methods pm on pm.id=ep.payment_method_id where ep.payment_status='Valid'
union all select sp.payment_date,'Service'::text,sp.id,sp.payment_code,sv.id,sv.service_code,c.id,c.name,pm.id,pm.name,sp.amount from public.service_payments sp join public.services sv on sv.id=sp.service_id and sv.status='Completed' join public.equipment e on e.id=sv.equipment_id join public.customers c on c.id=e.customer_id join public.payment_methods pm on pm.id=sp.payment_method_id where sp.payment_status='Valid'
union all select ap.payment_date,'AMC'::text,ap.id,ap.payment_code,ac.id,ac.amc_code,c.id,c.name,pm.id,pm.name,ap.amount from public.amc_payments ap join public.amc_cycles ac on ac.id=ap.amc_cycle_id and ac.status in ('Active','Expired') join public.equipment e on e.id=ac.equipment_id join public.customers c on c.id=e.customer_id join public.payment_methods pm on pm.id=ap.payment_method_id where ap.payment_status='Valid'
union all select ip.payment_date,'Installation'::text,ip.id,null::text,i.id,i.installation_code,c.id,c.name,pm.id,pm.name,ip.amount from public.installation_payments ip join public.installations i on i.id=ip.installation_id and i.status='Completed' join public.equipment e on e.id=i.equipment_id join public.customers c on c.id=e.customer_id join public.payment_methods pm on pm.id=ip.payment_method_id where ip.payment_status='Valid'
)
select * from collections where payment_date between p_date_from and p_date_to order by payment_date desc,collection_type,payment_code nulls last,payment_id limit greatest(1,least(coalesce(p_limit,25),100));
$$;

revoke all on function private.installation_work_items_payable_value(jsonb) from public, anon;
grant execute on function private.installation_work_items_payable_value(jsonb) to authenticated;
revoke all on function private.installation_payable_value(uuid) from public, anon;
grant execute on function private.installation_payable_value(uuid) to authenticated;
revoke all on function private.assert_installation_payment_ceiling(uuid, numeric) from public, anon;
grant execute on function private.assert_installation_payment_ceiling(uuid, numeric) to authenticated;
revoke all on function public.record_installation_payment(uuid, uuid, date, numeric, uuid, text, text) from public, anon;
grant execute on function public.record_installation_payment(uuid, uuid, date, numeric, uuid, text, text) to authenticated;
revoke all on function public.correct_installation_payment(uuid, date, numeric, uuid, text, text, text) from public, anon;
grant execute on function public.correct_installation_payment(uuid, date, numeric, uuid, text, text, text) to authenticated;
revoke all on function public.void_installation_payment(uuid, text) from public, anon;
grant execute on function public.void_installation_payment(uuid, text) to authenticated;
revoke all on function public.get_installation_payment_summary(uuid) from public, anon;
grant execute on function public.get_installation_payment_summary(uuid) to authenticated;
revoke all on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, jsonb, text) from public, anon;
grant execute on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, jsonb, text) to authenticated;
notify pgrst, 'reload schema';
