import { supabase } from '../../../lib/supabase'

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const clean = (value) => typeof value === 'string' ? value.trim() || null : value ?? null
const numberOrNull = (value) => value === '' || value === null || value === undefined ? null : Number(value)

export const masterConfigs = {
  productModels: { table: 'product_models', label: 'Product Models', search: ['model_name', 'product_code'], order: 'model_name', fields: 'id, product_code, model_name, equipment_type_id, description, default_selling_price, default_cost, is_active, notes, equipment_types ( id, name )' },
  parts: { table: 'parts', label: 'Parts', search: ['name', 'part_code', 'category', 'brand', 'model'], order: 'name', fields: 'id, part_code, name, category, brand, model, component_role_id, standard_cost, standard_selling_price, equipment_tracking_enabled, part_warranty_eligible, default_warranty_months, is_active, notes, component_roles ( id, name )' },
  technicians: { table: 'technicians', label: 'Technicians', search: ['name', 'technician_code', 'phone', 'technician_type'], order: 'name', fields: 'id, technician_code, name, phone, technician_type, is_active, notes' },
  serviceTypes: { table: 'service_types', label: 'Service Types', search: ['name'], order: 'name', fields: 'id, name, is_active' },
  equipmentTypes: { table: 'equipment_types', label: 'Equipment Types', search: ['name', 'code', 'description'], order: 'name', fields: 'id, code, name, description, is_active' },
  customerTypes: { table: 'customer_types', label: 'Customer Types', search: ['name', 'code'], order: 'name', fields: 'id, code, name, is_active' },
  leadSources: { table: 'lead_sources', label: 'Lead Sources', search: ['name'], order: 'name', fields: 'id, name, is_active' },
  paymentMethods: { table: 'payment_methods', label: 'Payment Methods', search: ['name'], order: 'name', fields: 'id, name, is_active' },
  componentRoles: { table: 'component_roles', label: 'Component Roles', search: ['name'], order: 'name', fields: 'id, name, is_active' },
}

export async function getMasterRows(key, search = '') {
  const config = masterConfigs[key]
  let query = client().from(config.table).select(config.fields).order(config.order)
  const term = search.trim().replace(/[%,_(),]/g, ' ')
  if (term) query = query.or(config.search.map((field) => `${field}.ilike.%${term}%`).join(','))
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getSettingsLookups() {
  const [equipmentTypes, componentRoles] = await Promise.all([
    client().from('equipment_types').select('id, name').eq('is_active', true).order('name'),
    client().from('component_roles').select('id, name').eq('is_active', true).order('name'),
  ])
  if (equipmentTypes.error || componentRoles.error) throw equipmentTypes.error || componentRoles.error
  return { equipmentTypes: equipmentTypes.data ?? [], componentRoles: componentRoles.data ?? [] }
}

function payload(key, values) {
  const base = { is_active: values.is_active !== false }
  if (key === 'productModels') return { ...base, model_name: values.model_name.trim(), equipment_type_id: values.equipment_type_id, description: clean(values.description), default_selling_price: numberOrNull(values.default_selling_price), default_cost: numberOrNull(values.default_cost), notes: clean(values.notes) }
  if (key === 'parts') return { ...base, name: values.name.trim(), category: clean(values.category), brand: clean(values.brand), model: clean(values.model), component_role_id: clean(values.component_role_id), standard_cost: numberOrNull(values.standard_cost), standard_selling_price: numberOrNull(values.standard_selling_price), equipment_tracking_enabled: !!values.equipment_tracking_enabled, part_warranty_eligible: !!values.part_warranty_eligible, default_warranty_months: values.part_warranty_eligible ? numberOrNull(values.default_warranty_months) : null, notes: clean(values.notes) }
  if (key === 'technicians') return { ...base, name: values.name.trim(), phone: clean(values.phone), technician_type: clean(values.technician_type), notes: clean(values.notes) }
  if (key === 'equipmentTypes') return { ...base, name: values.name.trim(), description: clean(values.description) }
  return { ...base, name: values.name.trim() }
}

export async function saveMaster({ key, id, values }) {
  const config = masterConfigs[key]
  const query = id ? client().from(config.table).update(payload(key, values)).eq('id', id) : client().from(config.table).insert(payload(key, values))
  const { data, error } = await query.select(config.fields).single()
  if (error) throw error
  return data
}

export async function setMasterActive({ key, id, isActive }) {
  const config = masterConfigs[key]
  const { data, error } = await client().from(config.table).update({ is_active: isActive }).eq('id', id).select(config.fields).single()
  if (error) throw error
  return data
}

export function masterErrorMessage(error) {
  if (error?.code === '23505') return 'A record with that name or identifier already exists.'
  if (error?.code === '23503') return 'This record is used by CRM history and cannot be removed.'
  if (error?.code === '23514') return 'One or more values do not meet the required business rules.'
  if (error?.code === '42501') return 'You do not have permission to change master data.'
  return 'Could not save this master record. Please review the fields and try again.'
}

