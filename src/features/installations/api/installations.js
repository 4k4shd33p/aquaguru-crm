import { supabase } from '../../../lib/supabase'

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const nil = (value) => typeof value === 'string' ? value.trim() || null : value ?? null
const numericOrNull = (value) => value === '' || value === undefined || value === null ? null : Number(value)
const workItemsPayload = (items = []) => items.map((item) => ({ id: item.id ?? null, description: nil(item.description), quantity: numericOrNull(item.quantity), commercial_treatment: item.commercialTreatment, customer_charge: numericOrNull(item.customerCharge), direct_cost: numericOrNull(item.directCost), notes: nil(item.notes) }))
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
  technician_id, status, tds_in, tds_out, installation_charge, technician_charge, travel_cost, other_direct_cost, other_direct_cost_note, notes,
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
  const { data: corrections, error: correctionError } = await client().from('installation_corrections').select('id, correction_reason, corrected_at, corrected_by').eq('installation_id', installationId).order('corrected_at', { ascending: false })
  if (correctionError) throw correctionError
  const { data: additionalWork, error: additionalWorkError } = await client().from('installation_work_items').select('id, description, quantity, commercial_treatment, customer_charge, direct_cost, notes, created_at, updated_at').eq('installation_id', installationId).order('created_at')
  if (additionalWorkError) throw additionalWorkError
  return { ...data, automaticWarranty: warranty ?? null, corrections: corrections ?? [], additionalWork: additionalWork ?? [] }
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
    p_installation_charge: numericOrNull(values.installationCharge), p_technician_charge: numericOrNull(values.technicianCharge),
    p_travel_cost: numericOrNull(values.travelCost), p_other_direct_cost: numericOrNull(values.otherDirectCost),
    p_other_direct_cost_note: nil(values.otherDirectCostNote), p_notes: nil(values.notes), p_work_items: workItemsPayload(values.workItems),
  })
  if (error) throw error
  const result = data?.[0]; if (!result?.installation_id) throw new Error('The installation was completed but no confirmation was returned.')
  return result
}

export async function correctInstallation({ installationId, values }) {
  const { data, error } = await client().rpc('correct_installation', {
    p_installation_id: installationId,
    p_installation_date: values.installationDate,
    p_technician_id: nil(values.technicianId),
    p_tds_in: numericOrNull(values.tdsIn),
    p_tds_out: numericOrNull(values.tdsOut),
    p_installation_charge: numericOrNull(values.installationCharge),
    p_technician_charge: numericOrNull(values.technicianCharge),
    p_travel_cost: numericOrNull(values.travelCost),
    p_other_direct_cost: numericOrNull(values.otherDirectCost),
    p_other_direct_cost_note: nil(values.otherDirectCostNote),
    p_notes: nil(values.notes),
    p_work_items: workItemsPayload(values.workItems),
    p_correction_reason: nil(values.correctionReason),
  })
  if (error) throw error
  const result = data?.[0]
  if (!result?.installation_id) throw new Error('The Installation correction did not return a confirmation.')
  return result
}

export async function rescheduleInstallation({ installationId, values }) {
  const { data, error } = await client().from('installations').update({ scheduled_date: nil(values.scheduledDate), technician_id: nil(values.technicianId), notes: nil(values.notes), status: values.status }).eq('id', installationId).in('status', ['Scheduled', 'Rescheduled']).select(installationFields).single()
  if (error) throw error
  return data
}


