-- Phase 1C.2: preserve known Equipment location moves without fabricating historical baselines.

create table public.equipment_location_history (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  old_location_id uuid not null references public.locations(id) on delete restrict,
  new_location_id uuid not null references public.locations(id) on delete restrict,
  movement_date date,
  source text,
  source_service_id uuid references public.services(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  constraint equipment_location_history_actual_change_check check (old_location_id <> new_location_id)
);

create index equipment_location_history_equipment_date_idx
  on public.equipment_location_history (equipment_id, movement_date desc nulls last, created_at desc);

alter table public.equipment_location_history enable row level security;

revoke all on public.equipment_location_history from public;
revoke all on public.equipment_location_history from anon;
grant select, insert on public.equipment_location_history to authenticated;

create policy equipment_location_history_authenticated_read
  on public.equipment_location_history for select to authenticated using (true);

create policy equipment_location_history_authenticated_append
  on public.equipment_location_history for insert to authenticated with check (true);

create or replace function private.validate_equipment_location_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_equipment_customer_id uuid;
  v_old_location_customer_id uuid;
  v_new_location_customer_id uuid;
  v_source_equipment_id uuid;
begin
  select e.customer_id into v_equipment_customer_id
  from public.equipment e
  where e.id = new.equipment_id;

  if not found then
    raise exception using errcode = '23503', message = 'equipment location history requires an existing equipment record';
  end if;

  select l.customer_id into v_old_location_customer_id
  from public.locations l
  where l.id = new.old_location_id;

  select l.customer_id into v_new_location_customer_id
  from public.locations l
  where l.id = new.new_location_id;

  if v_old_location_customer_id is distinct from v_equipment_customer_id
     or v_new_location_customer_id is distinct from v_equipment_customer_id then
    raise exception using errcode = '23514', message = 'both location history records must belong to the equipment customer';
  end if;

  if new.source_service_id is not null then
    select s.equipment_id into v_source_equipment_id
    from public.services s
    where s.id = new.source_service_id;

    if not found or v_source_equipment_id <> new.equipment_id then
      raise exception using errcode = '23514', message = 'location history source service must belong to the equipment';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_equipment_location_history_before_insert
before insert on public.equipment_location_history
for each row execute function private.validate_equipment_location_history();

create or replace function private.prevent_equipment_location_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '55000', message = 'equipment location history is immutable; record a correcting movement instead';
end;
$$;

create trigger prevent_equipment_location_history_mutation
before update or delete on public.equipment_location_history
for each row execute function private.prevent_equipment_location_history_mutation();

create or replace function public.move_equipment_location(
  p_equipment_id uuid,
  p_new_location_id uuid,
  p_movement_date date default null,
  p_source text default null,
  p_notes text default null,
  p_source_service_id uuid default null
)
returns table (
  history_id uuid,
  equipment_id uuid,
  old_location_id uuid,
  new_location_id uuid,
  movement_date date
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_equipment_customer_id uuid;
  v_old_location_id uuid;
  v_new_location_customer_id uuid;
  v_source_equipment_id uuid;
  v_history_id uuid;
  v_source text;
  v_notes text;
begin
  if p_equipment_id is null or p_new_location_id is null then
    raise exception using errcode = '22004', message = 'equipment and destination location are required';
  end if;

  select e.customer_id, e.location_id
    into v_equipment_customer_id, v_old_location_id
    from public.equipment e
    where e.id = p_equipment_id
    for update;

  if not found then
    raise exception using errcode = '23503', message = 'equipment was not found';
  end if;

  select l.customer_id
    into v_new_location_customer_id
    from public.locations l
    where l.id = p_new_location_id
    for key share;

  if not found then
    raise exception using errcode = '23503', message = 'destination location was not found';
  end if;

  if v_new_location_customer_id <> v_equipment_customer_id then
    raise exception using errcode = '23514', message = 'destination location must belong to the equipment customer';
  end if;

  if p_source_service_id is not null then
    select s.equipment_id
      into v_source_equipment_id
      from public.services s
      where s.id = p_source_service_id;

    if not found or v_source_equipment_id <> p_equipment_id then
      raise exception using errcode = '23514', message = 'location source service must belong to the equipment';
    end if;
  end if;

  if v_old_location_id is null then
    update public.equipment e
      set location_id = p_new_location_id
      where e.id = p_equipment_id;

    return query select null::uuid, p_equipment_id, null::uuid, p_new_location_id, p_movement_date;
    return;
  end if;

  if v_old_location_id = p_new_location_id then
    raise exception using errcode = '23514', message = 'equipment is already assigned to the selected location';
  end if;

  v_source := nullif(btrim(p_source), '');
  v_notes := nullif(btrim(p_notes), '');

  insert into public.equipment_location_history (
    equipment_id, old_location_id, new_location_id, movement_date, source, source_service_id, notes
  )
  values (
    p_equipment_id, v_old_location_id, p_new_location_id, p_movement_date, v_source, p_source_service_id, v_notes
  )
  returning id into v_history_id;

  update public.equipment e
    set location_id = p_new_location_id
    where e.id = p_equipment_id;

  return query select v_history_id, p_equipment_id, v_old_location_id, p_new_location_id, p_movement_date;
end;
$$;

revoke all on function public.move_equipment_location(uuid, uuid, date, text, text, uuid) from public;
revoke all on function public.move_equipment_location(uuid, uuid, date, text, text, uuid) from anon;
grant execute on function public.move_equipment_location(uuid, uuid, date, text, text, uuid) to authenticated;
