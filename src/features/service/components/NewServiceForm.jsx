import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../../components/ui/Button'
import { formatCurrency } from '../../../utils/formatters'
import { useEquipmentCoverage, useServiceCustomerLocations, useServiceLookups } from '../hooks/useService'
import { calculateServiceFinancials } from '../utils/serviceFinancials'
import { serviceErrorMessage } from '../utils/serviceDisplay'
import { validateServiceRequest } from '../validation/serviceValidation'
import { ServiceEquipmentSelector } from './ServiceEquipmentSelector'
import { ServiceItemEditor } from './ServiceItemEditor'
import { locationLabel } from '../../equipment/utils/equipmentDisplay'

const today = () => new Date().toLocaleDateString('en-CA')
const blank = () => ({ id: crypto.randomUUID(), part_id: '', item_type: 'Replacement', description: '', quantity: 1, standard_price: '', internal_cost: '', coverage_type: 'Paid', equipment_warranty_id: '', amc_cycle_id: '', service_item_warranty_id: '', updates_equipment_component: false, issue_new_part_warranty: false, notes: '' })
const amount = (value) => value === null || value === '' || value === undefined ? 'Not set' : formatCurrency(value)
const plusFourMonths = (date) => { if (!date) return ''; const value = new Date(`${date}T00:00:00`); value.setMonth(value.getMonth() + 4); return value.toLocaleDateString('en-CA') }
const coverageName = (type) => ({ Paid: 'Paid', AMC: 'AMC-covered', 'Equipment Warranty': 'Equipment-warranty-covered', 'Part Warranty': 'Part-warranty-covered', Complimentary: 'Complimentary', Other: 'Other / unallocated' }[type] || type)

function ReviewSummary({ values, equipment, items, financials, serviceTypeName, technicianName }) {
  const coverageGroups = items.reduce((groups, item) => ({ ...groups, [item.coverage_type]: [...(groups[item.coverage_type] || []), item] }), {})
  const paidItems = coverageGroups.Paid || []
  const coveredItems = Object.entries(coverageGroups).filter(([type]) => type !== 'Paid')
  return <div className="service-review">
    <section><h3>Service details</h3><dl className="service-review__facts"><div><dt>Service Date</dt><dd>{values.serviceDate || 'Not set'}</dd></div><div><dt>Equipment</dt><dd>{equipment?.equipment_code || 'Not set'}</dd></div><div><dt>Service Type</dt><dd>{serviceTypeName || 'Not set'}</dd></div><div><dt>Status</dt><dd>{values.status}</dd></div><div><dt>Technician</dt><dd>{technicianName || 'Not assigned'}</dd></div><div><dt>Recommended Next Service</dt><dd>{values.nextServiceDue || 'Not set'}</dd></div></dl>
      <p><strong>Issue reported:</strong> {values.issueReported || 'Not recorded'}</p><p><strong>Diagnosis:</strong> {values.diagnosis || 'Not recorded'}</p><p><strong>Work performed:</strong> {values.workPerformed || 'Not recorded'}</p><p><strong>TDS:</strong> {values.tdsIn || '—'} in · {values.tdsOut || '—'} out</p>
    </section>
    <section><h3>Work and coverage</h3>{items.length ? <>{items.map((item) => <p key={item.id}><strong>{item.part_id ? 'Part' : item.item_type}</strong> × {item.quantity} · {coverageName(item.coverage_type)}{item.description ? ` — ${item.description}` : ''}</p>)}{coveredItems.map(([type, grouped]) => <p className="form-help" key={type}>{coverageName(type)}: {grouped.length} item{grouped.length === 1 ? '' : 's'}; this work is not customer revenue for this visit.</p>)}</> : <p>No work items will be created.</p>}</section>
    <section><h3>Commercial context</h3>{paidItems.length ? <p><strong>Paid customer charge</strong> {amount(financials.finalCustomerCharge)}</p> : <p><strong>Customer charge</strong> {financials.chargeKnown ? amount(financials.finalCustomerCharge) : 'Not set'} · covered work is not presented as visit revenue.</p>}<FinancialPreview financials={financials} /></section>
  </div>
}

function FinancialPreview({ financials }) {
  return <div className="service-financial-preview" aria-live="polite">
    <p><span>Usual Service Value</span><strong>{formatCurrency(financials.usualServiceValue)}</strong></p>
    <p><span>Chargeable Subtotal</span><strong>{formatCurrency(financials.chargeableSubtotal)}</strong></p>
    <p><span>Final Customer Charge</span><strong>{amount(financials.finalCustomerCharge)}</strong></p>
    {financials.chargeKnown && <><p><span>Discount</span><strong>{formatCurrency(financials.discount)}</strong></p>{financials.additionalCharge > 0 && <p><span>Additional Charge</span><strong>{formatCurrency(financials.additionalCharge)}</strong></p>}<p><span>Profit</span><strong>{formatCurrency(financials.profit)}</strong></p></>}
    <p><span>Direct Cost</span><strong>{formatCurrency(financials.directCost)}</strong></p>
  </div>
}

export function NewServiceForm({ initialEquipment, onSubmit, onCancel, isSubmitting }) {
  const { register, handleSubmit, watch, setValue } = useForm({ defaultValues: { historicalEntry: false, serviceDate: today(), serviceTypeId: '', technicianId: '', status: 'Open', issueReported: '', diagnosis: '', workPerformed: '', tdsIn: '', tdsOut: '', nextServiceDue: '', technicianCharge: '', travelCost: '', otherDirectCost: '', otherDirectCostNote: '', finalCustomerCharge: '', customerChargeNote: '', coverageContext: '', destinationLocationId: '', notes: '' } })
  const [equipment, setEquipment] = useState(initialEquipment || null)
  const [term, setTerm] = useState(initialEquipment?.equipment_code || '')
  const [items, setItems] = useState([])
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const key = useRef(crypto.randomUUID())
  const submissionInFlight = useRef(false)
  const lookups = useServiceLookups()
  const values = watch()
  const status = watch('status')
  const date = watch('serviceDate')
  const historicalEntry = watch('historicalEntry')
  const selectedServiceTypeId = watch('serviceTypeId')
  const destinationLocationId = watch('destinationLocationId')
  const financials = calculateServiceFinancials({ financial_model_version: 2, service_items: items, finalCustomerCharge: watch('finalCustomerCharge'), technicianCharge: watch('technicianCharge'), travelCost: watch('travelCost'), otherDirectCost: watch('otherDirectCost') })
  const coverage = useEquipmentCoverage(equipment?.id, date)
  const parts = lookups.data?.parts ?? []
  const relocationType = (lookups.data?.serviceTypes ?? []).find((type) => type.id === selectedServiceTypeId)?.is_relocation_service === true
  const customerLocations = useServiceCustomerLocations(equipment?.customer_id)

  useEffect(() => { if (initialEquipment?.id) { setEquipment(initialEquipment); setTerm(initialEquipment.equipment_code) } }, [initialEquipment])
  useEffect(() => { if (date && !watch('nextServiceDue')) setValue('nextServiceDue', plusFourMonths(date)) }, [date, setValue])
  const update = (id, item) => setItems((current) => current.map((candidate) => candidate.id === id ? item : candidate))
  async function submit(values) {
    if (step !== 4 || submissionInFlight.current || isSubmitting) return
    setError('')
    const validation = !equipment
      ? 'Choose the equipment being serviced.'
      : !values.serviceTypeId
        ? 'Choose a service type.'
        : relocationType && !values.destinationLocationId
          ? 'Choose the destination location for this relocation Service.'
        : validateServiceRequest({ status: values.status, items, parts, finalCustomerCharge: values.finalCustomerCharge, otherDirectCost: values.otherDirectCost, otherDirectCostNote: values.otherDirectCostNote, customerChargeNote: values.customerChargeNote })
    if (validation) { setError(validation); return }
    const [type, id] = values.coverageContext.split(':')
    try {
      submissionInFlight.current = true
      await onSubmit({ ...values, equipmentId: equipment.id, equipmentWarrantyId: type === 'ew' ? id : '', amcCycleId: type === 'amc' ? id : '', items, destinationLocationId: relocationType ? values.destinationLocationId : '', submissionKey: key.current })
      key.current = crypto.randomUUID()
    } catch (err) { submissionInFlight.current = false; setError(serviceErrorMessage(err)) }
  }

  return <form className="service-wizard" onSubmit={handleSubmit(submit)}>
    <ol className="service-wizard__steps"><li className={step >= 1 ? 'active' : ''}>1. Equipment</li><li className={step >= 2 ? 'active' : ''}>2. Visit</li><li className={step >= 3 ? 'active' : ''}>3. Work & coverage</li><li className={step >= 4 ? 'active' : ''}>4. Review</li></ol>
    {historicalEntry && <p className="form-message form-message--warning"><strong>Historical Entry</strong> — this records a visit that already happened. Enter its actual Service Date; leave unknown details blank.</p>}
    {error && <p className="form-message" role="alert">{error}</p>}
    {step === 1 && <ServiceEquipmentSelector equipment={equipment} equipmentTerm={term} setEquipmentTerm={setTerm} onSelect={(next) => { setEquipment(next); setTerm(next.equipment_code); setItems([]); setValue('destinationLocationId', '') }} onClear={() => { setEquipment(null); setValue('destinationLocationId', '') }} />}
    {step === 2 && <section className="service-wizard__panel"><h3>Visit details</h3><div className="service-form-grid"><label className="service-form-grid__full form-checkbox"><input type="checkbox" {...register('historicalEntry', { onChange: (event) => { if (event.target.checked && watch('serviceDate') === today()) setValue('serviceDate', '') } })} />Historical Entry — this happened before it was entered into the CRM</label><label>Service date<input type="date" {...register('serviceDate', { required: true })} /></label><label>Service type<select {...register('serviceTypeId', { required: true })}><option value="">Choose type</option>{(lookups.data?.serviceTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>{relocationType && <><label><span>From location</span><input value={locationLabel(equipment?.locations)} readOnly /></label><label>Destination location<select {...register('destinationLocationId', { required: relocationType })} value={destinationLocationId}><option value="">Choose destination</option>{(customerLocations.data ?? []).filter((location) => location.id !== equipment?.location_id).map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select><small>Only active locations for this equipment’s customer are available. Add a new location from the Customer record first.</small></label></>}<label>Status<select {...register('status')}>{['Scheduled', 'Open', 'Completed', 'Cancelled', 'Void', 'Unknown'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Technician<select {...register('technicianId')}><option value="">Not assigned</option>{(lookups.data?.technicians ?? []).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label><label>Issue reported<textarea {...register('issueReported')} /></label><label>Diagnosis<textarea {...register('diagnosis')} /></label><label>Work performed<textarea {...register('workPerformed')} /></label><label>TDS in<input type="number" min="0" step="0.01" {...register('tdsIn')} /></label><label>TDS out<input type="number" min="0" step="0.01" {...register('tdsOut')} /></label><label>Recommended Next Service<input type="date" {...register('nextServiceDue')} /><small>Suggested 4 months after the Service Date. Editable; not a booked appointment.</small></label><label>Technician Cost<input type="number" min="0" step="0.01" {...register('technicianCharge')} /></label></div></section>}
    {step === 3 && <section className="service-wizard__panel"><h3>Work items & coverage</h3><p>Scheduled and open services may have no work items. Completed services require at least one.</p><label>Default Coverage<select {...register('coverageContext')}><option value="">No service-level coverage</option>{(coverage.data?.warranties ?? []).map((warranty) => <option key={warranty.id} value={`ew:${warranty.id}`}>Equipment warranty · {warranty.warranty_code}</option>)}{(coverage.data?.amcCycles ?? []).map((cycle) => <option key={cycle.id} value={`amc:${cycle.id}`}>AMC · {cycle.amc_code} cycle {cycle.cycle_number}</option>)}</select></label>{items.map((item, index) => <ServiceItemEditor key={item.id} item={item} index={index} parts={parts} equipmentId={equipment?.id} serviceDate={date} status={status} coverage={coverage.data ?? { warranties: [], amcCycles: [] }} onChange={(next) => update(item.id, next)} onRemove={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} />)}<Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, blank()])}><Plus size={16} />Add work item</Button><div className="service-financial-fields"><h3>Service financials</h3><div className="service-form-grid"><label>Final Customer Charge<input type="number" min="0" step="0.01" {...register('finalCustomerCharge')} /></label><label>Travel / Petrol<input type="number" min="0" step="0.01" {...register('travelCost')} /></label><label>Other Direct Cost<input type="number" min="0" step="0.01" {...register('otherDirectCost')} /></label><label>Other Direct Cost Note<input {...register('otherDirectCostNote')} /></label><label className="service-form-grid__full">Customer Charge Note<input {...register('customerChargeNote')} /></label></div><FinancialPreview financials={financials} /></div></section>}
    {step === 4 && <section className="service-wizard__panel"><h3>Review service</h3><p className="form-help">Review is read-only until you explicitly complete this Service below.</p><ReviewSummary values={values} equipment={equipment} items={items} financials={financials} serviceTypeName={(lookups.data?.serviceTypes ?? []).find((type) => type.id === values.serviceTypeId)?.name} technicianName={(lookups.data?.technicians ?? []).find((technician) => technician.id === values.technicianId)?.name} /><label>Notes<textarea {...register('notes')} /></label></section>}
    <div className="service-wizard__actions">{step > 1 && <Button type="button" variant="secondary" onClick={() => setStep((value) => value - 1)}>Back</Button>}{step < 4 ? <Button type="button" onClick={() => { if (step === 1 && !equipment) setError('Choose equipment before continuing.'); else setStep((value) => value + 1) }}>Continue</Button> : <Button type="submit" disabled={isSubmitting || submissionInFlight.current}>{isSubmitting ? 'Saving service…' : status === 'Completed' ? 'Complete Service' : 'Save Service'}</Button>}{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}</div>
  </form>
}
