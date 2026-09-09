-- Fix dynamic EXECUTE lookup handling in the Phase 2.2 payment correction RPC.
create or replace function public.correct_payment(
  p_payment_table text, p_payment_id uuid, p_payment_date date, p_amount numeric,
  p_payment_method_id uuid, p_reference_number text, p_notes text, p_reason text)
returns table(original_payment_id uuid, replacement_payment_id uuid, replacement_payment_code text)
language plpgsql security invoker set search_path to 'pg_catalog', 'public' as $$
declare v_status text; v_parent_id uuid; v_replacement_id uuid; v_replacement_code text; v_parent_column text;
begin
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='23514', message='a correction reason is required'; end if;
  if p_payment_date is null then raise exception using errcode='23514', message='a corrected payment date is required'; end if;
  if p_payment_method_id is null then raise exception using errcode='23502', message='a corrected payment method is required'; end if;
  if p_payment_table not in ('sale_payments','service_payments','amc_payments','emi_payments') then raise exception using errcode='22023', message='unsupported payment type'; end if;
  v_parent_column := case p_payment_table when 'sale_payments' then 'sale_id' when 'service_payments' then 'service_id' when 'amc_payments' then 'amc_cycle_id' else 'emi_account_id' end;
  execute format('select payment_status, %I from public.%I where id=$1 for update',v_parent_column,p_payment_table) into v_status,v_parent_id using p_payment_id;
  if v_status is null then raise exception using errcode='P0002', message='payment was not found'; end if;
  if v_status <> 'Valid' then raise exception using errcode='23514', message='only valid payments can be corrected'; end if;
  perform set_config('app.payment_correction_in_progress','on',true);
  execute format('update public.%I set payment_status=''Corrected'', voided_at=now(), void_reason=$2 where id=$1',p_payment_table) using p_payment_id,btrim(p_reason);
  perform private.assert_payment_replacement_ceiling(p_payment_table,v_parent_id,p_amount);
  execute format('insert into public.%I (%I,payment_date,amount,payment_method_id,reference_number,notes,correction_of_payment_id) values ($1,$2,$3,$4,$5,$6,$7) returning id,payment_code',p_payment_table,v_parent_column)
    into v_replacement_id,v_replacement_code using v_parent_id,p_payment_date,p_amount,p_payment_method_id,nullif(btrim(p_reference_number),''),nullif(btrim(p_notes),''),p_payment_id;
  execute format('update public.%I set corrected_by_payment_id=$2 where id=$1',p_payment_table) using p_payment_id,v_replacement_id;
  return query select p_payment_id,v_replacement_id,v_replacement_code;
end $$;

