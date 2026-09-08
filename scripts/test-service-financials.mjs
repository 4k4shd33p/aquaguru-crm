import assert from 'node:assert/strict'
import { calculateServiceFinancials } from '../src/features/service/utils/serviceFinancials.js'
import { validateServiceRequest } from '../src/features/service/validation/serviceValidation.js'

const item = (coverage_type, standard_price, internal_cost = 0, quantity = 1) => ({
  item_type: 'Labour / Work', coverage_type, standard_price, internal_cost, quantity,
})
const v2 = (items, values = {}) => calculateServiceFinancials({
  financial_model_version: 2, service_items: items, ...values,
})
const validate = (values) => validateServiceRequest({ items: [], parts: [], ...values })

let financials = v2([item('Paid', 2800, 400), item('AMC', 500, 100)], {
  final_customer_charge: 2500, technician_charge: 500, travel_cost: 100, other_direct_cost: 50,
})
assert.deepEqual(
  { usual: financials.usualServiceValue, chargeable: financials.chargeableSubtotal, final: financials.finalCustomerCharge, discount: financials.discount, additional: financials.additionalCharge, direct: financials.directCost, profit: financials.profit },
  { usual: 3300, chargeable: 2800, final: 2500, discount: 300, additional: 0, direct: 1150, profit: 1350 },
)

financials = v2([item('Paid', 2800)], { final_customer_charge: 3000 })
assert.equal(financials.additionalCharge, 200)
assert.equal(validate({ status: 'Completed', finalCustomerCharge: '3000', items: [item('Paid', 2800)], customerChargeNote: '' }), 'Customer Charge Note is required when Final Customer Charge exceeds Chargeable Subtotal.')

financials = v2([item('AMC', 1000)], { final_customer_charge: 0 })
assert.equal(financials.chargeableSubtotal, 0)
assert.equal(financials.finalCustomerCharge, 0)
assert.equal(financials.profit, 0)

for (const coverage of ['Equipment Warranty', 'Part Warranty', 'Complimentary', 'Other']) {
  assert.equal(v2([item(coverage, 1000)], { final_customer_charge: 0 }).chargeableSubtotal, 0)
}
assert.equal(v2([item('AMC', 900), item('Paid', 2800)], { final_customer_charge: 2800 }).chargeableSubtotal, 2800)
assert.equal(validate({ status: 'Open', finalCustomerCharge: '', items: [] }), '')
assert.equal(validate({ status: 'Completed', finalCustomerCharge: '', items: [item('Paid', 1)] }), 'Completed services require Final Customer Charge.')
assert.equal(validate({ status: 'Completed', finalCustomerCharge: '0', items: [item('Paid', 1)] }), '')
assert.equal(validate({ status: 'Open', finalCustomerCharge: '', otherDirectCost: '1', otherDirectCostNote: '', items: [] }), 'Other Direct Cost Note is required when Other Direct Cost is greater than zero.')

console.log('Service V2 financial calculation checks passed.')
