-- Atomic, idempotent AMC cycle creation and renewal.
-- The function is the sole frontend write path for allocating a cycle number.

alter table public.amc_cycles
  add column submission_key uuid,
  add column submission_fingerprint text,
  add constraint amc_cycles_submission_key_key unique (submission_key);

create or replace function public.create_amc_cycle(
  p_submission_key uuid,
  p_equipment_id uuid,
  p_start_date date,
  p_end_date date,
  p_standard_price numeric default null,
  p_agreed_price numeric default null,
  p_planned_visits integer default null,
  p_status text default 'Active',
  p_notes text default null
)
returns table (
  amc_cycle_id uuid,
  amc_code text,
  cycle_number integer,
  created boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_amc_cycle_id uuid;
  v_amc_code text;
  v_cycle_number integer;
  v_existing_submission_fingerprint text;
  v_submission_fingerprint text;
  v_status text;
  v_notes text;
  v_planned_visits integer;
begin
  if p_submission_key is null then
    raise exception using errcode = '22004', message = 'submission_key is required';
  end if;

  if p_equipment_id is null or p_start_date is null or p_end_date is null then
    raise exception using errcode = '22004', message = 'equipment_id, start_date, and end_date are required';
  end if;

  if p_end_date < p_start_date then
    raise exception using errcode = '22023', message = 'end_date must be on or after start_date';
  end if;

  v_status := nullif(btrim(p_status), '');
  if v_status is null or v_status not in ('Active', 'Expired', 'Cancelled', 'Void', 'Unknown') then
    raise exception using errcode = '22023', message = 'status must be Active, Expired, Cancelled, Void, or Unknown';
  end if;

  v_planned_visits := coalesce(p_planned_visits, 3);
  if v_planned_visits < 0 then
    raise exception using errcode = '22023', message = 'planned_visits must be zero or greater';
  end if;

  if p_standard_price is not null and p_standard_price < 0 then
    raise exception using errcode = '22023', message = 'standard_price must be zero or greater';
  end if;

  if p_agreed_price is not null and p_agreed_price < 0 then
    raise exception using errcode = '22023', message = 'agreed_price must be zero or greater';
  end if;

  v_notes := nullif(btrim(p_notes), '');
  v_submission_fingerprint := md5(jsonb_build_object(
    'equipment_id', p_equipment_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'standard_price', p_standard_price,
    'agreed_price', p_agreed_price,
    'planned_visits', v_planned_visits,
    'status', v_status,
    'notes', v_notes
  )::text);

  select ac.id, ac.amc_code, ac.cycle_number, ac.submission_fingerprint
    into v_amc_cycle_id, v_amc_code, v_cycle_number, v_existing_submission_fingerprint
    from public.amc_cycles ac
    where ac.submission_key = p_submission_key;

  if found then
    if v_existing_submission_fingerprint is distinct from v_submission_fingerprint then
      raise exception using errcode = '23505', message = 'submission_key already belongs to a different AMC cycle request';
    end if;

    return query select v_amc_cycle_id, v_amc_code, v_cycle_number, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_equipment_id::text, 0));

  perform 1
    from public.equipment e
    where e.id = p_equipment_id
    for key share;

  if not found then
    raise exception using errcode = '23503', message = 'equipment_id does not reference an available equipment record';
  end if;

  -- Re-check after taking the equipment lock so same-equipment retries return cleanly.
  select ac.id, ac.amc_code, ac.cycle_number, ac.submission_fingerprint
    into v_amc_cycle_id, v_amc_code, v_cycle_number, v_existing_submission_fingerprint
    from public.amc_cycles ac
    where ac.submission_key = p_submission_key;

  if found then
    if v_existing_submission_fingerprint is distinct from v_submission_fingerprint then
      raise exception using errcode = '23505', message = 'submission_key already belongs to a different AMC cycle request';
    end if;

    return query select v_amc_cycle_id, v_amc_code, v_cycle_number, false;
    return;
  end if;

  if v_status = 'Active' and exists (
    select 1
      from public.amc_cycles ac
      where ac.equipment_id = p_equipment_id
        and ac.status = 'Active'
        and ac.start_date <= p_end_date
        and ac.end_date >= p_start_date
  ) then
    raise exception using errcode = '23514', message = 'an Active AMC cycle already overlaps this equipment and date range';
  end if;

  select coalesce(max(ac.cycle_number), 0) + 1
    into v_cycle_number
    from public.amc_cycles ac
    where ac.equipment_id = p_equipment_id;

  insert into public.amc_cycles (
    submission_key,
    submission_fingerprint,
    equipment_id,
    cycle_number,
    start_date,
    end_date,
    standard_price,
    agreed_price,
    planned_visits,
    status,
    notes
  )
  values (
    p_submission_key,
    v_submission_fingerprint,
    p_equipment_id,
    v_cycle_number,
    p_start_date,
    p_end_date,
    p_standard_price,
    p_agreed_price,
    v_planned_visits,
    v_status,
    v_notes
  )
  on conflict (submission_key) do nothing
  returning id, amc_code, cycle_number
    into v_amc_cycle_id, v_amc_code, v_cycle_number;

  if found then
    return query select v_amc_cycle_id, v_amc_code, v_cycle_number, true;
    return;
  end if;

  select ac.id, ac.amc_code, ac.cycle_number, ac.submission_fingerprint
    into v_amc_cycle_id, v_amc_code, v_cycle_number, v_existing_submission_fingerprint
    from public.amc_cycles ac
    where ac.submission_key = p_submission_key;

  if not found then
    raise exception using errcode = '23505', message = 'submission_key conflict could not be resolved';
  end if;

  if v_existing_submission_fingerprint is distinct from v_submission_fingerprint then
    raise exception using errcode = '23505', message = 'submission_key already belongs to a different AMC cycle request';
  end if;

  return query select v_amc_cycle_id, v_amc_code, v_cycle_number, false;
end;
$$;

revoke all on function public.create_amc_cycle(uuid, uuid, date, date, numeric, numeric, integer, text, text) from public;
revoke all on function public.create_amc_cycle(uuid, uuid, date, date, numeric, numeric, integer, text, text) from anon;
grant execute on function public.create_amc_cycle(uuid, uuid, date, date, numeric, numeric, integer, text, text) to authenticated;

