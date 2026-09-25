import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { componentLabel } from '../utils/equipmentDisplay'

export function CorrectRecordedComponentForm({ component, parts, onCancel, onSave, isSaving }) {
  const [partId, setPartId] = useState(component.part_id)
  const [installedDate, setInstalledDate] = useState(component.installed_date || '')
  const [notes, setNotes] = useState(component.notes || '')
  const [reason, setReason] = useState('')

  useEffect(() => {
    setPartId(component.part_id)
    setInstalledDate(component.installed_date || '')
    setNotes(component.notes || '')
    setReason('')
  }, [component])

  const roleParts = useMemo(() => parts.filter((part) => part.component_role_id === component.component_role_id), [parts, component.component_role_id])

  function submit(event) {
    event.preventDefault()
    if (!partId || !reason.trim()) return
    onSave({
      componentId: component.id,
      part_id: partId,
      installed_date: installedDate,
      notes,
      correction_reason: reason,
    })
  }

  return <form className="crm-form component-record-form" onSubmit={submit}>
    <p className="component-record-form__equipment"><strong>Component role</strong>{component.component_roles?.name || 'Tracked component'}</p>
    <p className="component-record-form__intro">Correct the CRM record only. This does not record a physical replacement, create a Service, or affect cost, payment, or warranty history.</p>
    <label>Recorded part<select value={partId} onChange={(event) => setPartId(event.target.value)} required><option value="">Select part</option>{roleParts.map((part) => <option key={part.id} value={part.id}>{componentLabel({ parts: part })}</option>)}</select><small>Only Parts in the same component role can be used here.</small></label>
    <label>Known original installation date<input type="date" value={installedDate} onChange={(event) => setInstalledDate(event.target.value)} /><small>Changes the believed physical installation date, not when this was recorded in the CRM.</small></label>
    <label>Observation note or source<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    <label>Correction reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} required placeholder="Explain what was wrong and how it was confirmed." /></label>
    <div className="form-actions"><Button variant="secondary" type="button" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" disabled={isSaving || !partId || !reason.trim()}>{isSaving ? 'Correcting…' : 'Correct recorded details'}</Button></div>
  </form>
}
