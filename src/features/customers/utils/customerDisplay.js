export function displayLocation(location) {
  const value = [location?.area, location?.city].filter(Boolean).join(', ')
  return value || 'Not recorded'
}

export function customerStatus(customer) {
  return customer.is_active ? 'Active' : 'Inactive'
}
