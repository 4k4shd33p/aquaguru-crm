import { supabase } from '../../../lib/supabase'

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const nil = (value) => typeof value === 'string' ? value.trim() || null : value ?? null
const numberOrNull = (value) => value === '' || value === undefined || value === null ? null : Number(value)

const equipmentFields = `id, equipment_code, serial_number, status, source, customer_id, location_id,
  customers ( id, customer_code, name ), locations ( id, location_name, area, city, pincode ),
  product_models ( id, product_code, model_name ), equipment_types ( id, name )`
const warrantyFields = `id, warranty_code, equipment_id, sale_id, installation_id, start_date, end_date, duration_months, planned_visits, status, effective_status, notes, created_at,
  equipment ( ${equipmentFields} ), sales ( id, sale_code ), installations ( id, installation_code, installation_date ),
  services ( id, service_code, service_date, status, technician_charge, service_types ( name ) )`
const amcFields = `id, amc_code, equipment_id, cycle_number, start_date, end_date, standard_price, agreed_price, planned_visits, status, notes, created_at,
  equipment ( ${equipmentFields} ),
  amc_payments ( id, payment_code, payment_date, amount, reference_number, notes, payment_methods ( id, name ) ),
  services ( id, service_code, service_date, status, technician_charge, service_types ( name ) )`
const partWarrantyFields = `id, part_warranty_code, service_item_id, equipment_id, part_id, start_date, end_date, duration_months, status, replaced_warranty_id, notes, created_at,
  equipment ( ${equipmentFields} ), parts ( id, part_code, name ),
  service_items!service_item_warranties_service_item_id_fkey ( id, service_id, services ( id, service_code, service_date, status ) )`

function safeTerm(value) { return value.trim().replace(/[%,_(),]/g, ' ') }
function pageRange(page, pageSize) { return [(page - 1) * pageSize, page * pageSize - 1] }

export function amcTotals(amc) {
  const collected = (amc.amc_payments ?? []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const agreed = amc.agreed_price === null || amc.agreed_price === undefined ? null : Number(amc.agreed_price)
  return { collected, outstanding: agreed === null ? null : agreed - collected, agreed }
}

export async function getEquipmentWarranties({ page = 1, pageSize = 25, search = '', status = '', fromDate = '', toDate = '' }) {
  const [from, to] = pageRange(page, pageSize)
  let query = client().from('equipment_warranties').select(warrantyFields, { count: 'exact' }).order('start_date', { ascending: false }).range(from, to)
  if (status) query = query.eq('effective_status', status)
  if (fromDate) query = query.gte('start_date', fromDate)
  if (toDate) query = query.lte('end_date', toDate)
  const term = safeTerm(search); if (term) query = query.ilike('warranty_code', `%${term}%`)
  const { data, error, count } = await query; if (error) throw error
  return { rows: data ?? [], count: count ?? 0 }
}

export async function getEquipmentWarranty(id) { const { data, error } = await client().from('equipment_warranties').select(warrantyFields).eq('id', id).single(); if (error) throw error; return data }

export async function getAmcCycles({ page = 1, pageSize = 25, search = '', status = '', fromDate = '', toDate = '' }) {
  const [from, to] = pageRange(page, pageSize)
  let query = client().from('amc_cycles_effective').select(amcFields, { count: 'exact' }).order('start_date', { ascending: false }).range(from, to)
  if (status) query = query.eq('status', status)
  if (fromDate) query = query.gte('start_date', fromDate)
  if (toDate) query = query.lte('end_date', toDate)
  const term = safeTerm(search); if (term) query = query.ilike('amc_code', `%${term}%`)
  const { data, error, count } = await query; if (error) throw error
  return { rows: (data ?? []).map((row) => ({ ...row, totals: amcTotals(row) })), count: count ?? 0 }
}

export async function getAmcCycle(id) { const { data, error } = await client().from('amc_cycles_effective').select(amcFields).eq('id', id).single(); if (error) throw error; return { ...data, totals: amcTotals(data) } }

export async function searchAmcEquipment(search) {
  const term = safeTerm(search); if (term.length < 2) return []
  const { data, error } = await client().from('equipment').select(equipmentFields).or(`equipment_code.ilike.%${term}%,serial_number.ilike.%${term}%`).order('equipment_code').limit(10)
  if (error) throw error; return data ?? []
}

export async function createAmcCycle(values) {
  const { data, error } = await client().rpc('create_amc_cycle', {
    p_submission_key: values.submissionKey, p_equipment_id: values.equipmentId, p_start_date: values.startDate, p_end_date: values.endDate,
    p_standard_price: numberOrNull(values.standardPrice), p_agreed_price: numberOrNull(values.agreedPrice),
    p_planned_visits: numberOrNull(values.plannedVisits), p_status: null, p_notes: nil(values.notes),
  })
  if (error) throw error
  const result = data?.[0]; if (!result?.amc_cycle_id) throw new Error('The AMC was saved but no AMC reference was returned.')
  return result
}

export async function getPaymentMethods() { const { data, error } = await client().from('payment_methods').select('id, name').eq('is_active', true).order('name'); if (error) throw error; return data ?? [] }
export async function addAmcPayment({ amcCycleId, values }) {
  const { data, error } = await client().from('amc_payments').insert({ amc_cycle_id: amcCycleId, payment_date: values.paymentDate, amount: Number(values.amount), payment_method_id: values.paymentMethodId, reference_number: nil(values.referenceNumber), notes: nil(values.notes) }).select().single()
  if (error) throw error; return data
}

export async function getPartWarranties({ page = 1, pageSize = 25, search = '', status = '', partId = '' }) {
  const [from, to] = pageRange(page, pageSize)
  let query = client().from('service_item_warranties').select(partWarrantyFields, { count: 'exact' }).order('start_date', { ascending: false }).range(from, to)
  if (status) query = query.eq('status', status); if (partId) query = query.eq('part_id', partId)
  const term = safeTerm(search); if (term) query = query.ilike('part_warranty_code', `%${term}%`)
  const { data, error, count } = await query; if (error) throw error; return { rows: data ?? [], count: count ?? 0 }
}

export async function getPartWarranty(id) {
  const { data, error } = await client().from('service_item_warranties').select(partWarrantyFields).eq('id', id).single(); if (error) throw error
  const chain = [data]; let cursor = data; let steps = 0
  while (cursor.replaced_warranty_id && steps++ < 12) { const { data: prior, error: priorError } = await client().from('service_item_warranties').select(partWarrantyFields).eq('id', cursor.replaced_warranty_id).single(); if (priorError) throw priorError; chain.unshift(prior); cursor = prior }
  cursor = data; steps = 0
  while (steps++ < 12) { const { data: replacements, error: nextError } = await client().from('service_item_warranties').select(partWarrantyFields).eq('replaced_warranty_id', cursor.id).order('created_at').limit(1); if (nextError) throw nextError; if (!replacements?.[0]) break; cursor = replacements[0]; chain.push(cursor) }
  return { warranty: data, chain }
}

export async function getEquipmentCoverage(equipmentId) {
  const [warranty, amc, parts] = await Promise.all([
    client().from('equipment_warranties').select('id, warranty_code, start_date, end_date, status').eq('equipment_id', equipmentId).eq('status', 'Active').order('end_date').limit(1),
    client().from('amc_cycles_effective').select('id, amc_code, start_date, end_date, status, effective_status').eq('equipment_id', equipmentId).eq('effective_status', 'Active').order('end_date').limit(1),
    client().from('service_item_warranties').select('id, part_warranty_code, start_date, end_date, status, parts ( name )').eq('equipment_id', equipmentId).eq('status', 'Active').order('end_date').limit(4),
  ])
  if (warranty.error || amc.error || parts.error) throw warranty.error || amc.error || parts.error
  return { warranty: warranty.data?.[0] ?? null, amc: amc.data?.[0] ?? null, partWarranties: parts.data ?? [] }
}

