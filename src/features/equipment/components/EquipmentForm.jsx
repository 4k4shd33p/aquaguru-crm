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

export function EquipmentForm({ equipment, initialCustomer, onCancel, onSave, isSaving }) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({ defaultValues: initialValues(equipment) })
  const customerId = watch('customer_id')
  const typeId = watch('equipment_type_id')
  const selectedCustomer = equipment?.customers && equipment.customer_id === customerId ? equipment.customers : initialCustomer?.id === customerId ? initialCustomer : null
  const [customerSearch, setCustomerSearch] = useState(selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.customer_code})` : '')
  const debouncedCustomerSearch = useDebouncedValue(customerSearch)
  const customerSearchQuery = useEquipmentCustomerSearch(selectedCustomer ? '' : debouncedCustomerSearch)
  const locationsQuery = useEquipmentCustomerLocations(customerId)
  const typesQuery = useEquipmentTypes()
  const modelsQuery = useProductModels(typeId)

  const initialType = useRef(typeId)
  useEffect(() => { if (initialType.current !== typeId) setValue('product_model_id', '') }, [typeId, setValue])

  function selectCustomer(customer) {
    setValue('customer_id', customer.id, { shouldValidate: true })
    setValue('location_id', '')
    setCustomerSearch(`${customer.name} (${customer.customer_code})`)
  }

  function clearCustomer() {
    setValue('customer_id', '', { shouldValidate: true })
    setValue('location_id', '')
    setCustomerSearch('')
  }

  return <form className="crm-form equipment-form" onSubmit={handleSubmit(onSave)}>
    <div className="form-grid">
      <label className="form-field form-field--wide customer-combobox"><span>Customer <b>*</b></span>
        <input type="hidden" {...register('customer_id', { required: 'Select a customer.' })} />
        <div className="customer-combobox__input"><Search size={16} /><input value={customerSearch} onChange={(event) => { if (customerId) clearCustomer(); setCustomerSearch(event.target.value) }} placeholder="Search name, phone or customer code" aria-label="Search customer" autoComplete="off" />{customerId && <button type="button" aria-label="Clear selected customer" onClick={clearCustomer}><X size={15} /></button>}</div>
        {!customerId && customerSearch.trim().length > 1 && <div className="customer-combobox__results">{customerSearchQuery.isLoading ? <span>Finding customers…</span> : customerSearchQuery.data?.length ? customerSearchQuery.data.map((customer) => <button type="button" key={customer.id} onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><small>{customer.customer_code}{customer.phone ? ` · ${customer.phone}` : ''}</small></button>) : <span>No matching customers found.</span>}</div>}
        {errors.customer_id && <small>{errors.customer_id.message}</small>}
      </label>
      <label className="form-field"><span>Location</span><select {...register('location_id')} disabled={!customerId || locationsQuery.isLoading}><option value="">No location / Not assigned yet</option>{locationsQuery.data?.map((location) => <option value={location.id} key={location.id}>{locationLabel(location)}</option>)}</select><small className="form-field__hint">Only active locations for the selected customer are shown.</small></label>
      <label className="form-field"><span>Equipment type</span><select {...register('equipment_type_id')}><option value="">Not recorded</option>{typesQuery.data?.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
      <label className="form-field"><span>Product model</span><select {...register('product_model_id')} disabled={modelsQuery.isLoading}><option value="">Not recorded</option>{modelsQuery.data?.map((model) => <option value={model.id} key={model.id}>{model.model_name}</option>)}</select><small className="form-field__hint">Optional; choices match the selected equipment type.</small></label>
      <label className="form-field"><span>Source</span><select {...register('source')}>{equipmentSources.map((source) => <option value={source} key={source}>{source}</option>)}</select></label>
      <label className="form-field"><span>Status</span><select {...register('status')}>{equipmentStatuses.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
      <label className="form-field form-field--wide"><span>Serial number</span><input {...register('serial_number')} placeholder="Not recorded" /></label>
      <label className="form-field form-field--wide"><span>Notes</span><textarea {...register('notes')} rows="3" placeholder="Optional equipment notes" /></label>
    </div>
    <div className="form-actions"><Button variant="secondary" onClick={onCancel} disabled={isSaving}>Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : equipment ? 'Save changes' : 'Create equipment'}</Button></div>
  </form>
}

