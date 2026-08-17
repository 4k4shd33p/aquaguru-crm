import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../../components/ui/Button'
import { getDataErrorMessage } from '../../../utils/dataErrors'

const emptyValues = { location_name: '', address: '', area: '', city: '', pincode: '', notes: '', is_active: true }

export function LocationForm({ location, onCancel, onSave, isSaving }) {
  const { register, handleSubmit, reset } = useForm({ defaultValues: location ? { ...emptyValues, ...location } : emptyValues })
  useEffect(() => { reset(location ? { ...emptyValues, ...location } : emptyValues) }, [location, reset])
  return <form className="crm-form" onSubmit={handleSubmit(async (values) => await onSave(values))}>
    <div className="form-grid"><label className="form-field">Location name<input autoFocus placeholder="e.g. Home" {...register('location_name')} /></label><label className="form-field">Area<input {...register('area')} /></label><label className="form-field">City<input {...register('city')} /></label><label className="form-field">Pincode<input inputMode="numeric" {...register('pincode')} /></label><label className="form-field form-field--wide">Address<textarea rows="3" {...register('address')} /></label><label className="form-field form-field--wide">Notes<textarea rows="3" {...register('notes')} /></label><label className="switch-field form-field--wide"><input type="checkbox" {...register('is_active')} /><span><strong>Active location</strong><small>Inactive locations are kept for historical reference.</small></span></label></div>
    <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : location ? 'Save changes' : 'Add location'}</Button></div>
  </form>
}

export function locationSaveMessage(error) { return getDataErrorMessage(error, 'Location could not be saved.') }
