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

export async function getCustomers({ page = 1, pageSize = 25, search = '', customerTypeId = '', status = '' }) {
  const client = requireClient()
  let query = client.from('customers').select(customerFields, { count: 'exact' })

  const term = search.trim().replace(/[,.()]/g, ' ')
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,customer_code.ilike.%${term}%`)
  if (customerTypeId) query = query.eq('customer_type_id', customerTypeId)
  if (status === 'active') query = query.eq('is_active', true)
  if (status === 'inactive') query = query.eq('is_active', false)

  const from = (page - 1) * pageSize
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)
  if (error) throw error

  const customerIds = data.map((customer) => customer.id)
  const { data: locations, error: locationError } = customerIds.length
    ? await client.from('locations').select('customer_id, area, city, is_active, created_at').in('customer_id', customerIds).eq('is_active', true).order('created_at')
    : { data: [], error: null }
  if (locationError) throw locationError

  const representativeLocation = new Map()
  locations.forEach((location) => {
    if (!representativeLocation.has(location.customer_id)) representativeLocation.set(location.customer_id, location)
  })

  return {
    customers: data.map((customer) => ({ ...customer, representativeLocation: representativeLocation.get(customer.id) ?? null })),
    count: count ?? 0,
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
