import { supabase } from '../../../lib/supabase'

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const nil = (value) => typeof value === 'string' ? value.trim() || null : value ?? null

export async function voidPayment({ paymentTable, paymentId, reason }) {
  const { data, error } = await client().rpc('void_payment', { p_payment_table: paymentTable, p_payment_id: paymentId, p_reason: reason })
  if (error) throw error
  return data?.[0] ?? null
}

export async function correctPayment({ paymentTable, paymentId, values }) {
  const { data, error } = await client().rpc('correct_payment', {
    p_payment_table: paymentTable, p_payment_id: paymentId, p_payment_date: values.payment_date,
    p_amount: Number(values.amount), p_payment_method_id: values.payment_method_id,
    p_reference_number: nil(values.reference_number), p_notes: nil(values.notes), p_reason: values.reason,
  })
  if (error) throw error
  return data?.[0] ?? null
}
