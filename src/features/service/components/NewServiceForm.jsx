import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../../components/ui/Button'
import { formatCurrency } from '../../../utils/formatters'
import { useEquipmentCoverage, useServiceLookups } from '../hooks/useService'
import { calculateServiceFinancials } from '../utils/serviceFinancials'
import { serviceErrorMessage } from '../utils/serviceDisplay'
import { validateServiceRequest } from '../validation/serviceValidation'
import { ServiceEquipmentSelector } from './ServiceEquipmentSelector'
import { ServiceItemEditor } from './ServiceItemEditor'

const today = () => new Date().toLocaleDateString('en-CA')
const blank = () => ({ id: crypto.randomUUID(), part_id: '', item_type: 'Replacement', description: '', quantity: 1, standard_price: '', internal_cost: '', coverage_type: 'Paid', equipment_warranty_id: '', amc_cycle_id: '', service_item_warranty_id: '', updates_equipment_component: false, issue_new_part_warranty: false, notes: '' })
const amount = (value) => value === null ? 'Not set' : formatCurrency(value)

function FinancialPreview({ financials }) {
  return <div className="service-financial-preview" aria-live="polite">
    <p><span>Usual Service Value</span><strong>{formatCurrency(financials.usualServiceValue)}</strong></p>
    <p><span>Chargeable Subtotal</span><strong>{formatCurrency(financials.chargeableSubtotal)}</strong></p>
    <p><span>Final Customer Charge</span><strong>{amount(financials.finalCustomerCharge)}</strong></p>
    {financials.chargeKnown && <><p><span>Discount</span><strong>{formatCurrency(financials.discount)}</strong></p>{financials.additionalCharge > 0 && <p><span>Additional Charge</span><strong>{formatCurrency(financials.additionalCharge)}</strong></p>}<p><span>Profit</span><strong>{formatCurrency(financials.profit)}</strong></p></>}
    <p><span>Direct Cost</span><strong>{formatCurrency(financials.directCost)}</strong></p>
  </div>
}

export function NewServiceForm({ initialEquipment, onSubmit, isSubmitting }) {
  const { register, handleSubmit, watch } = useForm({ defaultValues: { serviceDate: today(), serviceTypeId: '', technicianId: '', status: 'Open', issueReported: '', diagnosis: '', workPerformed: '', tdsIn: '', tdsOut: '', nextServiceDue: '', technicianCharge: '', travelCost: '', otherDirectCost: '', otherDirectCostNote: '', finalCustomerCharge: '', customerChargeNote: '', coverageContext: '', notes: '' } })
  const [equipment, setEquipment] = useState(initialEquipment || null)
  const [term, setTerm] = useState(initialEquipment?.equipment_code || '')
  const [items, setItems] = useState([])
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const key = useRef(crypto.randomUUID())
  const lookups = useServiceLookups()
  const status = watch('status')
  const date = watch('serviceDate')
  const financials = calculateServiceFinancials({ financial_model_version: 2, service_items: items, finalCustomerCharge: watch('finalCustomerCharge'), technicianCharge: watch('technicianCharge'), travelCost: watch('travelCost'), otherDirectCost: watch('otherDirectCost') })
  const coverage = useEquipmentCoverage(equipment?.id, date)
  const parts = lookups.data?.parts ?? []

  useEffect(() => { if (initialEquipment?.id) { setEquipment(initialEquipment); setTerm(initialEquipment.equipment_code) } }, [initialEquipment])
  const update = (id, item) => setItems((current) => current.map((candidate) => candidate.id === id ? item : candidate))
  async function submit(values) {
    setError('')
    const validation = !equipment
      ? 'Choose the equipment being serviced.'
      : !values.serviceTypeId
        ? 'Choose a service type.'
        : validateServiceRequest({ status: values.status, items, parts, finalCustomerCharge: values.finalCustomerCharge, otherDirectCost: values.otherDirectCost, otherDirectCostNote: values.otherDirectCostNote, customerChargeNote: values.customerChargeNote })
    if (validation) { setError(validation); return }
    const [type, id] = values.coverageContext.split(':')
    try {
      await onSubmit({ ...values, equipmentId: equipment.id, equipmentWarrantyId: type === 'ew' ? id : '', amcCycleId: type === 'amc' ? id : '', items, submissionKey: key.current })
      key.current = crypto.randomUUID()
    } catch (err) { setError(serviceErrorMessage(err)) }
  }

  return <form className="service-wizard" onSubmit={handleSubmit(submit)}>
    <ol className="service-wizard__steps"><li className={step >= 1 ? 'active' : ''}>1. Equipment</li><li className={step >= 2 ? 'active' : ''}>2. Visit</li><li className={step >= 3 ? 'active' : ''}>3. Work & coverage</li><li className={step >= 4 ? 'active' : ''}>4. Review</li></ol>
    {error && <p className="form-message" role="alert">{error}</p>}
    {step === 1 && <ServiceEquipmentSelector equipment={equipment} equipmentTerm={term} setEquipmentTerm={setTerm} onSelect={(next) => { setEquipment(next); setTerm(next.equipment_code); setItems([]) }} onClear={() => setEquipment(null)} />}
    {step === 2 && <section className="service-wizard__panel"><h3>Visit details</h3><div className="service-form-grid"><label>Service date<input type="date" {...register('serviceDate', { required: true })} /></label><label>Service type<select {...register('serviceTypeId', { required: true })}><option value="">Choose type</option>{(lookups.data?.serviceTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Status<select {...register('status')}>{['Scheduled', 'Open', 'Completed', 'Cancelled', 'Void', 'Unknown'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Technician<select {...register('technicianId')}><option value="">Not assigned</option>{(lookups.data?.technicians ?? []).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label><label>Issue reported<textarea {...register('issueReported')} /></label><label>Diagnosis<textarea {...register('diagnosis')} /></label><label>Work performed<textarea {...register('workPerformed')} /></label><label>TDS in<input type="number" min="0" step="0.01" {...register('tdsIn')} /></label><label>TDS out<input type="number" min="0" step="0.01" {...register('tdsOut')} /></label><label>Next service due<input type="date" {...register('nextServiceDue')} /></label><label>Technician Cost<input type="number" min="0" step="0.01" {...register('technicianCharge')} /></label></div></section>}
    {step === 3 && <section className="service-wizard__panel"><h3>Work items & coverage</h3><p>Scheduled and open services may have no work items. Completed services require at least one.</p><label>Default Coverage<select {...register('coverageContext')}><option value="">No service-level coverage</option>{(coverage.data?.warranties ?? []).map((warranty) => <option key={warranty.id} value={`ew:${warranty.id}`}>Equipment warranty · {warranty.warranty_code}</option>)}{(coverage.data?.amcCycles ?? []).map((cycle) => <option key={cycle.id} value={`amc:${cycle.id}`}>AMC · {cycle.amc_code} cycle {cycle.cycle_number}</option>)}</select></label>{items.map((item, index) => <ServiceItemEditor key={item.id} item={item} index={index} parts={parts} equipmentId={equipment?.id} serviceDate={date} status={status} coverage={coverage.data ?? { warranties: [], amcCycles: [] }} onChange={(next) => update(item.id, next)} onRemove={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} />)}<Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, blank()])}><Plus size={16} />Add work item</Button><div className="service-financial-fields"><h3>Service financials</h3><div className="service-form-grid"><label>Final Customer Charge<input type="number" min="0" step="0.01" {...register('finalCustomerCharge')} /></label><label>Travel / Petrol<input type="number" min="0" step="0.01" {...register('travelCost')} /></label><label>Other Direct Cost<input type="number" min="0" step="0.01" {...register('otherDirectCost')} /></label><label>Other Direct Cost Note<input {...register('otherDirectCostNote')} /></label><label className="service-form-grid__full">Customer Charge Note<input {...register('customerChargeNote')} /></label></div><FinancialPreview financials={financials} /></div></section>}
    {step === 4 && <section className="service-wizard__panel"><h3>Review service</h3><p><strong>{equipment?.equipment_code}</strong> · {equipment?.customers?.name || 'Customer not recorded'}</p><p>{items.length ? `${items.length} work item${items.length === 1 ? '' : 's'} ready to save.` : 'No work items will be created.'}</p><FinancialPreview financials={financials} /><label>Notes<textarea {...register('notes')} /></label></section>}
    <div className="service-wizard__actions">{step > 1 && <Button type="button" variant="secondary" onClick={() => setStep((value) => value - 1)}>Back</Button>}{step < 4 ? <Button type="button" onClick={() => { if (step === 1 && !equipment) setError('Choose equipment before continuing.'); else setStep((value) => value + 1) }}>Continue</Button> : <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving service…' : 'Create service'}</Button>}</div>
  </form>
}
