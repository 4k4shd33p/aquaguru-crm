// Quick schema fetch snippet for Supabase JS client
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY'
export const supabase = createClient(supabaseUrl, supabaseKey)

// Fetch Customer with nested Multi-Asset Data
export async function getCustomerWithAssets(customerId) {
  const { data, error } = await supabase
    .from('customers')
    .select(`
      *,
      assets (
        *,
        sales_ledger (*),
        coverage_contracts (*),
        service_tickets (*)
      )
    `)
    .eq('id', customerId)
  
  return { data, error }
}
