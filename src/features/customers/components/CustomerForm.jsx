import { AlertCircle } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../../components/ui/Button'
import { getDataErrorMessage } from '../../../utils/dataErrors'
import { useCustomerTypes, useDuplicatePhone } from '../hooks/useCustomers'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const emptyValues = { name: '', customer_type_id: '', phone: '', alternate_phone: '', email: '', notes: '', is_active: true }

export function CustomerForm({ customer, onCancel, onSave, isSaving }) {
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({ defaultValues: customer ? { ...emptyValues, ...customer, customer_type_id: customer.customer_type_id ?? '' } : emptyValues })
  const { data: customerTypes = [], isLoading: typesLoading } = useCustomerTypes()
  const phone = watch('phone') || ''
  const debouncedPhone = useDebouncedValue(phone, 400)
  const { data: duplicates = [] } = useDuplicatePhone(debouncedPhone, customer?.id)

  useEffect(() => { reset(customer ? { ...emptyValues, ...customer, customer_type_id: customer.customer_type_id ?? '' } : emptyValues) }, [customer, reset])

  return <form className="crm-form" onSubmit={handleSubmit(async (values) => await onSave(values))} noValidate>
    <div className="form-grid"><label className="form-field form-field--wide">Customer name<span aria-hidden="true">*</span><input autoFocus {...register('name', { required: 'Customer name is required.', validate: (value) => value.trim() ? true : 'Customer name is required.' })} aria-invalid={Boolean(errors.name)} />{errors.name && <small role="alert">{errors.name.message}</small>}</label>
      <label className="form-field">Customer type<select {...register('customer_type_id')} disabled={typesLoading}><option value="">Not selected</option>{customerTypes.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
      <label className="form-field">Phone<input type="tel" inputMode="tel" {...register('phone')} /></label>
      <label className="form-field">Alternate phone<input type="tel" inputMode="tel" {...register('alternate_phone')} /></label>
      <label className="form-field form-field--wide">Email<input type="email" {...register('email', { validate: (value) => !value || /^\S+@\S+\.\S+$/.test(value) || 'Enter a valid email address.' })} aria-invalid={Boolean(errors.email)} />{errors.email && <small role="alert">{errors.email.message}</small>}</label>
      <label className="form-field form-field--wide">Notes<textarea rows="3" {...register('notes')} /></label>
      <label className="switch-field form-field--wide"><input type="checkbox" {...register('is_active')} /><span><strong>Active customer</strong><small>Inactive customers are retained but excluded from active operations.</small></span></label>
    </div>
    {duplicates.length > 0 && <div className="duplicate-warning" role="status"><AlertCircle size={18} /><span>A customer with this phone number already exists: {duplicates.map((match) => `${match.name} (${match.customer_code})`).join(', ')}. You can still save if this is intentional.</span></div>}
    <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : customer ? 'Save changes' : 'Create customer'}</Button></div>
  </form>
}

export function customerSaveMessage(error) { return getDataErrorMessage(error, 'Customer could not be saved.') }
