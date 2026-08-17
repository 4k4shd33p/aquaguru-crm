import { supabase } from '../../../lib/supabase'

const locationFields = 'id, location_code, customer_id, location_name, address, area, city, pincode, notes, is_active, created_at, updated_at'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

const nullable = (value) => (typeof value === 'string' ? value.trim() : value) || null

function locationPayload(values) {
  return {
    location_name: nullable(values.location_name), address: nullable(values.address), area: nullable(values.area), city: nullable(values.city),
    pincode: nullable(values.pincode), notes: nullable(values.notes), is_active: values.is_active,
  }
}

export async function getCustomerLocations(customerId) {
  const { data, error } = await requireClient().from('locations').select(locationFields).eq('customer_id', customerId).order('created_at')
  if (error) throw error
  return data
}

export async function createLocation({ customerId, values }) {
  const { data, error } = await requireClient().from('locations').insert({ customer_id: customerId, ...locationPayload(values) }).select(locationFields).single()
  if (error) throw error
  return data
}

export async function updateLocation({ locationId, values }) {
  const { data, error } = await requireClient().from('locations').update(locationPayload(values)).eq('id', locationId).select(locationFields).single()
  if (error) throw error
  return data
}
