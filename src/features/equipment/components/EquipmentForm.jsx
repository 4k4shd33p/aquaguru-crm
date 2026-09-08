import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../../components/ui/Button'
import { useDebouncedValue } from '../../customers/hooks/useDebouncedValue'
import { useEquipmentCustomerLocations, useEquipmentCustomerSearch, useEquipmentTypes, useProductModels } from '../hooks/useEquipment'
import { equipmentSources, equipmentStatuses, locationLabel } from '../utils/equipmentDisplay'

function initialValues(equipment) {
  return {
    customer_id: equipment?.customer_id || '', location_id: equipment?.location_id || '', equipment_type_id: equipment?.equipment_type_id || '', product_model_id: equipment?.product_model_id || '',
    source: equipment?.source || 'Unknown', serial_number: equipment?.serial_number || '', status: equipment?.status || 'Unknown', notes: equipment?.notes || '',
  }
}

function needsSavedOption(items, value) {
  return Boolean(value) && !items.some((item) => item.id === value)
}

export function EquipmentForm({ equipment, initialCustomer, onCancel, onSave, isSaving }) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, dirtyFields } } = useForm({ defaultValues: initialValues(equipment) })
  const customerId = watch('customer_id') || ''
  const locationId = watch('location_id') || ''
  const typeId = watch('equipment_type_id') || ''
  const productModelId = watch('product_model_id') || ''
  const selectedCustomer = equipment?.customers && equipment.customer_id === customerId ? equipment.customers : initialCustomer?.id === customerId ? initialCustomer : null
  const [customerSearch, setCustomerSearch] = useState(selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.customer_code})` : '')
  const debouncedCustomerSearch = useDebouncedValue(customerSearch)
  const customerSearchQuery = useEquipmentCustomerSearch(selectedCustomer ? '' : debouncedCustomerSearch)
  const locationsQuery = useEquipmentCustomerLocations(customerId)
  const typesQuery = useEquipmentTypes()
  const modelsQuery = useProductModels(typeId)
  const locations = locationsQuery.data ?? []
  const types = typesQuery.data ?? []
  const models = modelsQuery.data ?? []
  const previousTypeId = useRef(typeId)

  useEffect(() => {
    const values = initialValues(equipment)
    reset(values)
    previousTypeId.current = values.equipment_type_id
  }, [equipment?.id, reset])

  useEffect(() => {
    if (previousTypeId.current && previousTypeId.current !== typeId) {
      setValue('product_model_id', '', { shouldDirty: true })
    }
    previousTypeId.current = typeId
  }, [typeId, setValue])

  function selectCustomer(customer) {
    setValue('customer_id', customer.id, { shouldValidate: true, shouldDirty: true })
    setValue('location_id', '', { shouldDirty: true })
    setCustomerSearch(`${customer.name} (${customer.customer_code})`)
  }

  function clearCustomer() {
    setValue('customer_id', '', { shouldValidate: true, shouldDirty: true })
    setValue('location_id', '', { shouldDirty: true })
    setCustomerSearch('')
  }

  function submit(values) {
    const saved = initialValues(equipment)
    return onSave({
      ...values,
      location_id: !dirtyFields.location_id && saved.location_id && !values.location_id ? saved.location_id : values.location_id,
      equipment_type_id: !dirtyFields.equipment_type_id && saved.equipment_type_id && !values.equipment_type_id ? saved.equipment_type_id : values.equipment_type_id,
      product_model_id: !dirtyFields.product_model_id && saved.product_model_id && !values.product_model_id ? saved.product_model_id : values.product_model_id,
    })
  }

  const showSavedLocation = needsSavedOption(locations, locationId)
  const showSavedType = needsSavedOption(types, typeId)
  const showSavedModel = needsSavedOption(models, productModelId)

  return <form className="crm-form equipment-form" onSubmit={handleSubmit(submit)}>
    <div className="form-grid">
      <label className="form-field form-field--wide customer-combobox"><span>Customer <b>*</b></span>
        <input type="hidden" {...register('customer_id', { required: 'Select a customer.' })} />
        <div className="customer-combobox__input"><Search size={16} /><input value={customerSearch} onChange={(event) => { if (customerId) clearCustomer(); setCustomerSearch(event.target.value) }} placeholder="Search name, phone or customer code" aria-label="Search customer" autoComplete="off" />{customerId && <button type="button" aria-label="Clear selected customer" onClick={clearCustomer}><X size={15} /></button>}</div>
        {!customerId && customerSearch.trim().length > 1 && <div className="customer-combobox__results">{customerSearchQuery.isLoading ? <span>Finding customers…</span> : customerSearchQuery.data?.length ? customerSearchQuery.data.map((customer) => <button type="button" key={customer.id} onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><small>{customer.customer_code}{customer.phone ? ` · ${customer.phone}` : ''}</small></button>) : <span>No matching customers found.</span>}</div>}
        {errors.customer_id && <small>{errors.customer_id.message}</small>}
      </label>
      <label className="form-field"><span>Location</span><select {...register('location_id')} value={locationId} disabled={!customerId || locationsQuery.isLoading}><option value="">No location / Not assigned yet</option>{showSavedLocation && <option value={locationId}>{locationLabel(equipment?.locations) || 'Saved location'}</option>}{locations.map((location) => <option value={location.id} key={location.id}>{locationLabel(location)}</option>)}</select><small className="form-field__hint">Only active locations for the selected customer are shown.</small></label>
      <label className="form-field"><span>Equipment type</span><select {...register('equipment_type_id')} value={typeId} disabled={typesQuery.isLoading}><option value="">Not recorded</option>{showSavedType && <option value={typeId}>{equipment?.equipment_types?.name || 'Saved equipment type'}</option>}{types.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
      <label className="form-field"><span>Product model</span><select {...register('product_model_id')} value={productModelId} disabled={modelsQuery.isLoading}><option value="">Not recorded</option>{showSavedModel && <option value={productModelId}>{equipment?.product_models?.model_name || 'Saved product model'}</option>}{models.map((model) => <option value={model.id} key={model.id}>{model.model_name}</option>)}</select><small className="form-field__hint">Optional; choices match the selected equipment type.</small></label>
      <label className="form-field"><span>Source</span><select {...register('source')}>{equipmentSources.map((source) => <option value={source} key={source}>{source}</option>)}</select></label>
      <label className="form-field"><span>Status</span><select {...register('status')}>{equipmentStatuses.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
      <label className="form-field form-field--wide"><span>Serial number</span><input {...register('serial_number')} placeholder="Not recorded" /></label>
      <label className="form-field form-field--wide"><span>Notes</span><textarea {...register('notes')} rows="3" placeholder="Optional equipment notes" /></label>
    </div>
    <div className="form-actions"><Button variant="secondary" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : equipment ? 'Save changes' : 'Create equipment'}</Button></div>
  </form>
}
