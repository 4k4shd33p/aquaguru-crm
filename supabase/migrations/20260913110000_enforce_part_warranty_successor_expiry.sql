-- Prevent Part-Warranty replacements from restarting the original warranty clock.
-- A successor always inherits the end date of the warranty it replaces.

create or replace function private.enforce_part_warranty_successor_expiry()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_claimed_end_date date;
begin
  if new.replaced_warranty_id is null then
    return new;
  end if;

  select parent.end_date
    into v_claimed_end_date
  from public.service_item_warranties as parent
  where parent.id = new.replaced_warranty_id
  for key share;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'replaced_warranty_id does not reference an available part warranty';
  end if;

  if new.start_date > v_claimed_end_date then
    raise exception using
      errcode = '23514',
      message = 'part-warranty successor start date cannot be after the claimed warranty expiry';
  end if;

  new.end_date := v_claimed_end_date;
  return new;
end;
$$;

revoke execute on function private.enforce_part_warranty_successor_expiry()
  from public, anon, authenticated;

drop trigger if exists enforce_part_warranty_successor_expiry
  on public.service_item_warranties;

create trigger enforce_part_warranty_successor_expiry
before insert or update of replaced_warranty_id, start_date, end_date
on public.service_item_warranties
for each row
execute function private.enforce_part_warranty_successor_expiry();
