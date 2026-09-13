import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { SharedCostAllocationEditor } from './SharedCostAllocationEditor'
import { useAmendServiceItemStructurally, usePartWarranties } from '../hooks/useService'
import { coverageLabel, formatCurrency, formatDate } from '../utils/serviceDisplay'

const itemTypes = ['Replacement', 'Repair', 'Maintenance', 'Labour / Work', 'Other']
const coverageTypes = ['Paid', 'AMC', 'Equipment Warranty', 'Part Warranty', 'Complimentary', 'Other']
const number = (value) => value === '' || value === null || value === undefined ? 0 : Number(value)

function readableError(error) {
  const message = error?.message?.toLowerCase() || ''
  if (message.includes('later component') || message.includes('component chronology')) return 'This recorded replacement has later component history, so it cannot be changed here.'
  if (message.includes('later warranty')) return 'This recorded replacement has later warranty history, so it cannot be changed here.'
  if (message.includes('part warranty coverage')) return 'Choose an active matching part warranty for this completed one-unit replacement.'
  if (message.includes('equipment warranty coverage')) return 'Choose an active equipment warranty that covered this equipment on the Service date.'
  if (message.includes('amc coverage')) return 'Choose an active AMC cycle that covered this equipment on the Service date.'
  if (message.includes('shared-cost allocation')) return 'Review the shared-cost allocation before saving these recorded details.'
  if (message.includes('valid payments exceed')) return 'This change would make the recorded payment larger than the Service charge, so it cannot be saved.'
  if (message.includes('quantity')) return 'A component-changing replacement must have a quantity of one.'
  if (message.includes('correction reason')) return 'Enter a correction reason before saving.'
  return 'The recorded work details could not be changed. Please review the information and try again.'
}

function partName(item) { return item.parts?.name || item.description || 'No part' }
function referenceLabel(item) {
  if (item.coverage_type === 'AMC') return item.amc_cycles?.amc_code || 'AMC not recorded'
  if (item.coverage_type === 'Equipment Warranty') return item.equipment_warranties?.warranty_code || 'Equipment warranty not recorded'
  if (item.coverage_type === 'Part Warranty') return item.service_item_warranties?.part_warranty_code || 'Part warranty not recorded'
  return item.coverage_type
}
function changesFor(before, draft, parts, coverage, partWarranties) {
  const selectedPart = parts.find((part) => part.id === draft.part_id)
  const afterCoverage = draft.coverage_type === 'AMC'
    ? coverage.amcCycles.find((cycle) => cycle.id === draft.amc_cycle_id)?.amc_code || 'AMC not selected'
    : draft.coverage_type === 'Equipment Warranty'
      ? coverage.warranties.find((warranty) => warranty.id === draft.equipment_warranty_id)?.warranty_code || 'Equipment warranty not selected'
      : draft.coverage_type === 'Part Warranty'
        ? partWarranties.find((warranty) => warranty.id === draft.service_item_warranty_id)?.part_warranty_code || 'Part warranty not selected'
        : draft.coverage_type
  return [['Item Type', before.item_type, draft.item_type], ['Part', partName(before), selectedPart?.name || 'No part'], ['Quantity', String(before.quantity), String(draft.quantity)], ['Coverage', referenceLabel(before), afterCoverage]]
    .filter(([, beforeValue, afterValue]) => String(beforeValue) !== String(afterValue))
}

export function RecordedWorkDetails({ item, onChange }) {
  return <div className="recorded-work-details"><div><span>Recorded work details</span><strong>{item.item_type} · {partName(item)} · Qty {item.quantity} · {coverageLabel(item)}</strong></div><Button type="button" variant="secondary" onClick={onChange}>Change recorded details</Button></div>
}

export function StructuralServiceItemCorrection({ service, item, parts, coverage, allocations, onCancel }) {
  const mutation = useAmendServiceItemStructurally()
  const saving = mutation.isPending
  const onSave = (values) => mutation.mutateAsync({ serviceId: service.id, values })
  const sourceWarranty = (service.newPartWarranties || []).some((warranty) => warranty.service_item_id === item.id)
  const [draft, setDraft] = useState(() => ({ item_type: item.item_type, part_id: item.part_id || '', quantity: item.quantity, coverage_type: item.coverage_type, equipment_warranty_id: item.equipment_warranty_id || '', amc_cycle_id: item.amc_cycle_id || '', service_item_warranty_id: item.service_item_warranty_id || '', part_warranty_requested: sourceWarranty }))
  const [sharedCostAllocations, setSharedCostAllocations] = useState(() => allocations.map((entry) => ({ cost_type: entry.cost_type, amount: entry.amount, source_service_item_id: entry.source_service_item_id })))
  const [reason, setReason] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const selectedPart = parts.find((part) => part.id === draft.part_id)
  const partWarranties = usePartWarranties(service.equipment_id, draft.part_id, service.service_date)
  const isReplacement = draft.item_type === 'Replacement'
  const partVisible = isReplacement || draft.item_type === 'Repair' || draft.item_type === 'Maintenance'
  const trackedReplacement = isReplacement && selectedPart?.equipment_tracking_enabled
  const partWarrantyAvailable = isReplacement && service.status === 'Completed' && Number(draft.quantity) === 1 && selectedPart?.part_warranty_eligible
  const allocationItems = useMemo(() => service.service_items.map((source) => source.id === item.id ? { ...source, ...draft, parts: selectedPart || source.parts } : source), [draft, item.id, selectedPart, service.service_items])
  const contexts = new Set(allocationItems.filter((source) => source.coverage_type !== 'Other').map((source) => `${source.coverage_type}:${source.amc_cycle_id || source.equipment_warranty_id || source.service_item_warranty_id || ''}`))
  const showAllocations = contexts.size > 1 && number(service.technician_charge) + number(service.travel_cost) + number(service.other_direct_cost) > 0
  const change = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const selectType = (item_type) => {
    if (item_type === 'Labour / Work' || item_type === 'Other') return change({ item_type, part_id: '', service_item_warranty_id: '', part_warranty_requested: false })
    change({ item_type, part_warranty_requested: item_type === 'Replacement' ? draft.part_warranty_requested : false })
  }
  const selectPart = (part_id) => {
    const nextPart = parts.find((part) => part.id === part_id)
    change({ part_id, quantity: draft.item_type === 'Replacement' && nextPart?.equipment_tracking_enabled ? 1 : draft.quantity, service_item_warranty_id: '', part_warranty_requested: false })
  }
  const selectCoverage = (coverage_type) => change({ coverage_type, equipment_warranty_id: coverage_type === 'Equipment Warranty' ? coverage.warranties[0]?.id || '' : '', amc_cycle_id: coverage_type === 'AMC' ? coverage.amcCycles[0]?.id || '' : '', service_item_warranty_id: '', part_warranty_requested: coverage_type === 'Paid' ? draft.part_warranty_requested : false })
  const changes = changesFor(item, draft, parts, coverage, partWarranties.data || [])
  const submit = async () => {
    if (!reason.trim()) return setError('Enter a correction reason before saving.')
    if (!changes.length) return setError('Change at least one recorded work detail before saving.')
    setError('')
    try { await onSave({ itemId: item.id, itemType: draft.item_type, partId: draft.part_id || null, quantity: Number(draft.quantity), coverageType: draft.coverage_type, equipmentWarrantyId: draft.coverage_type === 'Equipment Warranty' ? draft.equipment_warranty_id || null : null, amcCycleId: draft.coverage_type === 'AMC' ? draft.amc_cycle_id || null : null, serviceItemWarrantyId: draft.coverage_type === 'Part Warranty' ? draft.service_item_warranty_id || null : null, partWarrantyRequested: partWarrantyAvailable && draft.coverage_type === 'Paid' ? Boolean(draft.part_warranty_requested) : false, sharedCostAllocations: showAllocations ? sharedCostAllocations : null, correctionReason: reason.trim() }); onCancel('Recorded work details updated.') } catch (submitError) { setError(readableError(submitError)) }
  }
  return <section className="structural-correction" aria-live="polite"><div className="structural-correction__heading"><div><span>Recorded work details</span><h4>{partName(item)}</h4></div><Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Back to Service correction</Button></div><p className="form-help">Save this recorded-details correction first. Other Service details can be corrected separately.</p>{error && <p className="form-message" role="alert">{error}</p>}{reviewing ? <div className="structural-correction__review"><h3>Review recorded details</h3><p className="form-help">Only the changed recorded work details below will be saved in this correction.</p>{changes.length ? <dl className="service-change-list">{changes.map(([label, before, after]) => <div key={label}><dt>{label}</dt><dd><span>Before</span><p>{before}</p><span>After</span><p>{after}</p></dd></div>)}</dl> : <p>No recorded work details have changed.</p>}{showAllocations && <section><h4>Shared cost allocation</h4><p className="form-help">The deliberate allocation below will replace the current allocation for this Service.</p><ul>{sharedCostAllocations.map((allocation, index) => { const target = allocationItems.find((source) => source.id === allocation.source_service_item_id); return <li key={`${allocation.cost_type}-${allocation.source_service_item_id}-${index}`}>{allocation.cost_type}: {formatCurrency(allocation.amount)} → {partName(target || {})}</li> })}</ul></section>}<label>Correction Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are these recorded details being corrected?" /></label><div className="service-wizard__actions"><Button type="button" variant="secondary" onClick={() => setReviewing(false)} disabled={saving}>Back</Button><Button type="button" onClick={submit} disabled={saving}>{saving ? 'Saving correction…' : 'Save recorded-details correction'}</Button></div></div> : <><div className="service-form-grid"><label>Item Type<select value={draft.item_type} onChange={(event) => selectType(event.target.value)}>{itemTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{partVisible && <label>Part {isReplacement ? '' : '(if applicable)'}<select value={draft.part_id} onChange={(event) => selectPart(event.target.value)}><option value="">No part</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.name} ({part.part_code})</option>)}</select></label>}<label>Quantity<input type="number" min="1" step="1" value={draft.quantity} disabled={trackedReplacement} onChange={(event) => change({ quantity: Math.max(1, Number(event.target.value) || 1), part_warranty_requested: false })} /></label><label>Coverage<select value={draft.coverage_type} onChange={(event) => selectCoverage(event.target.value)}>{coverageTypes.map((value) => <option key={value} value={value} disabled={(value === 'AMC' && !coverage.amcCycles.length) || (value === 'Equipment Warranty' && !coverage.warranties.length) || (value === 'Part Warranty' && !partWarrantyAvailable)}>{value}</option>)}</select></label>{draft.coverage_type === 'AMC' && <label>AMC cycle<select value={draft.amc_cycle_id} onChange={(event) => change({ amc_cycle_id: event.target.value })}><option value="">Choose active AMC</option>{coverage.amcCycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.amc_code} · cycle {cycle.cycle_number} · through {formatDate(cycle.end_date)}</option>)}</select></label>}{draft.coverage_type === 'Equipment Warranty' && <label>Equipment Warranty<select value={draft.equipment_warranty_id} onChange={(event) => change({ equipment_warranty_id: event.target.value })}><option value="">Choose active Equipment Warranty</option>{coverage.warranties.map((warranty) => <option key={warranty.id} value={warranty.id}>{warranty.warranty_code} · through {formatDate(warranty.end_date)}</option>)}</select></label>}{draft.coverage_type === 'Part Warranty' && <label>Part Warranty<select value={draft.service_item_warranty_id} onChange={(event) => change({ service_item_warranty_id: event.target.value })}><option value="">Choose active Part Warranty</option>{(partWarranties.data || []).map((warranty) => <option key={warranty.id} value={warranty.id}>{warranty.part_warranty_code} · through {formatDate(warranty.end_date)}</option>)}</select></label>}</div>{trackedReplacement && <p className="form-help">This tracked replacement changes equipment history, so its quantity is fixed at one.</p>}{partWarrantyAvailable && draft.coverage_type === 'Paid' && <label className="service-check"><input type="checkbox" checked={draft.part_warranty_requested} onChange={(event) => change({ part_warranty_requested: event.target.checked })} />Issue part warranty for this replacement</label>}{showAllocations && <SharedCostAllocationEditor items={allocationItems} totals={{ technician: service.technician_charge, travel: service.travel_cost, other: service.other_direct_cost }} allocations={sharedCostAllocations} onChange={setSharedCostAllocations} sourceMode="id" />}<div className="service-wizard__actions"><Button type="button" onClick={() => setReviewing(true)}>Review recorded details</Button></div></>}</section>
}

