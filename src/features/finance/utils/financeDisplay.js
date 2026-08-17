import { formatCurrency, formatDate } from '../../../utils/formatters'

export function toBusinessDate(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateRangeForPreset(preset, today = new Date()) {
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (preset === 'today') return { dateFrom: toBusinessDate(current), dateTo: toBusinessDate(current) }
  if (preset === 'last-month') {
    const first = new Date(current.getFullYear(), current.getMonth() - 1, 1)
    const last = new Date(current.getFullYear(), current.getMonth(), 0)
    return { dateFrom: toBusinessDate(first), dateTo: toBusinessDate(last) }
  }
  if (preset === 'this-year') return { dateFrom: toBusinessDate(new Date(current.getFullYear(), 0, 1)), dateTo: toBusinessDate(current) }
  return { dateFrom: toBusinessDate(new Date(current.getFullYear(), current.getMonth(), 1)), dateTo: toBusinessDate(current) }
}

export function isValidDateRange({ dateFrom, dateTo }) {
  return Boolean(dateFrom && dateTo && dateFrom <= dateTo)
}

export function formatBusinessDate(value) {
  return formatDate(value)
}

export function formatMoney(value) {
  return value == null ? 'Unavailable' : formatCurrency(value)
}

export function formatBalance(value) {
  if (value == null) return 'Unavailable'
  const amount = Number(value)
  return amount < 0 ? `Credit ${formatCurrency(Math.abs(amount))}` : formatCurrency(amount)
}

export function categoryPath(row) {
  if (row.category === 'Sales') return `/sales/${row.transaction_id}`
  if (row.category === 'Service') return `/service/${row.transaction_id}`
  if (row.category === 'AMC') return `/coverage/amc/${row.transaction_id}`
  return null
}

export function humanError() {
  return 'Finance data could not be loaded. Please refresh and try again.'
}

