create table public.amc_corrections (
  id uuid primary key default gen_random_uuid(),
  amc_cycle_id uuid not null references public.amc_cycles(id) on delete restrict,
  correction_reason text not null check (btrim(correction_reason) <> ''),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz not null default now()
);
create index amc_corrections_cycle_corrected_at_idx on public.amc_corrections(amc_cycle_id, corrected_at desc);
alter table public.amc_corrections enable row level security;
create policy "authenticated can read amc corrections" on public.amc_corrections for select to authenticated using (true);
create policy "authenticated can add amc corrections" on public.amc_corrections for insert to authenticated with check (true);

create or replace function public.correct_amc_cycle(
  p_amc_cycle_id uuid, p_start_date date, p_end_date date,
  p_agreed_price numeric, p_notes text, p_correction_reason text
) returns table(amc_cycle_id uuid, amc_code text, effective_status text, changed boolean)
language plpgsql security invoker set search_path to 'pg_catalog', 'public'
as $function$
declare v_amc public.amc_cycles%rowtype; v_before jsonb; v_after jsonb; v_initial_date date; v_paid numeric; v_reason text;
begin
  if p_amc_cycle_id is null or p_start_date is null or p_end_date is null then raise exception using errcode='22004', message='AMC, start date and end date are required'; end if;
  if p_end_date < p_start_date then raise exception using errcode='22023', message='AMC end date must be on or after its start date'; end if;
  if p_agreed_price is not null and p_agreed_price < 0 then raise exception using errcode='22023', message='AMC agreed price must be zero or greater'; end if;
  v_reason := nullif(btrim(p_correction_reason), ''); if v_reason is null then raise exception using errcode='23514', message='A correction reason is required'; end if;
  select * into v_amc from public.amc_cycles ac where ac.id=p_amc_cycle_id for update;
  if not found then raise exception using errcode='P0002', message='AMC cycle was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_amc.equipment_id::text, 0));
  select i.installation_date into v_initial_date from public.installations i where i.equipment_id=v_amc.equipment_id and i.installation_classification='Initial Installation' and i.status='Completed';
  if found and p_start_date < v_initial_date then raise exception using errcode='22023', message=format('AMC cannot start before this equipment''s initial installation date (%s).', to_char(v_initial_date,'DD Mon YYYY')); end if;
  if exists (select 1 from public.amc_cycles ac where ac.equipment_id=v_amc.equipment_id and ac.id<>v_amc.id and ac.status='Active' and ac.end_date>=current_date and ac.start_date<=p_end_date and ac.end_date>=p_start_date) then raise exception using errcode='23514', message='This AMC period overlaps another active AMC cycle for the equipment'; end if;
  if exists (select 1 from public.services s where s.amc_cycle_id=v_amc.id and s.service_date not between p_start_date and p_end_date)
     or exists (select 1 from public.service_items si join public.services s on s.id=si.service_id where si.amc_cycle_id=v_amc.id and s.service_date not between p_start_date and p_end_date) then raise exception using errcode='23514', message='AMC dates cannot exclude an already-recorded AMC-covered Service'; end if;
  select coalesce(sum(p.amount),0) into v_paid from public.amc_payments p where p.amc_cycle_id=v_amc.id and coalesce(p.payment_status,'Valid')='Valid';
  if p_agreed_price is not null and p_agreed_price < v_paid then raise exception using errcode='23514', message='AMC agreed price cannot be lower than valid Amount Received'; end if;
  if (v_amc.start_date,v_amc.end_date,v_amc.agreed_price,v_amc.notes) is not distinct from (p_start_date,p_end_date,p_agreed_price,nullif(btrim(p_notes),'')) then return query select v_amc.id,v_amc.amc_code,case when v_amc.status='Active' and v_amc.end_date<current_date then 'Expired' else v_amc.status end,false; return; end if;
  v_before:=to_jsonb(v_amc);
  update public.amc_cycles set start_date=p_start_date,end_date=p_end_date,agreed_price=p_agreed_price,notes=nullif(btrim(p_notes),'') where id=v_amc.id;
  select * into v_amc from public.amc_cycles where id=p_amc_cycle_id; v_after:=to_jsonb(v_amc);
  insert into public.amc_corrections(amc_cycle_id,correction_reason,before_snapshot,after_snapshot,corrected_by) values(v_amc.id,v_reason,v_before,v_after,auth.uid());
  return query select v_amc.id,v_amc.amc_code,case when v_amc.status='Active' and v_amc.end_date<current_date then 'Expired' else v_amc.status end,true;
end;
$function$;
revoke all on function public.correct_amc_cycle(uuid,date,date,numeric,text,text) from public;
revoke all on function public.correct_amc_cycle(uuid,date,date,numeric,text,text) from anon;
grant execute on function public.correct_amc_cycle(uuid,date,date,numeric,text,text) to authenticated;

