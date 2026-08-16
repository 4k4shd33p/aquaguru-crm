-- Enforce configurable catalogue eligibility for all part-warranty records.
create or replace function private.validate_service_item_warranty()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  item_equipment uuid;
  item_part uuid;
  replaced_equipment uuid;
  replaced_part uuid;
  is_warranty_eligible boolean;
begin
  select part_warranty_eligible into is_warranty_eligible
    from public.parts
    where id = new.part_id;

  if is_warranty_eligible is not true then
    raise exception 'Part % is not eligible for a part warranty', new.part_id
      using errcode = 'check_violation';
  end if;

  select s.equipment_id, si.part_id into item_equipment, item_part
    from public.service_items si
    join public.services s on s.id = si.service_id
    where si.id = new.service_item_id;

  if item_equipment <> new.equipment_id or item_part is distinct from new.part_id then
    raise exception 'Part warranty must match its source service item equipment and part';
  end if;

  if new.replaced_warranty_id is not null then
    select equipment_id, part_id into replaced_equipment, replaced_part
      from public.service_item_warranties
      where id = new.replaced_warranty_id;

    if replaced_equipment <> new.equipment_id or replaced_part <> new.part_id then
      raise exception 'Replaced part warranty must match the same equipment and part';
    end if;
  end if;

  return new;
end $$;

