const number = (value) => value === '' || value === null || value === undefined ? 0 : Number(value)

export const economicTarget = (item = {}) => {
  if (item.coverage_type === 'AMC') return item.amc_cycle_id ? `AMC:${item.amc_cycle_id}` : null
  if (item.coverage_type === 'Equipment Warranty') return item.equipment_warranty_id ? `Equipment Warranty:${item.equipment_warranty_id}` : null
  if (item.coverage_type === 'Part Warranty') return item.service_item_warranty_id ? `Part Warranty:${item.service_item_warranty_id}` : null
  if (item.coverage_type === 'Paid') return 'Paid'
  if (item.coverage_type === 'Complimentary') return 'Complimentary'
  return null
}

export const economicTargetLabel = (item = {}) => {
  if (item.coverage_type === 'Paid') return 'Paid Service'
  if (item.coverage_type === 'AMC') return item.amc_cycles?.amc_code || 'AMC'
  if (item.coverage_type === 'Equipment Warranty') return item.equipment_warranties?.warranty_code || 'Equipment Warranty'
  if (item.coverage_type === 'Part Warranty') return item.service_item_warranties?.part_warranty_code || 'Part Warranty'
  if (item.coverage_type === 'Complimentary') return 'Complimentary / Goodwill'
  return 'Unallocated'
}

const knownCosts = (totals = {}) => [
  ['Technician', number(totals.technician)],
  ['Travel', number(totals.travel)],
  ['Other', number(totals.other)],
].filter(([, amount]) => amount > 0)

const targetRows = (items = []) => items
  .map((item) => ({ item, key: economicTarget(item) }))
  .filter(({ item, key }) => item?.id && key)

const sameSet = (left, right) => left.size === right.size && [...left].every((value) => right.has(value))

export function decideStructuralAllocation({ beforeItems = [], afterItems = [], allocations = [], totals = {} }) {
  const beforeById = new Map(beforeItems.map((item) => [item.id, item]))
  const afterById = new Map(afterItems.map((item) => [item.id, item]))
  const beforeTargets = new Set(targetRows(beforeItems).map(({ key }) => key))
  const afterTargetRows = targetRows(afterItems)
  const afterTargets = new Set(afterTargetRows.map(({ key }) => key))
  const targetSetChanged = !sameSet(beforeTargets, afterTargets)
  const existingAllocationChanged = allocations.some((allocation) => {
    const before = beforeById.get(allocation.source_service_item_id)
    const after = afterById.get(allocation.source_service_item_id)
    return !before || !after || economicTarget(before) !== economicTarget(after)
  })
  const costs = knownCosts(totals)

  if (!costs.length) {
    return { mode: 'none', allocationPayload: null, automaticRows: [] }
  }

  if (afterTargets.size === 1 && (targetSetChanged || existingAllocationChanged)) {
    const target = afterTargetRows[0]?.item
    const allocationPayload = costs.map(([cost_type, amount]) => ({
      cost_type,
      amount,
      source_service_item_id: target.id,
    }))
    return {
      mode: 'automatic',
      allocationPayload,
      automaticRows: allocationPayload.map((allocation) => ({
        ...allocation,
        before: allocations
          .filter((entry) => entry.cost_type === allocation.cost_type)
          .map((entry) => {
            const source = beforeById.get(entry.source_service_item_id)
            return { amount: number(entry.amount), label: economicTargetLabel(source) }
          }),
        afterLabel: economicTargetLabel(target),
      })),
    }
  }

  if (afterTargets.size > 1 && (targetSetChanged || existingAllocationChanged)) {
    return { mode: 'manual', allocationPayload: allocations, automaticRows: [] }
  }

  return { mode: 'unchanged', allocationPayload: null, automaticRows: [] }
}
