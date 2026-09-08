-- Phase 1B.1: default a completed Service's recommended next date.
-- This is a user-facing rename of services.next_service_due; the column remains unchanged.
-- Existing historical rows are not backfilled. A supplied date is always preserved.

create or replace function private.default_service_recommended_next_service()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'Completed' and new.next_service_due is null then
    if tg_op = 'INSERT' then
      new.next_service_due := (new.service_date + interval '4 months')::date;
    elsif old.status is distinct from new.status
       or old.financial_model_version is distinct from new.financial_model_version then
      new.next_service_due := (new.service_date + interval '4 months')::date;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists default_service_recommended_next_service on public.services;
create trigger default_service_recommended_next_service
before insert or update on public.services
for each row execute function private.default_service_recommended_next_service();
