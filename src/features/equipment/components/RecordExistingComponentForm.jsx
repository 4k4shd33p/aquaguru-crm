import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { componentLabel } from '../utils/equipmentDisplay'

export function RecordExistingComponentForm({ equipment, parts, components, onCancel, onSave, isSaving }) {
  const [componentRoleId, setComponentRoleId] = useState('')
  const [partId, setPartId] = useState('')
  const [installedDate, setInstalledDate] = useState('')
  const [notes, setNotes] = useState('')

  const currentRoleIds = useMemo(() => new Set((components ?? []).filter((component) => !component.removed_date).map((component) => component.component_role_id)), [components])
  const roles = useMemo(() => {
    const seen = new Map()
    for (const part of parts) if (!seen.has(part.component_role_id)) seen.set(part.component_role_id, { id: part.component_role_id, name: part.component_roles?.name || 'Tracked component' })
    return [...seen.values()].filter((role) => !currentRoleIds.has(role.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [parts, currentRoleIds])
  const roleParts = parts.filter((part) => part.component_role_id === componentRoleId)

  useEffect(() => {
    if (componentRoleId && !roles.some((role) => role.id === componentRoleId)) {
      setComponentRoleId('')
      setPartId('')
    }
  }, [componentRoleId, roles])

  function chooseRole(value) {
    setComponentRoleId(value)
    setPartId('')
  }

  function submit(event) {
    event.preventDefault()
    if (!componentRoleId || !partId) return
    onSave({ component_role_id: componentRoleId, part_id: partId, installed_date: installedDate, notes })
  }

  return <form className="crm-form component-record-form" onSubmit={submit}>
    <p className="component-record-form__equipment"><strong>Equipment</strong>{equipment.equipment_code}</p>
    <p className="component-record-form__intro">Record a component already present on this equipment. This does not create a Service, replacement, or part warranty.</p>
    {!roles.length ? <p className="component-empty">All configured component roles already have a current component. Use a completed Service to replace one.</p> : <>
      <label>Component role<select value={componentRoleId} onChange={(event) => chooseRole(event.target.value)} required><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      <label>Part<select value={partId} onChange={(event) => setPartId(event.target.value)} disabled={!componentRoleId} required><option value="">Select part</option>{roleParts.map((part) => <option key={part.id} value={part.id}>{componentLabel({ parts: part })}</option>)}</select></label>
      <label>Known original installation date <input type="date" value={installedDate} onChange={(event) => setInstalledDate(event.target.value)} /><small>Optional. Leave blank when the original installation date is unknown.</small></label>
      <label>Observation note or source<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="For example: observed during inspection; customer reports it was fitted earlier" /></label>
    </>}
    <div className="form-actions"><Button variant="secondary" type="button" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" disabled={isSaving || !roles.length}>{isSaving ? 'Recording…' : 'Record Existing Component'}</Button></div>
  </form>
}
