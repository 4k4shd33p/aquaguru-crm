-- Fix dynamic EXECUTE lookup handling in the Phase 2.2 payment void RPC.
create or replace function public.void_payment(p_payment_table text, p_payment_id uuid, p_reason text)
returns table(payment_id uuid, payment_status text)
language plpgsql security invoker set search_path to 'pg_catalog', 'public' as $$
declare v_status text; v_parent_id uuid;
begin
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='23514', message='a void reason is required'; end if;
  if p_payment_table not in ('sale_payments','service_payments','amc_payments','emi_payments') then raise exception using errcode='22023', message='unsupported payment type'; end if;
  execute format('select payment_status, %I from public.%I where id=$1 for update',
    case p_payment_table when 'sale_payments' then 'sale_id' when 'service_payments' then 'service_id' when 'amc_payments' then 'amc_cycle_id' else 'emi_account_id' end, p_payment_table)
    into v_status, v_parent_id using p_payment_id;
  if v_status is null then raise exception using errcode='P0002', message='payment was not found'; end if;
  if v_status <> 'Valid' then raise exception using errcode='23514', message='only valid payments can be voided'; end if;
  perform set_config('app.payment_correction_in_progress','on',true);
  execute format('update public.%I set payment_status=''Voided'', voided_at=now(), void_reason=$2 where id=$1', p_payment_table)
    using p_payment_id, btrim(p_reason);
  return query execute format('select id, payment_status from public.%I where id=$1',p_payment_table) using p_payment_id;
end $$;

