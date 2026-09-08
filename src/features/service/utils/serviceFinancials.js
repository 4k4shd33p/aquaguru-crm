const number = (value) => Number(value ?? 0)

const optionalNumber = (value) => value === '' || value === null || value === undefined
  ? null
  : Number(value)

export const isServiceV2 = (service) => Number(service?.financial_model_version) === 2

export function calculateServiceFinancials(service) {
  const items = service?.service_items ?? service?.items ?? []
  const usualServiceValue = items.reduce((sum, item) => sum + number(item.standard_price) * number(item.quantity || 1), 0)
  const chargeableSubtotal = items.reduce((sum, item) => item.coverage_type === 'Paid'
    ? sum + number(item.standard_price) * number(item.quantity || 1)
    : sum, 0)
  const legacyValue = items.reduce((sum, item) => sum + number(item.actual_customer_price) * number(item.quantity || 1), 0)
  const itemCost = items.reduce((sum, item) => sum + number(item.internal_cost) * number(item.quantity || 1), 0)
  const v2 = isServiceV2(service)
  const finalCustomerCharge = v2 ? optionalNumber(service?.final_customer_charge ?? service?.finalCustomerCharge) : legacyValue
  const chargeKnown = finalCustomerCharge !== null
  const technicianCost = number(service?.technician_charge ?? service?.technicianCharge)
  const travelCost = number(service?.travel_cost ?? service?.travelCost)
  const otherDirectCost = number(service?.other_direct_cost ?? service?.otherDirectCost)
  const directCost = itemCost + technicianCost + travelCost + otherDirectCost
  const amountReceived = (service?.service_payments ?? service?.payments ?? []).reduce((sum, payment) => sum + number(payment.amount), 0)
  const authoritativeValue = finalCustomerCharge

  return {
    modelVersion: v2 ? 2 : 1,
    usualServiceValue,
    chargeableSubtotal,
    legacyValue,
    finalCustomerCharge,
    authoritativeValue,
    chargeKnown,
    discount: chargeKnown ? Math.max(chargeableSubtotal - finalCustomerCharge, 0) : null,
    additionalCharge: chargeKnown ? Math.max(finalCustomerCharge - chargeableSubtotal, 0) : null,
    itemCost,
    technicianCost,
    travelCost,
    otherDirectCost,
    directCost,
    profit: chargeKnown ? finalCustomerCharge - directCost : null,
    amountReceived,
    amountDue: chargeKnown ? finalCustomerCharge - amountReceived : null,
  }
}
