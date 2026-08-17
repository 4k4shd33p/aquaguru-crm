export const money = (value) => value === null || value === undefined ? 'Not recorded' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value))
export const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : 'Not recorded'
export const equipmentLabel = (equipment) => equipment ? `${equipment.equipment_code}${equipment.serial_number ? ` · ${equipment.serial_number}` : ''}` : 'Equipment unavailable'
export const locationLabel = (location) => [location?.location_name, location?.area, location?.city].filter(Boolean).join(' · ') || 'Location not recorded'
export const statusTone = (status) => status === 'Active' ? 'blue' : 'neutral'
export function coverageError(error) { const message = String(error?.message ?? ''); if (message.includes('overlaps')) return 'An active AMC already covers part of these dates for this equipment.'; if (message.includes('end_date')) return 'End date must be on or after the start date.'; if (message.includes('price')) return 'AMC prices cannot be negative.'; if (message.includes('submission_key already')) return 'This AMC request no longer matches the original submission. Start a new AMC and try again.'; return 'The coverage update could not be saved. Please try again.' }

