import { supabase } from '../../../lib/supabase'
import { calculateServiceFinancials } from '../utils/serviceFinancials'

const fields = `id, service_code, equipment_id, service_date, relocation_destination_location_id, relocation_destination_location:locations!services_relocation_destination_location_id_fkey ( id, location_name, area, city, pincode ), relocation_history:equipment_location_history!equipment_location_history_source_service_id_fkey ( id, movement_date, old_location:locations!equipment_location_history_old_location_id_fkey ( id, location_name, area, city, pincode ), new_location:locations!equipment_location_history_new_location_id_fkey ( id, location_name, area, city, pincode ) ), technician_id, service_type_id, issue_reported, diagnosis, work_performed, tds_in, tds_out, next_service_due, technician_charge, equipment_warranty_id, amc_cycle_id, status, notes, created_at, financial_model_version, final_customer_charge, travel_cost, other_direct_cost, other_direct_cost_note, customer_charge_note, equipment ( id, equipment_code, serial_number, customer_id, location_id, customers ( id, customer_code, name, phone ), locations ( id, location_name, area, city, pincode ), equipment_types ( id, name ), product_models ( id, model_name ) ), technicians ( id, technician_code, name ), service_types ( id, name, is_relocation_service ), equipment_warranties ( id, warranty_code, start_date, end_date, status ), amc_cycles ( id, amc_code, cycle_number, start_date, end_date, status ), service_items ( id, part_id, item_type, description, quantity, standard_price, actual_customer_price, internal_cost, coverage_type, equipment_warranty_id, amc_cycle_id, service_item_warranty_id, updates_equipment_component, notes, parts ( id, part_code, name, component_role_id, equipment_tracking_enabled, part_warranty_eligible, default_warranty_months, component_roles ( id, name ) ), equipment_warranties ( id, warranty_code, start_date, end_date ), amc_cycles ( id, amc_code, cycle_number, start_date, end_date ), service_item_warranties!service_item_warranties_service_item_id_fkey ( id, part_warranty_code, start_date, end_date, status, replaced_warranty_id ) ), service_payments ( id, payment_code, payment_date, amount, reference_number, notes, payment_methods ( id, name ) )`

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }

export function serviceTotals(service) {
  const financials = calculateServiceFinancials(service)
  return { total: financials.authoritativeValue, collected: financials.amountReceived, outstanding: financials.amountDue, chargeKnown: financials.chargeKnown }
}

export async function getServices({ page = 1, pageSize = 25, search = '', status = '', serviceTypeId = '', technicianId = '', fromDate = '', toDate = '' }) {
  let query = client().from('services').select(fields, { count: 'exact' }).order('service_date', { ascending: false }).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (status) query = query.eq('status', status)
  if (serviceTypeId) query = query.eq('service_type_id', serviceTypeId)
  if (technicianId) query = query.eq('technician_id', technicianId)
  if (fromDate) query = query.gte('service_date', fromDate)
  if (toDate) query = query.lte('service_date', toDate)
  const term = search.trim().replace(/[%,_(),]/g, ' ')
  if (term) query = query.ilike('service_code', `%${term}%`)
  const { data, error, count } = await query
  if (error) throw error
  return { services: (data ?? []).map((service) => ({ ...service, totals: serviceTotals(service) })), count: count ?? 0 }
}

export async function getService(serviceId) {
  const { data, error } = await client().from('services').select(fields).eq('id', serviceId).single()
  if (error) throw error
  const ids = (data.service_items ?? []).map((item) => item.id)
  const [components, warranties] = ids.length ? await Promise.all([
    client().from('equipment_components').select('id, part_id, component_role_id, installed_date, removed_date, source_service_item_id, parts ( id, name ), component_roles ( id, name )').in('source_service_item_id', ids),
    client().from('service_item_warranties').select('id, part_warranty_code, service_item_id, part_id, start_date, end_date, duration_months, status, replaced_warranty_id, parts ( id, name )').in('service_item_id', ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }]
  if (components.error || warranties.error) throw components.error || warranties.error
  return { ...data, totals: serviceTotals(data), financials: calculateServiceFinancials(data), components: components.data ?? [], newPartWarranties: warranties.data ?? [] }
}

export async function getServiceLookups() {
  const [parts, serviceTypes, technicians, paymentMethods] = await Promise.all([
    client().from('parts').select('id, part_code, name, component_role_id, standard_cost, standard_selling_price, equipment_tracking_enabled, part_warranty_eligible, default_warranty_months, component_roles ( id, name )').eq('is_active', true).order('name'),
    client().from('service_types').select('id, name, is_relocation_service').eq('is_active', true).order('name'),
    client().from('technicians').select('id, technician_code, name').eq('is_active', true).order('name'),
    client().from('payment_methods').select('id, name').eq('is_active', true).order('name'),
  ])
  if (parts.error || serviceTypes.error || technicians.error || paymentMethods.error) throw parts.error || serviceTypes.error || technicians.error || paymentMethods.error
  return { parts: parts.data ?? [], serviceTypes: serviceTypes.data ?? [], technicians: technicians.data ?? [], paymentMethods: paymentMethods.data ?? [] }
}
