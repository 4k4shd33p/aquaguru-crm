-- Phase 3.2.1C.2: additional Initial Installation work only.
-- Payment collection and visible Finance-category changes are deliberately deferred.

create table public.installation_work_items (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete restrict,
  description text not null check (nullif(btrim(description), '') is not null),
  quantity numeric not null default 1 check (quantity > 0),
  commercial_treatment text not null check (commercial_treatment in ('Paid', 'Included', 'Complimentary', 'Unknown')),
  customer_charge numeric check (customer_charge is null or customer_charge >= 0),
  direct_cost numeric check (direct_cost is null or direct_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index installation_work_items_installation_id_idx on public.installation_work_items(installation_id);
alter table public.installation_work_items enable row level security;
create policy "authenticated_crm_access" on public.installation_work_items for all to authenticated using (true) with check (true);
create trigger installation_work_items_set_updated_at before update on public.installation_work_items for each row execute function private.set_updated_at();

create or replace function private.normalize_installation_work_items(p_items jsonb, p_include_ids boolean default false)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  v_item jsonb; v_normalized jsonb; v_result jsonb := '[]'::jsonb;
  v_description text; v_notes text; v_treatment text; v_quantity numeric; v_charge numeric; v_cost numeric; v_id uuid;
begin
  if p_items is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception using errcode='22023', message='Additional Work must be an array'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_description := nullif(btrim(v_item->>'description'), '');
    v_notes := nullif(btrim(v_item->>'notes'), '');
    v_treatment := nullif(btrim(v_item->>'commercial_treatment'), '');
    v_quantity := coalesce(nullif(v_item->>'quantity','')::numeric, 1);
    v_charge := nullif(v_item->>'customer_charge','')::numeric;
    v_cost := nullif(v_item->>'direct_cost','')::numeric;
    v_id := case when p_include_ids and nullif(v_item->>'id','') is not null then (v_item->>'id')::uuid else null end;
    if v_description is null then raise exception using errcode='23514', message='Additional Work description is required'; end if;
    if v_quantity <= 0 then raise exception using errcode='23514', message='Additional Work quantity must be greater than zero'; end if;
    if v_treatment not in ('Paid','Included','Complimentary','Unknown') then raise exception using errcode='23514', message='Additional Work commercial treatment is invalid'; end if;
    if v_charge is not null and v_charge < 0 or v_cost is not null and v_cost < 0 then raise exception using errcode='22023', message='Additional Work charges and direct costs cannot be negative'; end if;
    if v_treatment='Paid' and coalesce(v_charge,0) <= 0 then raise exception using errcode='23514', message='Paid Additional Work requires a positive customer charge'; end if;
    if v_treatment in ('Included','Complimentary') and v_charge is distinct from 0 then raise exception using errcode='23514', message='Included or Complimentary Additional Work requires a customer charge of zero'; end if;
    v_normalized := jsonb_build_object('id',v_id,'description',v_description,'quantity',v_quantity,'commercial_treatment',v_treatment,'customer_charge',v_charge,'direct_cost',v_cost,'notes',v_notes);
    v_result := v_result || jsonb_build_array(v_normalized);
  end loop;
  return coalesce((select jsonb_agg(value order by coalesce(value->>'id','~'), value::text) from jsonb_array_elements(v_result)), '[]'::jsonb);
end; $$;

create or replace function private.installation_work_items_snapshot(p_installation_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',wi.id,'description',wi.description,'quantity',wi.quantity,'commercial_treatment',wi.commercial_treatment,'customer_charge',wi.customer_charge,'direct_cost',wi.direct_cost,'notes',wi.notes) order by wi.id::text), '[]'::jsonb)
  from public.installation_work_items wi where wi.installation_id=p_installation_id;
$$;

create or replace function private.installation_work_item_cost_attribution()
returns table(event_date date, installation_id uuid, work_item_id uuid, cost_type text, economic_bucket text, sale_id uuid, amount numeric, amount_known boolean, attribution_reason text)
language sql stable set search_path = '' as $$
  select i.installation_date, i.id, wi.id, 'Additional Work'::text,
    case when wi.commercial_treatment='Paid' then 'Installation / Additional Work'
         when wi.commercial_treatment='Included' and si.sale_id is not null then 'Product Sales'
         when wi.commercial_treatment='Complimentary' then 'Complimentary / Goodwill'
         else 'Unallocated' end,
    case when wi.commercial_treatment='Included' and si.sale_id is not null then si.sale_id else null::uuid end,
    wi.direct_cost, wi.direct_cost is not null,
    case when wi.commercial_treatment='Paid' then 'Separately charged additional installation work'
         when wi.commercial_treatment='Included' and si.sale_id is not null then 'Included additional work for sale-generated equipment'
         when wi.commercial_treatment='Included' then 'Included additional work without an originating Aquaguru sale'
         when wi.commercial_treatment='Complimentary' then 'Deliberate complimentary or goodwill additional work'
         else 'Unknown additional work commercial treatment' end
  from public.installation_work_items wi
  join public.installations i on i.id=wi.installation_id
  join public.equipment e on e.id=i.equipment_id
  left join public.sale_items si on si.id=e.sale_item_id
  where i.status='Completed' and i.installation_classification='Initial Installation' and i.installation_date is not null;
$$;

CREATE OR REPLACE FUNCTION public.complete_installation(
  p_submission_key uuid,
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
  p_work_items jsonb
)
 RETURNS TABLE(installation_id uuid, installation_code text, equipment_warranty_id uuid, warranty_code text, created boolean)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_installation_id uuid;
  v_installation_code text;
  v_equipment_id uuid;
  v_status text;
  v_installation_classification text;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_notes text;
  v_other_direct_cost_note text;
  v_work_items jsonb;
  v_equipment_warranty_id uuid;
  v_warranty_code text;
begin
  if p_submission_key is null then
    raise exception using errcode = '22004', message = 'submission_key is required';
  end if;

  if p_installation_id is null or p_installation_date is null then
    raise exception using
      errcode = '22004',
      message = 'installation_id and installation_date are required';
  end if;

  if p_tds_in is not null and p_tds_in < 0
     or p_tds_out is not null and p_tds_out < 0
     or p_installation_charge is not null and p_installation_charge < 0
     or p_technician_charge is not null and p_technician_charge < 0
     or p_travel_cost is not null and p_travel_cost < 0
     or p_other_direct_cost is not null and p_other_direct_cost < 0 then
    raise exception using
      errcode = '22023',
      message = 'TDS and charges must be zero or greater';
  end if;

  if p_other_direct_cost is not null and p_other_direct_cost > 0
     and nullif(btrim(p_other_direct_cost_note), '') is null then
    raise exception using
      errcode = '23514',
      message = 'other_direct_cost_note is required when other_direct_cost is positive';
  end if;

  v_notes := nullif(btrim(p_notes), '');
  v_other_direct_cost_note := nullif(btrim(p_other_direct_cost_note), '');
  v_work_items := private.normalize_installation_work_items(p_work_items, false);
  v_fingerprint := md5(jsonb_build_object(
    'installation_id', p_installation_id,
    'installation_date', p_installation_date,
    'technician_id', p_technician_id,
    'tds_in', p_tds_in,
    'tds_out', p_tds_out,
    'installation_charge', p_installation_charge,
    'technician_charge', p_technician_charge,
    'travel_cost', p_travel_cost,
    'other_direct_cost', p_other_direct_cost,
    'other_direct_cost_note', v_other_direct_cost_note,
    'notes', v_notes,
    'additional_work', v_work_items
  )::text);

  select
    i.id,
    i.installation_code,
    i.completion_submission_fingerprint,
    ew.id,
    ew.warranty_code
  into
    v_installation_id,
    v_installation_code,
    v_existing_fingerprint,
    v_equipment_warranty_id,
    v_warranty_code
  from public.installations i
  left join public.equipment_warranties ew
    on ew.installation_id = i.id
   and ew.is_automatic_sale_origin
  where i.completion_submission_key = p_submission_key;

  if found then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'submission_key already belongs to a different installation completion request';
    end if;

    return query select v_installation_id, v_installation_code, v_equipment_warranty_id, v_warranty_code, false;
    return;
  end if;

  select i.equipment_id
    into v_equipment_id
    from public.installations i
    where i.id = p_installation_id
    for key share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'installation_id does not reference an available installation record';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_equipment_id::text, 0));

  select
    i.id,
    i.installation_code,
    i.equipment_id,
    i.status,
    i.installation_classification
  into
    v_installation_id,
    v_installation_code,
    v_equipment_id,
    v_status,
    v_installation_classification
  from public.installations i
  where i.id = p_installation_id
  for update;

  select
    i.id,
    i.installation_code,
    i.completion_submission_fingerprint,
    ew.id,
    ew.warranty_code
  into
    v_installation_id,
    v_installation_code,
    v_existing_fingerprint,
    v_equipment_warranty_id,
    v_warranty_code
  from public.installations i
  left join public.equipment_warranties ew
    on ew.installation_id = i.id
   and ew.is_automatic_sale_origin
  where i.completion_submission_key = p_submission_key;

  if found then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'submission_key already belongs to a different installation completion request';
    end if;

    return query select v_installation_id, v_installation_code, v_equipment_warranty_id, v_warranty_code, false;
    return;
  end if;

  if v_status = 'Completed' then
    raise exception using
      errcode = '23514',
      message = 'installation is already completed';
  end if;

  if v_status = 'Cancelled' then
    raise exception using
      errcode = '23514',
      message = 'a cancelled installation cannot be completed';
  end if;

  if v_installation_classification = 'Initial Installation' and exists (
    select 1
      from public.installations i
      where i.equipment_id = v_equipment_id
        and i.installation_classification = 'Initial Installation'
        and i.status = 'Completed'
  ) then
    raise exception using
      errcode = '23514',
      message = 'an Initial Installation is already completed for this equipment';
  end if;

  update public.installations as i
    set completion_submission_key = p_submission_key,
        completion_submission_fingerprint = v_fingerprint,
        installation_date = p_installation_date,
        technician_id = p_technician_id,
        tds_in = p_tds_in,
        tds_out = p_tds_out,
        installation_charge = p_installation_charge,
        technician_charge = p_technician_charge,
        travel_cost = p_travel_cost,
        other_direct_cost = p_other_direct_cost,
        other_direct_cost_note = v_other_direct_cost_note,
        notes = v_notes,
        status = 'Completed'
    where i.id = p_installation_id
    returning i.id, i.installation_code into v_installation_id, v_installation_code;


  insert into public.installation_work_items (installation_id, description, quantity, commercial_treatment, customer_charge, direct_cost, notes)
  select v_installation_id, w.description, w.quantity, w.commercial_treatment, w.customer_charge, w.direct_cost, w.notes
  from jsonb_to_recordset(v_work_items) as w(description text, quantity numeric, commercial_treatment text, customer_charge numeric, direct_cost numeric, notes text);
  select ew.id, ew.warranty_code
    into v_equipment_warranty_id, v_warranty_code
    from public.equipment_warranties ew
    where ew.installation_id = v_installation_id
      and ew.is_automatic_sale_origin;

  return query
    select v_installation_id, v_installation_code, v_equipment_warranty_id, v_warranty_code, true;
end;
$function$

;


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


revoke all on function private.normalize_installation_work_items(jsonb, boolean) from public, anon;
grant execute on function private.normalize_installation_work_items(jsonb, boolean) to authenticated;
revoke all on function private.installation_work_items_snapshot(uuid) from public, anon;
grant execute on function private.installation_work_items_snapshot(uuid) to authenticated;
revoke all on function private.installation_work_item_cost_attribution() from public, anon;

revoke all on function public.complete_installation(uuid, uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, jsonb) from public, anon;
grant execute on function public.complete_installation(uuid, uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, jsonb) to authenticated;
revoke all on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, jsonb, text) from public, anon;
grant execute on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, jsonb, text) to authenticated;
notify pgrst, 'reload schema';
