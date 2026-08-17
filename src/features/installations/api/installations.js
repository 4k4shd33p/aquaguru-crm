import { supabase } from '../../../lib/supabase'

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const nil = (value) => typeof value === 'string' ? value.trim() || null : value ?? null
const numericOrNull = (value) => value === '' || value === undefined || value === null ? null : Number(value)
const range = (page, pageSize) => [(page - 1) * pageSize, page * pageSize - 1]
const cleanTerm = (value) => value.trim().replace(/[%,_(),]/g, ' ')

export const equipmentContextFields = `
  id, equipment_code, serial_number, source, status, customer_id, location_id, sale_item_id,
  customers ( id, customer_code, name, phone ),
  locations ( id, location_name, area, city, pincode ),
  equipment_types ( id, name ), product_models ( id, product_code, model_name ),
  sale_items ( id, warranty_months, sales ( id, sale_code, sale_date ) )
`

const installationFields = `
  id, installation_code, equipment_id, sale_item_id, scheduled_date, installation_date,
  technician_id, status, tds_in, tds_out, installation_charge, technician_charge, notes,
  installation_classification, created_at, updated_at,
  equipment ( ${equipmentContextFields} ), technicians ( id, name, phone )
`

export async function getInstallations({ page = 1, pageSize = 25, search = '', status = '', classification = '', technicianId = '', fromDate = '', toDate = '' }) {
  const [from, to] = range(page, pageSize)
  let query = client().from('installations').select(installationFields, { count: 'exact' }).order('scheduled_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).range(from, to)
  if (status) query = query.eq('status', status)
  if (classification) query = query.eq('installation_classification', classification)
  if (technicianId) query = query.eq('technician_id', technicianId)
  if (fromDate) query = query.gte('scheduled_date', fromDate)
  if (toDate) query = query.lte('scheduled_date', toDate)
  const term = cleanTerm(search); if (term) query = query.ilike('installation_code', `%${term}%`)
  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], count: count ?? 0 }
}

export async function getInstallation(installationId) {
  const { data, error } = await client().from('installations').select(installationFields).eq('id', installationId).single()
  if (error) throw error
  const { data: warranty, error: warrantyError } = await client().from('equipment_warranties').select('id, warranty_code, start_date, end_date, duration_months, planned_visits, status').eq('installation_id', installationId).eq('is_automatic_sale_origin', true).maybeSingle()
  if (warrantyError) throw warrantyError
  return { ...data, automaticWarranty: warranty ?? null }
}

export async function getEquipmentInstallationHistory(equipmentId) {
  const { data, error } = await client().from('installations').select('id, installation_code, installation_classification, scheduled_date, installation_date, status, technician_id, technicians ( id, name )').eq('equipment_id', equipmentId).order('installation_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return data ?? []
}

export async function searchInstallationEquipment(search) {
  const term = cleanTerm(search); if (term.length < 2) return []
  const { data, error } = await client().from('equipment').select(equipmentContextFields).or(`equipment_code.ilike.%${term}%,serial_number.ilike.%${term}%`).order('equipment_code').limit(10)
  if (error) throw error
  return data ?? []
}

export async function getTechnicians() {
  const { data, error } = await client().from('technicians').select('id, technician_code, name, phone').eq('is_active', true).order('name')
  if (error) throw error
  return data ?? []
}

export async function createInstallation(values) {
  const { data, error } = await client().rpc('create_installation', {
    p_submission_key: values.submissionKey,
    p_equipment_id: values.equipmentId,
    p_installation_classification: values.classification,
    p_scheduled_date: nil(values.scheduledDate),
    p_sale_item_id: values.saleItemId ?? null,
    p_technician_id: nil(values.technicianId),
    p_notes: nil(values.notes),
  })
  if (error) throw error
  const result = data?.[0]; if (!result?.installation_id) throw new Error('The installation was saved but no Installation reference was returned.')
  return result
}

export async function completeInstallation({ installationId, values }) {
  const { data, error } = await client().rpc('complete_installation', {
    p_submission_key: values.submissionKey, p_installation_id: installationId, p_installation_date: values.installationDate,
    p_technician_id: nil(values.technicianId), p_tds_in: numericOrNull(values.tdsIn), p_tds_out: numericOrNull(values.tdsOut),
    p_installation_charge: numericOrNull(values.installationCharge), p_technician_charge: numericOrNull(values.technicianCharge), p_notes: nil(values.notes),
  })
  if (error) throw error
  const result = data?.[0]; if (!result?.installation_id) throw new Error('The installation was completed but no confirmation was returned.')
  return result
}

export async function rescheduleInstallation({ installationId, values }) {
  const { data, error } = await client().from('installations').update({ scheduled_date: nil(values.scheduledDate), technician_id: nil(values.technicianId), notes: nil(values.notes), status: values.status }).eq('id', installationId).in('status', ['Scheduled', 'Rescheduled']).select(installationFields).single()
  if (error) throw error
  return data
}

