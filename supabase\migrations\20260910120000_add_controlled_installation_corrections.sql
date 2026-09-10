-- Controlled corrections for completed Initial Installations.
-- Source Installation facts and their automatic sale-origin Equipment Warranty stay atomic.

create table if not exists public.installation_corrections (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete restrict,
  correction_reason text not null check (btrim(correction_reason) <> ''),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz not null default now()
);

create index if not exists installation_corrections_installation_id_idx
  on public.installation_corrections(installation_id, corrected_at desc);

alter table public.installation_corrections enable row level security;

create policy "authenticated can read installation corrections"
  on public.installation_corrections for select to authenticated using (true);

create policy "authenticated can create installation corrections"
  on public.installation_corrections for insert to authenticated with check (true);

create or replace function private.protect_automatic_sale_origin_installation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'Completed'
     and (old.equipment_id, old.sale_item_id, old.installation_classification,
          old.status, old.installation_date, old.technician_id, old.tds_in,
          old.tds_out, old.installation_charge, old.technician_charge, old.notes)
         is distinct from
         (new.equipment_id, new.sale_item_id, new.installation_classification,
          new.status, new.installation_date, new.technician_id, new.tds_in,
          new.tds_out, new.installation_charge, new.technician_charge, new.notes)
     and current_setting('app.installation_correction_in_progress', true) is distinct from 'on' then
    raise exception using
      errcode = '23514',
      message = 'Completed Installation corrections must use correct_installation';
  end if;

  return new;
end;
$$;

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
  ) values (
    new.equipment_id, v_sale_id, new.id, new.installation_date, v_end_date,
    v_warranty_months, case when v_end_date < current_date then 'Expired' else 'Active' end, true
  )
  on conflict (installation_id) where is_automatic_sale_origin do update
    set start_date = excluded.start_date,
        end_date = excluded.end_date,
        duration_months = excluded.duration_months,
        status = excluded.status;

  return new;
end;
$$;

create or replace function public.correct_installation(
  p_installation_id uuid,
  p_installation_date date,
  p_technician_id uuid,
  p_tds_in numeric,
  p_tds_out numeric,
  p_installation_charge numeric,
  p_technician_charge numeric,
  p_notes text,
  p_correction_reason text
)
returns table (
  installation_id uuid,
  installation_code text,
  equipment_warranty_id uuid,
  warranty_code text,
  warranty_reconciled boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
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
    from public.equipment_warranties
    where installation_id = p_installation_id
      and is_automatic_sale_origin
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
  select * into v_warranty from public.equipment_warranties
    where installation_id = p_installation_id and is_automatic_sale_origin;
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
$$;

revoke all on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, text, text) from public;
revoke all on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, text, text) from anon;
grant execute on function public.correct_installation(uuid, date, uuid, numeric, numeric, numeric, numeric, text, text) to authenticated;

