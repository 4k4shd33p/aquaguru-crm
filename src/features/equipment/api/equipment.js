import { supabase } from '../../../lib/supabase'

const equipmentFields = `
  id, equipment_code, customer_id, location_id, equipment_type_id, product_model_id, sale_item_id,
  source, serial_number, status, notes, created_at, updated_at,
  customers ( id, customer_code, name, phone ),
  locations ( id, location_name, area, city, pincode ),
  equipment_types ( id, code, name ),
  product_models ( id, product_code, model_name ),
  sale_items ( id, sale_id, sales ( id, sale_code ) )
`

const componentFields = `
  id, equipment_id, part_id, component_role_id, installed_date, removed_date, source_service_item_id, notes, created_at,
  parts ( id, part_code, name, brand, model, equipment_tracking_enabled ),
  component_roles ( id, name ),
  source_service_item:service_items!equipment_components_source_service_item_fk ( id, services ( id, service_code ) )
`

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

const nullable = (value) => (typeof value === 'string' ? value.trim() : value) || null

function payload(values) {
  return {
    customer_id: values.customer_id,
    location_id: nullable(values.location_id),
    equipment_type_id: nullable(values.equipment_type_id),
    product_model_id: nullable(values.product_model_id),
    source: values.source,
    serial_number: nullable(values.serial_number),
    status: values.status,
    notes: nullable(values.notes),
  }
}

export async function getEquipmentList({ page = 1, pageSize = 25, search = '', equipmentTypeId = '', source = '', status = '' }) {
  const from = (page - 1) * pageSize
  let query = requireClient().from('equipment').select(equipmentFields, { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + pageSize - 1)
  if (equipmentTypeId) query = query.eq('equipment_type_id', equipmentTypeId)
  if (source) query = query.eq('source', source)
  if (status) query = query.eq('status', status)
  const term = search.trim()
  if (term) {
    const safeTerm = term.replace(/[%,_(),]/g, ' ')
    query = query.or(`equipment_code.ilike.%${safeTerm}%,serial_number.ilike.%${safeTerm}%`)
  }
  const { data, error, count } = await query
  if (error) throw error
  return { equipment: data ?? [], count: count ?? 0 }
}

export async function getEquipmentById(equipmentId) {
  const { data, error } = await requireClient().from('equipment').select(equipmentFields).eq('id', equipmentId).single()
  if (error) throw error
  return data
}

export async function getEquipmentTypes() {
  const { data, error } = await requireClient().from('equipment_types').select('id, code, name, description').eq('is_active', true).order('name')
  if (error) throw error
  return data ?? []
}

export async function getProductModels(equipmentTypeId = '') {
  let query = requireClient().from('product_models').select('id, product_code, model_name, equipment_type_id').eq('is_active', true).order('model_name')
  if (equipmentTypeId) query = query.eq('equipment_type_id', equipmentTypeId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function searchEquipmentCustomers(search) {
  const term = search.trim()
  if (!term) return []
  const { data, error } = await requireClient().rpc('search_customers', {
    p_search_text: term,
    p_customer_type_id: null,
    p_is_active: null,
    p_city: null,
    p_area: null,
    p_offset: 0,
    p_limit: 10,
  })
  if (error) throw error
  return (data ?? []).map(({ id, customer_code, name, phone, is_active }) => ({ id, customer_code, name, phone, is_active }))
}

export async function getEquipmentCustomerLocations(customerId) {
  if (!customerId) return []
  const { data, error } = await requireClient().from('locations').select('id, location_code, location_name, area, city, pincode').eq('customer_id', customerId).eq('is_active', true).order('created_at')
  if (error) throw error
  return data ?? []
}

export async function getCustomerEquipment(customerId) {
  const { data, error } = await requireClient().from('equipment').select(equipmentFields).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data ?? []
}

export async function getEquipmentComponents(equipmentId) {
  const { data, error } = await requireClient().from('equipment_components').select(componentFields).eq('equipment_id', equipmentId).order('removed_date', { ascending: true, nullsFirst: true }).order('installed_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).filter((component) => component.parts?.equipment_tracking_enabled)
}

export async function getTrackedComponentParts() {
  const { data, error } = await requireClient().from('parts').select('id, part_code, name, brand, model, component_role_id, component_roles ( id, name )').eq('is_active', true).eq('equipment_tracking_enabled', true).not('component_role_id', 'is', null).order('name')
  if (error) throw error
  return data ?? []
}

export async function recordExistingComponent({ equipmentId, values }) {
  const { data, error } = await requireClient().from('equipment_components').insert({
    equipment_id: equipmentId,
    component_role_id: values.component_role_id,
    part_id: values.part_id,
    installed_date: nullable(values.installed_date),
    notes: nullable(values.notes),
  }).select(componentFields).single()
  if (error) throw error
  return data
}

export async function createEquipment(values) {
  const { data, error } = await requireClient().from('equipment').insert(payload(values)).select(equipmentFields).single()
  if (error) throw error
  return data
}

export async function updateEquipment({ equipmentId, values }) {
  const { data, error } = await requireClient().from('equipment').update(payload(values)).eq('id', equipmentId).select(equipmentFields).single()
  if (error) throw error
  return data
}

export async function decommissionEquipment(equipmentId) {
  const { data, error } = await requireClient().from('equipment').update({ status: 'Decommissioned' }).eq('id', equipmentId).select(equipmentFields).single()
  if (error) throw error
  return data
}
