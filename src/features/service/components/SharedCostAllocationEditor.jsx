import { formatCurrency } from '../../../utils/formatters'

const number = (value) => value === '' || value === null || value === undefined ? 0 : Number(value)
const itemContext = (item) => {
  if (item.coverage_type === 'AMC') return `AMC:${item.amc_cycle_id || 'unknown'}`
  if (item.coverage_type === 'Equipment Warranty') return `Warranty:${item.equipment_warranty_id || 'unknown'}`
  if (item.coverage_type === 'Part Warranty') return `Part warranty:${item.service_item_warranty_id || 'unknown'}`
  return item.coverage_type || 'Unallocated'
}
const label = (item, index) => `${item.parts?.name || item.description || item.item_type || 'Work item'} #${index + 1} · ${item.coverage_type}`

export function SharedCostAllocationEditor({ items = [], totals = {}, allocations = [], onChange, sourceMode = 'index' }) {
  const targets = items.map((item, index) => ({ item, index, key: sourceMode === 'id' ? item.id : index, context: itemContext(item) })).filter((target) => target.key !== undefined && target.key !== null && target.context !== 'Other')
  const ambiguous = new Set(targets.map((target) => target.context)).size > 1
  const amountFor = (costType, target) => allocations.find((allocation) => allocation.cost_type === costType && String(sourceMode === 'id' ? allocation.source_service_item_id : allocation.source_item_index) === String(target.key))?.amount ?? ''
  const setAmount = (costType, target, amount) => {
    const key = sourceMode === 'id' ? 'source_service_item_id' : 'source_item_index'
    const next = allocations.filter((allocation) => !(allocation.cost_type === costType && String(allocation[key]) === String(target.key)))
    if (amount !== '') next.push({ cost_type: costType, [key]: target.key, amount })
    onChange(next)
  }
  if (!ambiguous) return null
  const rows = [['Technician', totals.technician], ['Travel', totals.travel], ['Other', totals.other]].filter(([, total]) => number(total) > 0)
  if (!rows.length) return null
  return <section className="shared-cost-allocation"><h3>Allocate shared Service costs</h3><p className="form-help">This Service has more than one economic context. Allocate known shared cost deliberately; any remainder stays Unallocated. The CRM never guesses a split.</p>{rows.map(([costType, total]) => { const allocated = targets.reduce((sum, target) => sum + number(amountFor(costType, target)), 0); const remainder = number(total) - allocated; return <div className="shared-cost-allocation__row" key={costType}><strong>{costType === 'Travel' ? 'Travel / Petrol' : costType} · {formatCurrency(total)}</strong>{targets.map((target) => <label key={target.key}>{label(target.item, target.index)}<input type="number" min="0" max={total} step="0.01" value={amountFor(costType, target)} onChange={(event) => setAmount(costType, target, event.target.value)} /></label>)}<small>{remainder < 0 ? 'Allocated amount exceeds the Service-level cost.' : `Unallocated remainder: ${formatCurrency(remainder)}`}</small></div>})}</section>
}
