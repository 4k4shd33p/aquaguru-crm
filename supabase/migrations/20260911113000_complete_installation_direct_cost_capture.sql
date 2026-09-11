-- Phase 3.2.1C.1: complete existing Initial Installation direct-cost capture.
-- No revenue, payment, work-item, or Finance-category changes are introduced.

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
  p_notes text
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
  v_fingerprint := md5(jsonb_build_object(
    'installation_id', p_installation_id,
    'installation_date', p_installation_date,
    'technician_id', p_technician_id,
    'tds_in', p_tds_in,
    'tds_out', p_tds_out,
    'installation_charge', p_installation_charge,
    'technician_charge', p_technician_charge,
    'notes', v_notes
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
        other_direct_cost_note = nullif(btrim(p_other_direct_cost_note), ''),
        notes = v_notes,
        status = 'Completed'
    where i.id = p_installation_id
    returning i.id, i.installation_code into v_installation_id, v_installation_code;

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

  v_changed := (v_installation.installation_date, v_installation.technician_id,
                v_installation.tds_in, v_installation.tds_out,
                v_installation.installation_charge, v_installation.technician_charge,
                v_installation.travel_cost, v_installation.other_direct_cost,
                v_installation.other_direct_cost_note, v_installation.notes)
               is distinct from
               (p_installation_date, p_technician_id, p_tds_in, p_tds_out,
                p_installation_charge, p_technician_charge, p_travel_cost,
                p_other_direct_cost, nullif(btrim(p_other_direct_cost_note), ''),
                nullif(btrim(p_notes), ''));

  if not v_changed then
    return query select v_installation.id, v_installation.installation_code,
      v_warranty.id, v_warranty.warranty_code, false;
    return;
  end if;

  v_before := jsonb_build_object('installation', to_jsonb(v_installation), 'automatic_warranty', to_jsonb(v_warranty));
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

  select * into v_installation from public.installations where id = p_installation_id;
  select * into v_warranty from public.equipment_warranties as ew
    where ew.installation_id = p_installation_id and ew.is_automatic_sale_origin;
  v_after := jsonb_build_object('installation', to_jsonb(v_installation), 'automatic_warranty', to_jsonb(v_warranty));

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

create or replace function private.protect_automatic_sale_origin_installation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'Completed'
     and (old.equipment_id, old.sale_item_id, old.installation_classification,
          old.status, old.installation_date, old.technician_id, old.tds_in,
          old.tds_out, old.installation_charge, old.technician_charge,
          old.travel_cost, old.other_direct_cost, old.other_direct_cost_note, old.notes)
         is distinct from
         (new.equipment_id, new.sale_item_id, new.installation_classification,
          new.status, new.installation_date, new.technician_id, new.tds_in,
          new.tds_out, new.installation_charge, new.technician_charge,
          new.travel_cost, new.other_direct_cost, new.other_direct_cost_note, new.notes)
     and current_setting('app.installation_correction_in_progress', true) is distinct from 'on' then
    raise exception using
      errcode = '23514',
      message = 'Completed Installation corrections must use correct_installation';
  end if;
  return new;
end;
$$;

revoke all on function public.complete_installation(uuid, uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.complete_installation(uuid, uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text) to authenticated;
revoke all on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text) to authenticated;

notify pgrst, 'reload schema';
