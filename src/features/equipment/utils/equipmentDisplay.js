export const equipmentSources = ['Aquaguru Sale', 'Purchased Elsewhere', 'Customer-Owned / Existing', 'Other', 'Unknown']
export const equipmentStatuses = ['Active', 'Inactive', 'Decommissioned', 'Unknown']

export const recorded = (value) => value || 'Not recorded'
export const equipmentStatusTone = (status) => status === 'Active' ? 'success' : status === 'Decommissioned' ? 'neutral' : 'blue'
export const locationLabel = (location) => [location?.location_name, location?.area, location?.city].filter(Boolean).join(' · ') || 'Not recorded'
export const componentLabel = (component) => [component.parts?.brand, component.parts?.model].filter(Boolean).join(' ') || component.parts?.name || 'Not recorded'
export const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`)) : 'Not recorded'

