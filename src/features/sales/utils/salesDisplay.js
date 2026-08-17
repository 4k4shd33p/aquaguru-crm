import { formatCurrency, formatDate } from '../../../utils/formatters'
export { formatCurrency, formatDate }
export const warrantyLabel = (value) => value === null || value === undefined ? 'Not recorded' : Number(value) === 0 ? 'No warranty' : `${value} months`
export const locationLabel = (location) => location?.location_name || [location?.area, location?.city].filter(Boolean).join(', ') || 'Location not assigned'
export const saleStatusTone = (status) => status === 'Completed' ? 'success' : status === 'Confirmed' ? 'blue' : status === 'Cancelled' || status === 'Void' ? 'danger' : 'neutral'
export const saleErrorMessage = (error) => { const message = error?.message || ''; if (message.includes('submission_key already belongs')) return 'This sale submission no longer matches the original request. Start a new sale and try again.'; if (message.includes('location must belong')) return 'One or more selected locations do not belong to this customer.'; if (message.includes('sale item') || message.includes('items')) return 'Please review the sale items.'; return 'The sale could not be created. Please try again.' }

