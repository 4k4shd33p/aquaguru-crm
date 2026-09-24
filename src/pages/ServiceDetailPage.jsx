import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { PaymentCorrectionForm } from '../features/payments/components/PaymentCorrectionForm'
import { useAddServicePayment, useAmendService, useEquipmentCoverage, useService, useServiceEconomics, useServiceLookups } from '../features/service/hooks/useService'
import { coverageLabel, formatCurrency, formatDate, serviceStatusTone } from '../features/service/utils/serviceDisplay'
import { calculateServiceFinancials } from '../features/service/utils/serviceFinancials'
import { locationLabel } from '../features/equipment/utils/equipmentDisplay'
import { ServiceItemEditor } from '../features/service/components/ServiceItemEditor'
import { SharedCostAllocationEditor } from '../features/service/components/SharedCostAllocationEditor'
import { RecordedWorkDetails, StructuralServiceItemCorrection } from '../features/service/components/StructuralServiceItemCorrection'

const today = () => new Date().toLocaleDateString('en-CA')
const money = (value) => value === null || value === undefined ? 'Not set' : formatCurrency(value)

function PaymentForm({ methods, saving, onSave }) {
  const { register, handleSubmit } = useForm({ defaultValues: { payment_date: today(), amount: '', payment_method_id: '', reference_number: '', notes: '' } })
  return <form className="crm-form" onSubmit={handleSubmit(onSave)}><label className="form-checkbox"><input type="checkbox" {...register('historicalEntry', { onChange: (e) => { if (e.target.checked) setValue('payment_date', '') } })} />Historical Entry — enter the actual payment date</label><label>Date<input type="date" {...register('payment_date', { required: true })} /></label><label>Amount<input type="number" min="0.01" step="0.01" {...register('amount', { required: true })} /></label><label>Method<select {...register('payment_method_id', { required: true })}><option value="">Choose method</option>{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><label>Reference<input {...register('reference_number')} /></label><label>Notes<input {...register('notes')} /></label><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</Button></form>
}

function serviceCommercialContext(service) {
  const coverage = new Set((service.service_items || []).map((item) => item.coverage_type))
  if (coverage.size !== 1) return coverage.size ? 'Mixed' : 'None'
  return [...coverage][0]
}

function itemCoverageContext(item = {}) {
  if (item.coverage_type === 'Paid') return { key: 'paid', label: 'Paid' }
  if (item.coverage_type === 'AMC') return { key: `amc:${item.amc_cycle_id || 'unknown'}`, label: item.amc_cycles?.amc_code || 'AMC' }
  if (item.coverage_type === 'Equipment Warranty') return { key: 'equipment-warranty', label: 'Equipment Warranty' }
  if (item.coverage_type === 'Part Warranty') return { key: 'part-warranty', label: 'Part Warranty' }
  if (item.coverage_type === 'Complimentary') return { key: 'complimentary', label: 'Complimentary' }
  return { key: item.coverage_type || 'none', label: item.coverage_type || 'None' }
}

function serviceCoverageSummary(service) {
  const contexts = new Map()
  ;(service.service_items || []).forEach((item) => {
    const context = itemCoverageContext(item)
    if (!contexts.has(context.key)) contexts.set(context.key, context.label)
  })
  const labels = [...contexts.values()]
  return { label: labels.length > 1 ? 'Mixed' : labels[0] || 'None', contexts: labels }
}

function FinancialDetails({ financials, context = 'None' }) {
  const covered = context === 'AMC' || context === 'Equipment Warranty'
  const mixed = context === 'Mixed'
  return <section className="card"><h2>Financial summary</h2><div className="service-financial-detail"><p><span>Usual Service Value</span><strong>{formatCurrency(financials.usualServiceValue)}</strong></p><p><span>Chargeable Subtotal</span><strong>{formatCurrency(financials.chargeableSubtotal)}</strong><small>Customer-payable work before final charge adjustments.</small></p><p><span>Final Customer Charge</span><strong>{money(financials.finalCustomerCharge)}</strong></p>{financials.chargeKnown && <><p><span>Discount</span><strong>{formatCurrency(financials.discount)}</strong></p>{financials.additionalCharge > 0 && <p><span>Additional Charge</span><strong>{formatCurrency(financials.additionalCharge)}</strong></p>}</>}<p><span>Amount Received</span><strong>{formatCurrency(financials.amountReceived)}</strong></p><p><span>Amount Due</span><strong>{money(financials.amountDue)}</strong></p></div>{covered && <p className="form-help">{context === 'AMC' ? 'This visit fulfils an AMC contract; the canonical cost breakdown below is accounted against the AMC, not as standalone Service profit.' : 'This visit fulfils equipment warranty coverage; the canonical cost breakdown below is accounted against warranty attribution, not as standalone Service profit.'}</p>}{mixed && <p className="form-help">This Service has mixed coverage. Customer charge and costs are separated by their economic context below.</p>}</section>
}

const bucketLabel = (bucket) => ({ 'Paid Service': 'Paid Service', AMC: 'AMC', 'Product Sales': 'Warranty', 'Complimentary / Goodwill': 'Complimentary', Unallocated: 'Unallocated' }[bucket] || bucket)
const componentLabel = (type) => ({ Item: 'Work-item direct cost', Technician: 'Technician allocated', Travel: 'Travel / Petrol allocated', Other: 'Other Direct Cost allocated' }[type] || type)

function CostBreakdown({ economics, financials, service }) {
  if (economics.isLoading) return <section className="card"><h2>Cost breakdown</h2><p>Loading cost breakdown…</p></section>
  if (economics.isError || !economics.data) return <section className="card"><h2>Cost breakdown</h2><p>Cost breakdown is unavailable right now. Please refresh and try again.</p></section>
  const breakdown = economics.data
  const contexts = breakdown.cost_contexts || []
  const isPurePaid = contexts.length === 1 && contexts[0].economic_bucket === 'Paid Service'
  const hasUnknownCost = Number(breakdown.unknown_cost_count) > 0
  const knownCost = Number(breakdown.known_direct_cost)
  const revenue = Number(financials.authoritativeValue)
  const amcCycles = [...new Map((service?.service_items || []).filter((item) => item.coverage_type === 'AMC' && item.amc_cycle_id && item.amc_cycles).map((item) => [item.amc_cycle_id, item.amc_cycles])).values()]
  return <section className="card"><h2>Cost breakdown</h2>{isPurePaid && <div className="service-financial-detail"><p><span>Customer Charge / Revenue</span><strong>{formatCurrency(revenue)}</strong></p><p><span>Known Direct Cost</span><strong>{formatCurrency(knownCost)}</strong></p>{!hasUnknownCost && <p><span>Gross Profit</span><strong>{formatCurrency(revenue - knownCost)}</strong></p>}</div>}{contexts.map((context) => {
    const paidContext = context.economic_bucket === 'Paid Service'
    const unknown = Number(context.unknown_cost_count) > 0
    return <article className={paidContext ? 'service-detail-item service-detail-item--paid-context' : 'service-detail-item'} key={context.economic_bucket}><div><strong>{paidContext ? 'Paid Service' : bucketLabel(context.economic_bucket)} {context.economic_bucket === 'AMC' ? 'Cost Incurred' : context.economic_bucket === 'Product Sales' ? 'Cost Incurred' : paidContext ? '' : 'Cost'}</strong><strong>{paidContext ? `Known direct cost ${formatCurrency(context.known_direct_cost)}` : formatCurrency(context.known_direct_cost)}</strong></div>{paidContext && <p><span>Paid Service Revenue</span><strong>{formatCurrency(revenue)}</strong></p>}{context.economic_bucket === 'AMC' && amcCycles.map((cycle) => <p className="service-amc-trace" key={cycle.id}><Link to={`/coverage/amc/${cycle.id}`}>{cycle.amc_code} · View AMC</Link></p>)}{(context.components || []).map((component) => <p key={component.cost_type}><span>{componentLabel(component.cost_type)}</span><strong>{Number(component.unknown_cost_count) > 0 ? 'Not recorded' : formatCurrency(component.known_direct_cost)}</strong></p>)}{paidContext && !unknown && financials.chargeKnown && <p className="service-detail-item__profit"><span>Paid Service Gross Profit</span><strong>{formatCurrency(revenue - Number(context.known_direct_cost))}</strong></p>}{paidContext && unknown && <p className="form-help">Paid Service Gross Profit is unavailable while a Paid Service cost is unknown.</p>}</article>
  })}<div className="service-financial-detail"><p><span>Known Direct Cost</span><strong>{formatCurrency(knownCost)}</strong></p></div>{hasUnknownCost && <p className="form-help">Some direct costs are unknown, so profitability is incomplete.</p>}</section>
}

function amendmentItem(item) {
  return { ...item, action: 'update', standard_price: item.standard_price ?? '', actual_customer_price: item.actual_customer_price ?? 0, internal_cost: item.internal_cost ?? '', description: item.description || '', notes: item.notes || '' }
}
const blankAmendmentItem = () => ({ local_id: crypto.randomUUID(), action: 'add', part_id: '', item_type: 'Repair', description: '', quantity: 1, standard_price: '', actual_customer_price: 0, internal_cost: '', coverage_type: 'Paid', equipment_warranty_id: '', amc_cycle_id: '', service_item_warranty_id: '', updates_equipment_component: false, issue_new_part_warranty: false, notes: '' })

function ChangeRows({ changes }) {
  return <dl className="service-change-list">{changes.map(([label, before, after]) => <div key={label}><dt>{label}</dt><dd><span>Before</span><p>{before || 'Not set'}</p><span>After</span><p>{after || 'Not set'}</p></dd></div>)}</dl>
}

function workItemCostContext(item) {
  if (item.coverage_type === 'Paid') return { key: 'paid', label: 'Paid Service' }
  if (item.coverage_type === 'AMC') return { key: `amc:${item.amc_cycle_id || 'unknown'}`, label: item.amc_cycles?.amc_code || 'AMC' }
  if (item.coverage_type === 'Equipment Warranty') return { key: `warranty:${item.equipment_warranty_id || 'unknown'}`, label: item.equipment_warranties?.warranty_code || 'Equipment Warranty' }
  if (item.coverage_type === 'Part Warranty') return { key: `part-warranty:${item.service_item_warranty_id || 'unknown'}`, label: item.service_item_warranties?.part_warranty_code || 'Part Warranty' }
  if (item.coverage_type === 'Complimentary') return { key: 'complimentary', label: 'Complimentary / Goodwill' }
  return { key: 'unallocated', label: 'Unallocated' }
}

function WorkItemCostSummary({ items }) {
  const groups = new Map()
  items.filter((item) => item.action !== 'remove').forEach((item) => {
    const context = workItemCostContext(item)
    const group = groups.get(context.key) || { ...context, known: 0, unknown: 0 }
    if (item.internal_cost === '' || item.internal_cost === null || item.internal_cost === undefined) group.unknown += 1
    else group.known += Number(item.internal_cost) * Number(item.quantity || 0)
    groups.set(context.key, group)
  })
  const values = [...groups.values()]
  return <section className="service-work-item-cost-summary"><div><h4>Work-item costs</h4><p className="form-help">Item costs are shown separately from technician, travel and other Service-level costs. A blank item cost remains unknown; ₹0 is a known zero.</p></div>{values.length ? <div className="service-work-item-cost-summary__groups">{values.map((group) => <p key={group.key}><span>{group.label}</span><strong>{formatCurrency(group.known)}</strong><small>{group.unknown ? `${group.unknown} item cost${group.unknown === 1 ? '' : 's'} not recorded` : 'All item costs recorded'}</small></p>)}</div> : <p className="form-help">No work items are currently included.</p>}<p className="service-work-item-cost-summary__total"><span>Total known work-item cost</span><strong>{formatCurrency(values.reduce((total, group) => total + group.known, 0))}</strong></p></section>
}

function InternalCostSummary({ items, values, allocations }) {
  const totals = { paid: 0, amc: 0, unallocated: 0 }
  const bucketFor = (item) => item?.coverage_type === 'Paid' ? 'paid' : item?.coverage_type === 'AMC' ? 'amc' : 'unallocated'
  items.filter((item) => item.action !== 'remove').forEach((item) => {
    if (item.internal_cost !== '' && item.internal_cost !== null && item.internal_cost !== undefined) totals[bucketFor(item)] += Number(item.internal_cost) * Number(item.quantity || 0)
  })
  let allocated = 0
  allocations.forEach((allocation) => {
    const amount = Number(allocation.amount || 0)
    const source = items.find((item) => item.id === allocation.source_service_item_id)
    totals[bucketFor(source)] += amount
    allocated += amount
  })
  const sharedTotal = Number(values.technician_charge || 0) + Number(values.travel_cost || 0) + Number(values.other_direct_cost || 0)
  totals.unallocated += Math.max(0, sharedTotal - allocated)
  return <div className="service-internal-cost-summary"><p><span>Known Direct Cost</span><strong>{formatCurrency(totals.paid + totals.amc + totals.unallocated)}</strong></p><p><span>Paid Service Cost</span><strong>{formatCurrency(totals.paid)}</strong></p><p><span>AMC Cost Incurred</span><strong>{formatCurrency(totals.amc)}</strong></p><p><span>Unallocated</span><strong>{formatCurrency(totals.unallocated)}</strong></p></div>
}

function ServiceCorrectionForm({ service, lookups, saving, onSave, onClose, onStructuralSaved, structuralCorrectionSaved }) {
  const v2 = service.financial_model_version === 2
  const defaults = {
    service_date: service.service_date, technician_id: service.technician_id || '', issue_reported: service.issue_reported || '', diagnosis: service.diagnosis || '', work_performed: service.work_performed || '',
    tds_in: service.tds_in ?? '', tds_out: service.tds_out ?? '', next_service_due: service.next_service_due || '', notes: service.notes || '',
    final_customer_charge: service.final_customer_charge ?? '', technician_charge: service.technician_charge ?? 0, travel_cost: service.travel_cost ?? 0,
    other_direct_cost: service.other_direct_cost ?? 0, other_direct_cost_note: service.other_direct_cost_note || '', customer_charge_note: service.customer_charge_note || '', correction_note: '',
  }
  const { register, handleSubmit, watch } = useForm({ defaultValues: defaults })
  const [items, setItems] = useState(() => service.service_items.map(amendmentItem))
  const [step, setStep] = useState(1)
  const [sharedCostAllocations, setSharedCostAllocations] = useState(() => (service.service_cost_allocations || []).map((allocation) => ({ cost_type: allocation.cost_type, amount: allocation.amount, source_service_item_id: allocation.source_service_item_id })))
  const [error, setError] = useState('')
  const [structuralItemId, setStructuralItemId] = useState(null)
  const [structuralMessage, setStructuralMessage] = useState('')
  const submitting = useRef(false)
  const values = watch()
  const serviceDate = watch('service_date')
  const coverage = useEquipmentCoverage(service.equipment_id, serviceDate)
  const parts = lookups.parts || []
  const physicalIds = new Set([...(service.components || []).map((row) => row.source_service_item_id), ...(service.newPartWarranties || []).map((row) => row.service_item_id)])
  const financials = calculateServiceFinancials({ financial_model_version: service.financial_model_version, service_items: items.filter((item) => item.action !== 'remove'), final_customer_charge: values.final_customer_charge, technician_charge: values.technician_charge, travel_cost: values.travel_cost, other_direct_cost: values.other_direct_cost, service_payments: service.service_payments })
  const commercialContext = serviceCommercialContext({ ...service, service_items: items.filter((item) => item.action !== 'remove') })
  const updateItem = (key, patch) => setItems((current) => current.map((item) => (item.id || item.local_id) === key ? { ...item, ...patch } : item))
  const removeItem = (key) => setItems((current) => current.map((item) => (item.id || item.local_id) === key ? (item.id ? { ...item, action: 'remove' } : null) : item).filter(Boolean))
  const restoreItem = (key) => updateItem(key, { action: 'update' })
  const technicianName = (id) => (lookups.technicians || []).find((technician) => technician.id === id)?.name || 'Not assigned'
  const changedFields = [
    ['Service Date', defaults.service_date, values.service_date],
    ['Technician', technicianName(defaults.technician_id), technicianName(values.technician_id)],
    ['Issue Reported', defaults.issue_reported, values.issue_reported],
    ['Diagnosis', defaults.diagnosis, values.diagnosis],
    ['Work Performed', defaults.work_performed, values.work_performed],
    ['TDS In', String(defaults.tds_in), String(values.tds_in)],
    ['TDS Out', String(defaults.tds_out), String(values.tds_out)],
    ['Recommended Next Service', defaults.next_service_due, values.next_service_due],
    ['Notes', defaults.notes, values.notes],
    ...(v2 ? [['Final Customer Charge', String(defaults.final_customer_charge), String(values.final_customer_charge)], ['Technician Cost', String(defaults.technician_charge), String(values.technician_charge)], ['Travel Cost', String(defaults.travel_cost), String(values.travel_cost)], ['Other Direct Cost', String(defaults.other_direct_cost), String(values.other_direct_cost)]] : []),
  ].filter(([, before, after]) => String(before ?? '') !== String(after ?? ''))
  const itemChanges = items.map((item) => {
    const name = item.parts?.name || service.service_items.find((source) => source.id === item.id)?.parts?.name || 'No part'
    if (item.action === 'add') return { key: item.local_id, name, action: 'Added', changes: [] }
    if (item.action === 'remove') return { key: item.id, name, action: 'Removed', changes: [] }
    const before = service.service_items.find((source) => source.id === item.id)
    if (!before) return null
    const changes = [['Description', before.description || '', item.description || ''], ['Item Notes', before.notes || '', item.notes || ''], ['Usual Price', String(before.standard_price ?? ''), String(item.standard_price ?? '')], ['Internal Cost', String(before.internal_cost ?? ''), String(item.internal_cost ?? '')], ...(!v2 ? [['Legacy Customer Price', String(before.actual_customer_price ?? ''), String(item.actual_customer_price ?? '')]] : [])]
      .filter(([, beforeValue, afterValue]) => beforeValue !== afterValue)
    return changes.length ? { key: item.id, name, changes } : null
  }).filter(Boolean)
  const structuralItem = service.service_items.find((item) => item.id === structuralItemId)
  async function submit(values) {
    if (step !== 4 || submitting.current || saving) return
    if (!String(values.correction_note || '').trim()) { setError('Enter a correction reason before saving.'); return }
    setError('')
    submitting.current = true
    try { await onSave({ values, items, sharedCostAllocations }) } catch (err) { submitting.current = false; setError(err?.message || 'The Service correction could not be saved.') }
  }

  if (structuralItem) return <div className="service-wizard service-correction-workflow"><ol className="service-wizard__steps"><li className="active">2. Work & coverage</li><li>3. Costs</li><li>4. Review changes</li></ol><StructuralServiceItemCorrection service={service} item={structuralItem} parts={parts} coverage={coverage.data || { warranties: [], amcCycles: [] }} allocations={service.service_cost_allocations || []} onBack={() => { setStructuralItemId(null); setStructuralMessage('') }} onSaved={(message) => { setStructuralItemId(null); setStructuralMessage(message || ''); onStructuralSaved?.() }} /></div>

  return <div className="service-wizard service-correction-workflow">
    <ol className="service-wizard__steps"><li className={step >= 1 ? 'active' : ''}>1. Service details</li><li className={step >= 2 ? 'active' : ''}>2. Work & coverage</li><li className={step >= 3 ? 'active' : ''}>3. Costs</li><li className={step >= 4 ? 'active' : ''}>4. Review changes</li></ol>
    <p className="form-help">Customer, equipment, Service type, status, coverage and relocation history are protected. Saving creates an audited amendment; it does not directly overwrite Service history.</p>
    {structuralMessage && <p className="form-message" role="status">{structuralMessage}</p>}
    {error && <p className="form-message" role="alert">{error}</p>}
    {step === 1 && <section className="service-wizard__panel"><h3>Service details</h3><div className="service-form-grid"><label>Service Date<input type="date" {...register('service_date', { required: true })} /></label><label>Technician<select {...register('technician_id')}><option value="">Not assigned</option>{(lookups.technicians || []).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label><label>Issue Reported<textarea {...register('issue_reported')} /></label><label>Diagnosis<textarea {...register('diagnosis')} /></label><label>Work Performed<textarea {...register('work_performed')} /></label><label>TDS In<input type="number" min="0" step="0.01" {...register('tds_in')} /></label><label>TDS Out<input type="number" min="0" step="0.01" {...register('tds_out')} /></label><label>Recommended Next Service<input type="date" {...register('next_service_due')} /><small>Suggested service reminder, not a booked appointment.</small></label><label className="service-form-grid__full">Service Notes<textarea {...register('notes')} /></label></div></section>}
    {step === 2 && <section className="service-wizard__panel"><h3>Recorded work details</h3><p className="form-help">If the recorded work type, part, quantity or coverage is wrong, change it here. Save that correction separately from ordinary Service edits.</p>{service.service_items.map((item) => <RecordedWorkDetails item={item} key={item.id} onChange={() => setStructuralItemId(item.id)} />)}</section>}
    {step === 2 && <section className="service-wizard__panel"><h3>Work items & coverage</h3><p className="form-help">Existing physical identity remains protected. Add only omitted work; safe ordinary items can be marked for removal.</p>{items.map((item, index) => item.action === 'add' ? <ServiceItemEditor key={item.local_id} item={item} index={index} parts={parts} equipmentId={service.equipment_id} serviceDate={serviceDate} status={service.status} coverage={coverage.data || { warranties: [], amcCycles: [] }} onChange={(next) => updateItem(item.local_id, { ...next, action: 'add' })} onRemove={() => removeItem(item.local_id)} /> : <section className="service-detail-item" key={item.id}><div className="service-item-editor__top"><strong>{item.parts?.name || item.item_type} × {item.quantity}</strong>{item.action === 'remove' ? <Button type="button" variant="secondary" onClick={() => restoreItem(item.id)}>Keep item</Button> : <button className="text-button" type="button" disabled={physicalIds.has(item.id)} title={physicalIds.has(item.id) ? 'Physical items with component or warranty history cannot be removed.' : undefined} onClick={() => removeItem(item.id)}><Trash2 size={15} />Remove</button>}</div>{item.action === 'remove' ? <p className="form-help">This ordinary item is queued for audited removal.</p> : <><p className="form-help">{physicalIds.has(item.id) ? 'Component or warranty history exists: part, quantity, replacement identity and coverage are locked.' : 'Part identity, quantity and coverage remain locked; permitted description, note and economic corrections are available.'}</p><div className="service-form-grid"><label>Description<textarea value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} /></label><label>Item Notes<textarea value={item.notes} onChange={(event) => updateItem(item.id, { notes: event.target.value })} /></label><label>Usual / Reference Price<input type="number" min="0" step="0.01" value={item.standard_price} onChange={(event) => updateItem(item.id, { standard_price: event.target.value })} /></label>{!v2 && <label>Legacy Customer Price<input type="number" min="0" step="0.01" value={item.actual_customer_price} onChange={(event) => updateItem(item.id, { actual_customer_price: event.target.value })} /></label>}<label>Internal / Item Cost<input type="number" min="0" step="0.01" value={item.internal_cost} onChange={(event) => updateItem(item.id, { internal_cost: event.target.value })} /></label></div></>}</section>)}<Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, blankAmendmentItem()])}><Plus size={16} />Add forgotten work item</Button></section>}
    {step === 3 && <section className="service-wizard__panel"><h3>Costs and financials</h3><WorkItemCostSummary items={items} /><div className="service-shared-costs"><h4>Customer charge and shared visit costs</h4><p className="form-help">Technician, travel and other direct costs are entered once for this Service. Their deliberate allocation is shown separately below.</p></div>{v2 ? <div className="service-form-grid"><label>Final Customer Charge<input type="number" min="0" step="0.01" {...register('final_customer_charge')} /></label><label>Technician Cost<input type="number" min="0" step="0.01" {...register('technician_charge')} /></label><label>Travel / Petrol Cost<input type="number" min="0" step="0.01" {...register('travel_cost')} /></label><label>Other Direct Cost<input type="number" min="0" step="0.01" {...register('other_direct_cost')} /></label><label>Other Direct Cost Note<textarea {...register('other_direct_cost_note')} /></label><label>Customer Charge Note<textarea {...register('customer_charge_note')} /></label></div> : <p className="form-help">This historical V1 Service keeps its legacy item-level customer-price semantics.</p>}<FinancialDetails financials={financials} context={commercialContext} /><SharedCostAllocationEditor items={items.filter((item) => item.action !== 'remove' && item.id)} totals={{ technician: values.technician_charge, travel: values.travel_cost, other: values.other_direct_cost }} allocations={sharedCostAllocations} onChange={setSharedCostAllocations} sourceMode="id" /></section>}
    {step === 4 && <section className="service-wizard__panel"><form id="service-correction-confirmation" onSubmit={handleSubmit(submit)}><h3>Review changes</h3><p className="form-help">Nothing is saved by reaching this step. Check the changes, provide a reason, then explicitly save the audited correction.</p><div className="service-review"><section><h3>Protected identity</h3><p><strong>{service.service_code}</strong> · {service.equipment?.equipment_code} · {service.equipment?.customers?.name || 'Customer not recorded'}</p><p>{service.service_types?.name || 'Service type not recorded'} · {service.status}</p></section><section><h3>Before → After</h3>{structuralCorrectionSaved && <p className="form-help"><strong>Recorded work details were corrected and saved separately.</strong></p>}{changedFields.length || itemChanges.length ? <div className="service-change-groups">{changedFields.length ? <article><h4>Service details</h4><ChangeRows changes={changedFields} /></article> : null}{itemChanges.map((change) => <article key={change.key}><h4>Work item — {change.name}</h4>{change.action ? <p><strong>{change.action}</strong> work item.</p> : <ChangeRows changes={change.changes} />}</article>)}</div> : <p>{structuralCorrectionSaved ? 'No additional Service changes are pending.' : 'No material changes detected.'}</p>}</section><section><h3>Corrected financial context</h3><FinancialDetails financials={financials} context={commercialContext} /><InternalCostSummary items={items} values={values} allocations={sharedCostAllocations} /></section>{sharedCostAllocations.length > 0 && <section><h3>Shared-cost allocation</h3><p className="form-help">These are the deliberate shared-cost allocation decisions for this correction.</p><ul>{sharedCostAllocations.map((allocation, index) => { const source = items.find((item) => item.id === allocation.source_service_item_id); return <li key={`${allocation.cost_type}-${allocation.source_service_item_id}-${index}`}><strong>{allocation.cost_type}</strong>: {formatCurrency(allocation.amount)} → {source?.coverage_type === 'Paid' ? 'Paid Service' : source?.coverage_type === 'AMC' ? source?.amc_cycles?.amc_code || 'AMC' : source?.parts?.name || 'No part'}</li> })}</ul></section>}</div><label>Correction Reason<textarea placeholder="Why is this correction needed?" {...register('correction_note')} /></label></form></section>}
    <div className="service-wizard__actions">{step > 1 && <Button type="button" variant="secondary" onClick={() => setStep((value) => value - 1)}>Back</Button>}{step < 4 && <Button type="button" onClick={() => setStep((value) => value + 1)}>Continue</Button>}{step === 4 && <Button type="submit" form="service-correction-confirmation" disabled={saving || submitting.current}>{saving || submitting.current ? 'Saving correction…' : 'Save Correction'}</Button>}<Button type="button" variant="secondary" onClick={onClose}>Cancel</Button></div>
  </div>
}

export function ServiceDetailPage() {
  const { serviceId } = useParams()
  const query = useService(serviceId)
  const economics = useServiceEconomics(serviceId)
  const lookups = useServiceLookups()
  const payment = useAddServicePayment()
  const correction = useAmendService()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentAction, setPaymentAction] = useState(null)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [structuralCorrectionSaved, setStructuralCorrectionSaved] = useState(false)
  if (query.isLoading) return <div className="detail-loading">Loading service…</div>
  if (query.isError || !query.data) return <ErrorState title="Service could not be loaded" description="Please refresh and try again." />
  const service = query.data
  const financials = service.financials
  const v2 = financials.modelVersion === 2
  const commercialContext = serviceCommercialContext(service)
  const coverageSummary = serviceCoverageSummary(service)
  const relocationHistory = service.relocation_history?.[0]
  const isRelocation = Boolean(service.relocation_destination_location_id)
  const relocationFrom = relocationHistory?.old_location || service.equipment?.locations
  const relocationTo = relocationHistory?.new_location || service.relocation_destination_location
  const canRecordPayment = !['Cancelled', 'Void'].includes(service.status) && financials.chargeKnown
  const canCorrect = !['Cancelled', 'Void'].includes(service.status)
  const paymentUnavailable = ['Cancelled', 'Void'].includes(service.status) ? 'Payments are unavailable for cancelled or void services.' : 'Set Final Customer Charge before recording a payment.'

  return <div className="service-detail"><Link className="back-link" to="/service"><ArrowLeft size={17} />Service</Link><header className="customer-detail__header"><div><span className="eyebrow">Service</span><h2>{service.service_code}</h2><p>{formatDate(service.service_date)} · {service.equipment?.equipment_code} · {service.equipment?.customers?.name || 'Customer not recorded'}</p></div><div className="customer-detail__actions"><Badge tone={serviceStatusTone(service.status)}>{service.status}</Badge>{canCorrect && <Button onClick={() => setCorrectionOpen(true)}><Pencil size={16} />Edit / Correct Service</Button>}</div></header><div className="sale-summary"><div><span>{v2 ? 'Final Customer Charge' : 'Service value'}</span><strong>{money(service.totals.total)}</strong></div><div><span>Amount Received</span><strong>{formatCurrency(service.totals.collected)}</strong></div><div><span>Amount Due</span><strong>{money(service.totals.outstanding)}</strong></div></div>{v2 && <FinancialDetails financials={financials} context={commercialContext} />}<CostBreakdown economics={economics} financials={financials} service={service} /><section className="card"><h2>Overview</h2><div className="service-detail-grid"><p><strong>Equipment</strong><Link className="table-view-link" to={`/equipment/${service.equipment_id}`}>{service.equipment?.equipment_code}</Link></p><p><strong>Customer</strong><Link className="table-view-link" to={`/customers/${service.equipment?.customer_id}`}>{service.equipment?.customers?.name || 'Not recorded'}</Link></p><p><strong>Service type</strong>{service.service_types?.name || 'Not recorded'}</p><p><strong>Technician</strong>{service.technicians?.name || 'Not assigned'}</p><p><strong>Coverage</strong><span>{coverageSummary.label}</span>{coverageSummary.contexts.length > 1 && <small>{coverageSummary.contexts.join(' · ')}</small>}</p>{isRelocation && <><p><strong>From Location</strong>{locationLabel(relocationFrom)}</p><p><strong>To Location</strong>{locationLabel(relocationTo)}</p></>}<p><strong>Recommended Next Service</strong>{formatDate(service.next_service_due)}<small>Suggested 4 months after the Service Date; editable, not a booked appointment.</small></p></div><p><strong>Issue reported:</strong> {service.issue_reported || 'Not recorded'}</p><p><strong>Diagnosis:</strong> {service.diagnosis || 'Not recorded'}</p><p><strong>Work performed:</strong> {service.work_performed || 'Not recorded'}</p><p><strong>TDS:</strong> {service.tds_in ?? '—'} in · {service.tds_out ?? '—'} out · Technician Cost {formatCurrency(service.technician_charge)}</p><p>{service.notes || 'No notes recorded.'}</p></section><section className="card"><h2>Work items</h2>{service.service_items.length ? service.service_items.map((item) => { const lineValue = v2 ? Number(item.standard_price) * Number(item.quantity) : Number(item.actual_customer_price) * Number(item.quantity); return <article className="service-detail-item" key={item.id}><div><strong>{item.parts?.name || item.item_type} × {item.quantity}</strong><span>{item.item_type}</span><Badge tone="neutral">{itemCoverageContext(item).label}</Badge></div><div><strong>{formatCurrency(lineValue)}</strong><small>{v2 ? `Usual ${formatCurrency(item.standard_price)} · Item Cost ${formatCurrency(item.internal_cost)}` : `Customer price ${formatCurrency(item.actual_customer_price)} · Standard ${formatCurrency(item.standard_price)} · Cost ${formatCurrency(item.internal_cost)}`}</small></div>{item.description && <p>{item.description}</p>}{item.notes && <small>Notes: {item.notes}</small>}{!item.description && !item.notes && <p>No line notes.</p>}{item.updates_equipment_component && <small>Updates equipment component history</small>}{item.claimed_part_warranty && <small>Part-warranty claim: {item.claimed_part_warranty.part_warranty_code}{item.claimed_part_warranty.source_service_item?.services?.service_code ? ` · Source service ${item.claimed_part_warranty.source_service_item.services.service_code}` : ''}</small>}{item.service_item_warranties?.replaced_warranty_id && <small>Part-warranty claim processed</small>}</article> }) : <p>No work items were recorded for this service.</p>}</section><section className="card"><h2>Recorded effects</h2>{service.components.length || service.newPartWarranties.length ? <div className="service-effects">{service.components.map((component) => <p key={component.id}>Component history: {component.component_roles?.name || 'Component'} → {component.parts?.name || 'Part'} installed {formatDate(component.installed_date)}</p>)}{service.newPartWarranties.map((warranty) => <p key={warranty.id}>New part warranty: {warranty.part_warranty_code} · {warranty.parts?.name} · through {formatDate(warranty.end_date)}</p>)}</div> : <p>No component or new part-warranty effect was created.</p>}</section><section className="card"><div className="section-heading"><h2>Payments</h2>{canRecordPayment && <Button onClick={() => setPaymentOpen(true)}><Plus size={16} />Record payment</Button>}</div>{!canRecordPayment && <p>{paymentUnavailable}</p>}{service.service_payments.length ? service.service_payments.map((entry) => <div className="payment-history-row" key={entry.id}><p>{formatDate(entry.payment_date)} · {formatCurrency(entry.amount)} · {entry.payment_methods?.name} {entry.reference_number ? `· ${entry.reference_number}` : ''} <Badge tone={entry.payment_status === 'Valid' ? 'success' : 'muted'}>{entry.payment_status ?? 'Valid'}</Badge></p>{entry.void_reason && <small>Reason: {entry.void_reason}</small>}{entry.corrected_by_payment?.payment_code && <small>Replacement: {entry.corrected_by_payment.payment_code}</small>}{entry.correction_of_payment?.payment_code && <small>Correction of {entry.correction_of_payment.payment_code}</small>}{(entry.payment_status ?? 'Valid') === 'Valid' && <div className="payment-history-row__actions"><Button variant="secondary" onClick={() => setPaymentAction({ mode: 'void', payment: entry })}>Void Payment</Button><Button variant="secondary" onClick={() => setPaymentAction({ mode: 'correct', payment: entry })}>Correct Payment</Button></div>}</div>) : <p>No payments recorded yet.</p>}</section>{service.service_corrections?.length ? <section className="card"><h2>Correction History</h2>{service.service_corrections.map((entry) => <p key={entry.id}>{formatDate(entry.corrected_at)} · {entry.correction_note}</p>)}</section> : null}{paymentOpen && <Modal title="Record service payment" onClose={() => setPaymentOpen(false)}><PaymentForm methods={lookups.data?.paymentMethods ?? []} saving={payment.isPending} onSave={async (values) => { await payment.mutateAsync({ serviceId, values }); setPaymentOpen(false) }} /></Modal>}{correctionOpen && <Modal title="Edit / Correct Service" onClose={() => { setCorrectionOpen(false); setStructuralCorrectionSaved(false) }}><ServiceCorrectionForm key={`${service.id}:${service.service_items.map((item) => [item.id, item.item_type, item.part_id, item.quantity, item.coverage_type, item.equipment_warranty_id, item.amc_cycle_id, item.service_item_warranty_id].join(':')).join('|')}:${(service.service_cost_allocations || []).map((allocation) => [allocation.cost_type, allocation.amount, allocation.source_service_item_id].join(':')).join('|')}`} service={service} lookups={lookups.data ?? {}} saving={correction.isPending} structuralCorrectionSaved={structuralCorrectionSaved} onStructuralSaved={() => setStructuralCorrectionSaved(true)} onClose={() => { setCorrectionOpen(false); setStructuralCorrectionSaved(false) }} onSave={async ({ values, items, sharedCostAllocations }) => { await correction.mutateAsync({ serviceId, values: { ...values, items, sharedCostAllocations } }); setCorrectionOpen(false); setStructuralCorrectionSaved(false) }} /></Modal>}{paymentAction && <Modal title={paymentAction.mode === 'void' ? 'Void payment' : 'Correct payment'} onClose={() => setPaymentAction(null)}><PaymentCorrectionForm mode={paymentAction.mode} paymentTable="service_payments" payment={paymentAction.payment} methods={lookups.data?.paymentMethods ?? []} onSaved={() => { query.refetch(); setPaymentAction(null) }} /></Modal>}</div>
}

