export function validateServiceRequest({ status, items, parts, finalCustomerCharge, otherDirectCost, otherDirectCostNote, customerChargeNote }) {
  if (status === 'Completed' && !items.length) return 'Completed service requires at least one work item.'
  const finalChargeKnown = finalCustomerCharge !== '' && finalCustomerCharge !== null && finalCustomerCharge !== undefined
  const finalCharge = finalChargeKnown ? Number(finalCustomerCharge) : null
  const chargeableSubtotal = items.reduce((sum, item) => item.coverage_type === 'Paid'
    ? sum + Number(item.standard_price || 0) * Number(item.quantity || 1)
    : sum, 0)
  if (status === 'Completed' && !finalChargeKnown) return 'Completed services require Final Customer Charge.'
  if (finalChargeKnown && (Number.isNaN(finalCharge) || finalCharge < 0)) return 'Final Customer Charge cannot be negative.'
  if (Number(otherDirectCost || 0) > 0 && !String(otherDirectCostNote || '').trim()) return 'Other Direct Cost Note is required when Other Direct Cost is greater than zero.'
  if (finalChargeKnown && finalCharge > chargeableSubtotal && !String(customerChargeNote || '').trim()) return 'Customer Charge Note is required when Final Customer Charge exceeds Chargeable Subtotal.'
  const roles = new Set()
  for (const item of items) {
    if (!item.item_type) return 'Choose an item type for every work item.'
    if (Number(item.quantity) <= 0) return 'Every work item needs a quantity greater than zero.'
    const part = parts.find((candidate) => candidate.id === item.part_id)
    if (item.updates_equipment_component) {
      if (status !== 'Completed' || item.item_type !== 'Replacement' || !part?.equipment_tracking_enabled || Number(item.quantity) !== 1) return 'Component updates require a completed, one-unit tracked replacement.'
      if (roles.has(part.component_role_id)) return 'Only one component update per component role is allowed in a service.'
      roles.add(part.component_role_id)
    }
    if (item.issue_new_part_warranty && (status !== 'Completed' || item.item_type !== 'Replacement' || item.coverage_type !== 'Paid' || !part?.part_warranty_eligible || Number(item.quantity) !== 1)) return 'New part warranty needs a completed, one-unit paid replacement using an eligible part.'
    if (item.coverage_type === 'Part Warranty' && (!item.part_id || Number(item.quantity) !== 1 || item.item_type !== 'Replacement')) return 'A part-warranty claim needs a one-unit replacement for the matching part.'
  }
  return ''
}

