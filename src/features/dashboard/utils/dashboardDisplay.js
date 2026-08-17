import { formatCurrency, formatDate } from '../../../utils/formatters'
import { formatBalance, formatMoney } from '../../finance/utils/financeDisplay'

const indiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dateParts(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return { year, month, day }
  }
  return Object.fromEntries(indiaDateFormatter.formatToParts(value).filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, Number(part)]))
}

function dateFromParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function businessDate(value = new Date()) {
  return dateFromParts(dateParts(value))
}

export function addBusinessDays(date, days) {
  const parts = dateParts(date)
  return businessDate(new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days)))
}

export function firstBusinessDayOfMonth(date = new Date()) {
  const { year, month } = dateParts(date)
  return dateFromParts({ year, month, day: 1 })
}

export function daysUntil(date, today) {
  const from = dateParts(today)
  const to = dateParts(date)
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000)
}

export const displayDate = formatDate
export const displayMoney = formatMoney
export const displayBalance = formatBalance
export const displayCurrency = formatCurrency

export function collectionPath(item) {
  if (item.collection_type === 'Sale' || item.collection_type === 'EMI') return `/sales/${item.transaction_id}`
  if (item.collection_type === 'Service') return `/service/${item.transaction_id}`
  if (item.collection_type === 'AMC') return `/coverage/amc/${item.transaction_id}`
  return null
}

