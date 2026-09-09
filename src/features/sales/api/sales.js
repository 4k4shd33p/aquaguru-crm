import { supabase } from '../../../lib/supabase'

const saleFields = `id, sale_code, customer_id, sale_date, invoice_number, invoice_date, status, lead_source_id, source_detail, notes, created_at,
  customers ( id, customer_code, name, phone ), lead_sources ( id, name ),
  sale_items ( id, product_model_id, quantity, standard_unit_price, actual_unit_price, unit_cost, discount, warranty_months, notes, product_models ( id, product_code, model_name ) ),
  sale_payments ( id, payment_code, payment_status, payment_date, amount, payment_method_id, reference_number, notes, void_reason, correction_of_payment: sale_payments!sale_payments_correction_of_payment_id_fkey ( id, payment_code ), corrected_by_payment: sale_payments!sale_payments_corrected_by_payment_id_fkey ( id, payment_code ), payment_methods ( id, name ) ),
  emi_accounts ( id, emi_code, total_financed_amount, expected_payment_amount, expected_payment_frequency, expected_payment_day, start_date, end_date, status, notes, emi_payments ( id, payment_code, payment_status, payment_date, amount, payment_method_id, reference_number, notes, void_reason, correction_of_payment: emi_payments!emi_payments_correction_of_payment_id_fkey ( id, payment_code ), corrected_by_payment: emi_payments!emi_payments_corrected_by_payment_id_fkey ( id, payment_code ), payment_methods ( id, name ) ) ),\n  sale_corrections ( id, correction_note, corrected_at, corrected_by )`

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const nil = (value) => typeof value === 'string' ? value.trim() || null : value ?? null
const numberOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value)

export function saleTotals(sale) {
  const total = (sale.sale_items ?? []).reduce((sum, item) => sum + Number(item.actual_unit_price || 0) * Number(item.quantity || 0), 0)
  const valid = (payment) => (payment.payment_status ?? 'Valid') === 'Valid'
  const salePayments = (sale.sale_payments ?? []).filter(valid).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const emiPayments = (sale.emi_accounts ?? []).flatMap((account) => account.emi_payments ?? []).filter(valid).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  return { total, collected: salePayments + emiPayments, outstanding: total - salePayments - emiPayments, salePayments, emiPayments }
}

export async function getSales({ page = 1, pageSize = 25, search = '', status = '', leadSourceId = '', fromDate = '', toDate = '' }) {
  let query = client().from('sales').select(saleFields, { count: 'exact' }).order('sale_date', { ascending: false }).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (status) query = query.eq('status', status)
  if (leadSourceId) query = query.eq('lead_source_id', leadSourceId)
  if (fromDate) query = query.gte('sale_date', fromDate)
  if (toDate) query = query.lte('sale_date', toDate)
  const term = search.trim().replace(/[%,_(),]/g, ' ')
  if (term) query = query.or(`sale_code.ilike.%${term}%,invoice_number.ilike.%${term}%`)
  const { data, error, count } = await query
  if (error) throw error
  return { sales: (data ?? []).map((sale) => ({ ...sale, totals: saleTotals(sale) })), count: count ?? 0 }
}

export async function getSale(saleId) {
  const { data, error } = await client().from('sales').select(saleFields).eq('id', saleId).single()
  if (error) throw error
  const itemIds = (data.sale_items ?? []).map((item) => item.id)
  let equipment = []
  if (itemIds.length) {
    const { data: rows, error: equipmentError } = await client().from('equipment').select('id, equipment_code, sale_item_id, location_id, locations ( id, location_name, area, city, pincode )').in('sale_item_id', itemIds).order('equipment_code')
    if (equipmentError) throw equipmentError
    equipment = rows ?? []
  }
  return { ...data, equipment, totals: saleTotals(data) }
}

export async function getSaleLookups() {
  const [{ data: products, error: productError }, { data: leads, error: leadError }, { data: methods, error: methodError }] = await Promise.all([
    client().from('product_models').select('id, product_code, model_name, default_selling_price, default_cost, equipment_type_id').eq('is_active', true).order('model_name'),
    client().from('lead_sources').select('id, name').eq('is_active', true).order('name'),
    client().from('payment_methods').select('id, name').eq('is_active', true).order('name'),
  ])
  if (productError || leadError || methodError) throw productError || leadError || methodError
  return { products: products ?? [], leadSources: leads ?? [], paymentMethods: methods ?? [] }
}

export async function searchSaleCustomers(search) {
  const term = search.trim(); if (term.length < 2) return []
  const { data, error } = await client().rpc('search_customers', { p_search_text: term, p_customer_type_id: null, p_is_active: true, p_city: null, p_area: null, p_offset: 0, p_limit: 10 })
  if (error) throw error
  return (data ?? []).map(({ id, customer_code, name, phone }) => ({ id, customer_code, name, phone }))
}

export async function getActiveCustomerLocations(customerId) {
  if (!customerId) return []
  const { data, error } = await client().from('locations').select('id, location_code, location_name, area, city, pincode').eq('customer_id', customerId).eq('is_active', true).order('created_at')
  if (error) throw error
  return data ?? []
}

export async function createAtomicSale(values) {
  const { data, error } = await client().rpc('create_sale_with_items', {
    p_submission_key: values.submissionKey,
    p_customer_id: values.customerId,
    p_sale_date: values.saleDate,
    p_status: values.status,
    p_items: values.items.map((item) => ({ product_model_id: item.product_model_id, quantity: Number(item.quantity), standard_unit_price: numberOrNull(item.standard_unit_price), actual_unit_price: Number(item.actual_unit_price), unit_cost: numberOrNull(item.unit_cost), discount: Number(item.discount || 0), warranty_months: Number(item.warranty_months), notes: nil(item.notes), unit_locations: item.unit_locations.map((id) => id || null) })),
    p_invoice_number: nil(values.invoiceNumber), p_invoice_date: values.invoiceDate || null, p_lead_source_id: values.leadSourceId || null, p_source_detail: nil(values.sourceDetail), p_notes: nil(values.notes),
  })
  if (error) throw error
  const saleId = data?.[0]?.sale_id
  if (!saleId) throw new Error('The sale was created but no sale reference was returned.')
  return { saleId, rows: data ?? [] }
}

export async function correctSale({ saleId, values }) {
  const { data, error } = await client().rpc('correct_sale', {
    p_sale_id: saleId,
    p_sale_date: values.sale_date,
    p_lead_source_id: values.lead_source_id || null,
    p_invoice_number: nil(values.invoice_number),
    p_invoice_date: values.invoice_date || null,
    p_source_detail: nil(values.source_detail),
    p_notes: nil(values.notes),
    p_items: values.items.map((item) => ({
      id: item.id,
      standard_unit_price: numberOrNull(item.standard_unit_price),
      actual_unit_price: Number(item.actual_unit_price),
      unit_cost: numberOrNull(item.unit_cost),
      warranty_months: numberOrNull(item.warranty_months),
    })),
    p_correction_note: nil(values.correction_note),
  })
  if (error) throw error
  return data?.[0] ?? null
}

export async function addSalePayment({ saleId, values }) {
  const { data, error } = await client().from('sale_payments').insert({ sale_id: saleId, payment_date: values.payment_date, amount: Number(values.amount), payment_method_id: values.payment_method_id, reference_number: nil(values.reference_number), notes: nil(values.notes) }).select().single()
  if (error) throw error
  return data
}

export async function createEmiAccount({ saleId, values }) {
  const { data, error } = await client().from('emi_accounts').insert({ sale_id: saleId, total_financed_amount: Number(values.total_financed_amount), expected_payment_amount: numberOrNull(values.expected_payment_amount), expected_payment_frequency: nil(values.expected_payment_frequency), expected_payment_day: numberOrNull(values.expected_payment_day), start_date: values.start_date || null, end_date: values.end_date || null, status: values.status || 'Active', notes: nil(values.notes) }).select().single()
  if (error) throw error
  return data
}

export async function addEmiPayment({ emiAccountId, values }) {
  const { data, error } = await client().from('emi_payments').insert({ emi_account_id: emiAccountId, payment_date: values.payment_date, amount: Number(values.amount), payment_method_id: values.payment_method_id, reference_number: nil(values.reference_number), notes: nil(values.notes) }).select().single()
  if (error) throw error
  return data
}

export async function getCustomerSales(customerId) {
  const { data, error } = await client().from('sales').select(saleFields).eq('customer_id', customerId).order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(10)
  if (error) throw error
  return (data ?? []).map((sale) => ({ ...sale, totals: saleTotals(sale) }))
}
