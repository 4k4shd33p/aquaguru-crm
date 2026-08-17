import { supabase } from '../../../lib/supabase'

const customerFields = `
  id, customer_code, name, customer_type_id, phone, alternate_phone, email, notes,
  is_active, created_at, updated_at,
  customer_types ( id, name )
`

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function nullable(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value
  return trimmed || null
}

export async function getCustomers({ page = 1, pageSize = 25, search = '', customerTypeId = '', status = '', city = '', area = '' }) {
  const client = requireClient()
  const from = (page - 1) * pageSize
  const { data, error } = await client.rpc('search_customers', {
    p_search_text: nullable(search),
    p_customer_type_id: customerTypeId || null,
    p_is_active: status === 'active' ? true : status === 'inactive' ? false : null,
    p_city: nullable(city),
    p_area: nullable(area),
    p_offset: from,
    p_limit: pageSize,
  })
  if (error) throw error

  return {
    customers: (data ?? []).map((customer) => ({
      ...customer,
      customer_types: customer.customer_type_name ? { id: customer.customer_type_id, name: customer.customer_type_name } : null,
      representativeLocation: customer.representative_area || customer.representative_city || customer.representative_pincode
        ? { area: customer.representative_area, city: customer.representative_city, pincode: customer.representative_pincode }
        : null,
    })),
    count: data?.[0]?.total_count ?? 0,
  }
}

function sortedDistinct(values) {
  const unique = new Map()
  values.forEach((value) => {
    const trimmed = value?.trim()
    if (trimmed && !unique.has(trimmed.toLocaleLowerCase())) unique.set(trimmed.toLocaleLowerCase(), trimmed)
  })
  return [...unique.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

export async function getCustomerLocationFilterOptions(city = '') {
  const { data, error } = await requireClient().from('locations').select('city, area').eq('is_active', true)
  if (error) throw error

  const selectedCity = city.trim().toLocaleLowerCase()
  const locations = data ?? []
  return {
    cities: sortedDistinct(locations.map((location) => location.city)),
    areas: sortedDistinct(locations.filter((location) => !selectedCity || location.city?.trim().toLocaleLowerCase() === selectedCity).map((location) => location.area)),
  }
}

export async function getCustomerById(customerId) {
  const { data, error } = await requireClient().from('customers').select(customerFields).eq('id', customerId).single()
  if (error) throw error
  return data
}

export async function getCustomerTypes() {
  const { data, error } = await requireClient().from('customer_types').select('id, name, code').eq('is_active', true).order('name')
  if (error) throw error
  return data
}

export async function findCustomersByPhone(phone, excludeCustomerId) {
  const normalized = phone.trim().replace(/[(),]/g, '')
  if (!normalized) return []
  let query = requireClient().from('customers').select('id, customer_code, name, phone').or(`phone.eq.${normalized},alternate_phone.eq.${normalized}`).limit(5)
  if (excludeCustomerId) query = query.neq('id', excludeCustomerId)
  const { data, error } = await query
  if (error) throw error
  return data
}

function customerPayload(values) {
  return {
    name: values.name.trim(),
    customer_type_id: nullable(values.customer_type_id),
    phone: nullable(values.phone),
    alternate_phone: nullable(values.alternate_phone),
    email: nullable(values.email),
    notes: nullable(values.notes),
    is_active: values.is_active,
  }
}

export async function createCustomer(values) {
  const { data, error } = await requireClient().from('customers').insert(customerPayload(values)).select(customerFields).single()
  if (error) throw error
  return data
}

export async function updateCustomer({ customerId, values }) {
  const { data, error } = await requireClient().from('customers').update(customerPayload(values)).eq('id', customerId).select(customerFields).single()
  if (error) throw error
  return data
}

