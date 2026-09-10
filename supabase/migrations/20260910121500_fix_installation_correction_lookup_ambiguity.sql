-- Fix only the PL/pgSQL output-column ambiguity in correct_installation.

CREATE OR REPLACE FUNCTION public.correct_installation(p_installation_id uuid, p_installation_date date, p_technician_id uuid, p_tds_in numeric, p_tds_out numeric, p_installation_charge numeric, p_technician_charge numeric, p_notes text, p_correction_reason text)
 RETURNS TABLE(installation_id uuid, installation_code text, equipment_warranty_id uuid, warranty_code text, warranty_reconciled boolean)
 LANGUAGE plpgsql
 SECURITY INVOKER
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
     or p_technician_charge is not null and p_technician_charge < 0 then
    raise exception using errcode = '22023', message = 'TDS and charges must be zero or greater';
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
                v_installation.notes)
               is distinct from
               (p_installation_date, p_technician_id, p_tds_in, p_tds_out,
                p_installation_charge, p_technician_charge, nullif(btrim(p_notes), ''));

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
$function$;

revoke all on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, text, text) from public;
revoke all on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, text, text) from anon;
grant execute on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, text, text) to authenticated;
