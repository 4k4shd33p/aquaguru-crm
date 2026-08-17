-- Review-only atomic Installation workflow.
-- Do not apply until the accompanying design review is approved.

alter table public.installations
  add column installation_classification text not null default 'Initial Installation',
  add column submission_key uuid,
  add column submission_fingerprint text,
  add column completion_submission_key uuid,
  add column completion_submission_fingerprint text,
  add constraint installations_installation_classification_check
    check (installation_classification in ('Initial Installation', 'Reinstallation / Relocation')),
  add constraint installations_submission_key_key unique (submission_key),
  add constraint installations_completion_submission_key_key unique (completion_submission_key);

alter table public.equipment_warranties
  add column is_automatic_sale_origin boolean not null default false;

-- An Equipment can have only one completed Initial Installation. Reinstallation /
-- Relocation events remain unrestricted historical events.
create unique index installations_one_completed_initial_per_equipment_key
  on public.installations (equipment_id)
  where installation_classification = 'Initial Installation'
    and status = 'Completed';

-- Manual/historical warranties remain possible. This applies only to the one
-- automatically derived sale-origin warranty for a qualifying Initial Installation.
create unique index equipment_warranties_one_automatic_sale_origin_per_installation_key
  on public.equipment_warranties (installation_id)
  where is_automatic_sale_origin;

create or replace function private.validate_installation_sale_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_equipment_sale_item_id uuid;
begin
  select e.sale_item_id
    into v_equipment_sale_item_id
    from public.equipment e
    where e.id = new.equipment_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'equipment_id does not reference an available equipment record';
  end if;

  if new.sale_item_id is not null
     and new.sale_item_id is distinct from v_equipment_sale_item_id then
    raise exception using
      errcode = '23514',
      message = 'Installation sale_item_id must match equipment.sale_item_id';
  end if;

  -- A sale-linked Equipment must carry its exact sale item on its Initial
  -- Installation, so direct table writes cannot silently bypass eligibility.
  if new.installation_classification = 'Initial Installation'
     and v_equipment_sale_item_id is not null
     and new.sale_item_id is distinct from v_equipment_sale_item_id then
    raise exception using
      errcode = '23514',
      message = 'Initial Installation must reference the equipment sale_item_id';
  end if;

  return new;
end;
$$;

create trigger validate_installation_sale_item
before insert or update of equipment_id, sale_item_id, installation_classification
on public.installations
for each row execute function private.validate_installation_sale_item();

create or replace function private.protect_automatic_sale_origin_installation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (old.equipment_id, old.sale_item_id, old.installation_classification,
      old.status, old.installation_date)
       is distinct from
     (new.equipment_id, new.sale_item_id, new.installation_classification,
      new.status, new.installation_date)
     and exists (
       select 1
         from public.equipment_warranties ew
        where ew.installation_id = old.id
          and ew.is_automatic_sale_origin
     ) then
    raise exception using
      errcode = '23514',
      message = 'Installation fields linked to an automatic sale-origin warranty cannot be changed';
  end if;

  return new;
end;
$$;

create trigger protect_automatic_sale_origin_installation
before update on public.installations
for each row execute function private.protect_automatic_sale_origin_installation();

create or replace function private.validate_equipment_warranty_installation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_installation_equipment_id uuid;
  v_installation_status text;
  v_installation_classification text;
  v_actual_date date;
  v_installation_sale_item_id uuid;
  v_equipment_sale_item_id uuid;
  v_equipment_source text;
  v_sale_id uuid;
  v_warranty_months integer;
  v_expected_end_date date;
begin
  if tg_op = 'UPDATE'
     and old.is_automatic_sale_origin
     and not new.is_automatic_sale_origin then
    raise exception using
      errcode = '23514',
      message = 'Automatic sale-origin warranty marker cannot be removed';
  end if;

  if new.installation_id is not null then
    select
      i.equipment_id,
      i.status,
      i.installation_classification,
      i.installation_date,
      i.sale_item_id,
      e.sale_item_id,
      e.source,
      si.sale_id,
      si.warranty_months
    into
      v_installation_equipment_id,
      v_installation_status,
      v_installation_classification,
      v_actual_date,
      v_installation_sale_item_id,
      v_equipment_sale_item_id,
      v_equipment_source,
      v_sale_id,
      v_warranty_months
    from public.installations i
    join public.equipment e on e.id = i.equipment_id
    left join public.sale_items si on si.id = i.sale_item_id
    where i.id = new.installation_id;

    if v_installation_equipment_id is distinct from new.equipment_id then
      raise exception using
        errcode = '23514',
        message = 'Warranty installation must belong to the warranty equipment';
    end if;

    if v_installation_status <> 'Completed' or v_actual_date is null then
      raise exception using
        errcode = '23514',
        message = 'Warranty installation must be completed and have an actual installation date';
    end if;

    if new.start_date <> v_actual_date then
      raise exception using
        errcode = '23514',
        message = 'Warranty start date must equal the actual installation date';
    end if;
  end if;

  if new.is_automatic_sale_origin then
    if new.installation_id is null then
      raise exception using
        errcode = '23514',
        message = 'Automatic sale-origin warranty requires an installation';
    end if;

    if v_installation_classification <> 'Initial Installation'
       or v_installation_status <> 'Completed'
       or v_actual_date is null then
      raise exception using
        errcode = '23514',
        message = 'Automatic sale-origin warranty requires a completed Initial Installation';
    end if;

    if v_installation_sale_item_id is null
       or v_installation_sale_item_id is distinct from v_equipment_sale_item_id then
      raise exception using
        errcode = '23514',
        message = 'Automatic sale-origin warranty requires the matching equipment sale item';
    end if;

    if v_equipment_source <> 'Aquaguru Sale' then
      raise exception using
        errcode = '23514',
        message = 'Automatic sale-origin warranty requires Aquaguru Sale equipment';
    end if;

    if v_warranty_months is null or v_warranty_months <= 0 then
      raise exception using
        errcode = '23514',
        message = 'Automatic sale-origin warranty requires sale-item warranty_months greater than zero';
    end if;

    v_expected_end_date :=
      (v_actual_date + make_interval(months => v_warranty_months) - interval '1 day')::date;

    if new.sale_id is distinct from v_sale_id
       or new.duration_months <> v_warranty_months
       or new.end_date <> v_expected_end_date then
      raise exception using
        errcode = '23514',
        message = 'Automatic sale-origin warranty must match the qualifying Initial Installation and sale-item warranty terms';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.protect_automatic_sale_origin_warranty()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.is_automatic_sale_origin then
    raise exception using
      errcode = '23514',
      message = 'Automatic sale-origin warranty cannot be deleted; use its status instead';
  end if;

  return old;
end;
$$;

create trigger protect_automatic_sale_origin_warranty
before delete on public.equipment_warranties
for each row execute function private.protect_automatic_sale_origin_warranty();

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

  v_end_date :=
    (new.installation_date + make_interval(months => v_warranty_months) - interval '1 day')::date;

  insert into public.equipment_warranties as ew (
    equipment_id,
    sale_id,
    installation_id,
    start_date,
    end_date,
    duration_months,
    status,
    is_automatic_sale_origin
  )
  values (
    new.equipment_id,
    v_sale_id,
    new.id,
    new.installation_date,
    v_end_date,
    v_warranty_months,
    'Active',
    true
  )
  on conflict (installation_id) where is_automatic_sale_origin do nothing;

  return new;
end;
$$;

create trigger activate_sale_origin_equipment_warranty
after insert or update of equipment_id, sale_item_id, installation_classification, status, installation_date
on public.installations
for each row execute function private.activate_sale_origin_equipment_warranty();

create or replace function public.create_installation(
  p_submission_key uuid,
  p_equipment_id uuid,
  p_installation_classification text,
  p_scheduled_date date default null,
  p_sale_item_id uuid default null,
  p_technician_id uuid default null,
  p_notes text default null
)
returns table (
  installation_id uuid,
  installation_code text,
  created boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_installation_id uuid;
  v_installation_code text;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_installation_classification text;
  v_notes text;
begin
  if p_submission_key is null then
    raise exception using errcode = '22004', message = 'submission_key is required';
  end if;

  if p_equipment_id is null then
    raise exception using errcode = '22004', message = 'equipment_id is required';
  end if;

  v_installation_classification := nullif(btrim(p_installation_classification), '');
  if v_installation_classification not in ('Initial Installation', 'Reinstallation / Relocation') then
    raise exception using
      errcode = '22023',
      message = 'installation_classification must be Initial Installation or Reinstallation / Relocation';
  end if;

  v_notes := nullif(btrim(p_notes), '');
  v_fingerprint := md5(jsonb_build_object(
    'equipment_id', p_equipment_id,
    'installation_classification', v_installation_classification,
    'scheduled_date', p_scheduled_date,
    'sale_item_id', p_sale_item_id,
    'technician_id', p_technician_id,
    'notes', v_notes
  )::text);

  select i.id, i.installation_code, i.submission_fingerprint
    into v_installation_id, v_installation_code, v_existing_fingerprint
    from public.installations i
    where i.submission_key = p_submission_key;

  if found then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'submission_key already belongs to a different installation request';
    end if;

    return query select v_installation_id, v_installation_code, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_equipment_id::text, 0));

  perform 1
    from public.equipment e
    where e.id = p_equipment_id
    for key share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'equipment_id does not reference an available equipment record';
  end if;

  select i.id, i.installation_code, i.submission_fingerprint
    into v_installation_id, v_installation_code, v_existing_fingerprint
    from public.installations i
    where i.submission_key = p_submission_key;

  if found then
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'submission_key already belongs to a different installation request';
    end if;

    return query select v_installation_id, v_installation_code, false;
    return;
  end if;

  insert into public.installations as i (
    submission_key,
    submission_fingerprint,
    equipment_id,
    sale_item_id,
    installation_classification,
    scheduled_date,
    technician_id,
    status,
    notes
  )
  values (
    p_submission_key,
    v_fingerprint,
    p_equipment_id,
    p_sale_item_id,
    v_installation_classification,
    p_scheduled_date,
    p_technician_id,
    'Scheduled',
    v_notes
  )
  on conflict (submission_key) do nothing
  returning i.id, i.installation_code into v_installation_id, v_installation_code;

  if found then
    return query select v_installation_id, v_installation_code, true;
    return;
  end if;

  select i.id, i.installation_code, i.submission_fingerprint
    into v_installation_id, v_installation_code, v_existing_fingerprint
    from public.installations i
    where i.submission_key = p_submission_key;

  if not found then
    raise exception using errcode = '23505', message = 'submission_key conflict could not be resolved';
  end if;

  if v_existing_fingerprint is distinct from v_fingerprint then
    raise exception using
      errcode = '23505',
      message = 'submission_key already belongs to a different installation request';
  end if;

  return query select v_installation_id, v_installation_code, false;
end;
$$;

create or replace function public.complete_installation(
  p_submission_key uuid,
  p_installation_id uuid,
  p_installation_date date,
  p_technician_id uuid default null,
  p_tds_in numeric default null,
  p_tds_out numeric default null,
  p_installation_charge numeric default null,
  p_technician_charge numeric default null,
  p_notes text default null
)
returns table (
  installation_id uuid,
  installation_code text,
  equipment_warranty_id uuid,
  warranty_code text,
  created boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
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
     or p_technician_charge is not null and p_technician_charge < 0 then
    raise exception using
      errcode = '22023',
      message = 'TDS and charges must be zero or greater';
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
$$;

revoke all on function public.create_installation(uuid, uuid, text, date, uuid, uuid, text) from public;
revoke all on function public.create_installation(uuid, uuid, text, date, uuid, uuid, text) from anon;
grant execute on function public.create_installation(uuid, uuid, text, date, uuid, uuid, text) to authenticated;

revoke all on function public.complete_installation(uuid, uuid, date, uuid, numeric, numeric, numeric, numeric, text) from public;
revoke all on function public.complete_installation(uuid, uuid, date, uuid, numeric, numeric, numeric, numeric, text) from anon;
grant execute on function public.complete_installation(uuid, uuid, date, uuid, numeric, numeric, numeric, numeric, text) to authenticated;


