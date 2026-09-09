import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '../../../components/ui/Button'
import { correctPayment, voidPayment } from '../api/paymentCorrections'

const today = () => new Date().toLocaleDateString('en-CA')

export function PaymentCorrectionForm({ mode, paymentTable, payment, methods, onSaved }) {
  const { register, handleSubmit } = useForm({ defaultValues: {
    payment_date: payment.payment_date || today(), amount: payment.amount ?? '', payment_method_id: payment.payment_method_id || '',
    reference_number: payment.reference_number || '', notes: payment.notes || '', reason: '',
  } })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (values) => {
    setMessage(''); setSaving(true)
    try {
      if (mode === 'void') await voidPayment({ paymentTable, paymentId: payment.id, reason: values.reason })
      else await correctPayment({ paymentTable, paymentId: payment.id, values })
      onSaved()
    } catch {
      setMessage(mode === 'void' ? 'The payment could not be voided. Please check the reason and try again.' : 'The payment could not be corrected. Please check the replacement details and try again.')
    } finally { setSaving(false) }
  }
  return <form className="crm-form" onSubmit={handleSubmit(submit)}>
    <p className="form-help">{mode === 'void' ? 'This preserves the payment in history but removes it from Amount Received, Amount Due and Finance collections.' : 'The original payment will remain in history as Corrected. The replacement stays on this same transaction.'}</p>
    {message && <p className="form-message">{message}</p>}
    {mode === 'correct' && <><label>Payment date<input type="date" {...register('payment_date', { required: true })} /></label><label>Amount<input type="number" min="0.01" step="0.01" {...register('amount', { required: true })} /></label><label>Method<select {...register('payment_method_id', { required: true })}><option value="">Choose method</option>{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><label>Reference<input {...register('reference_number')} /></label><label>Notes<input {...register('notes')} /></label></>}
    <label>{mode === 'void' ? 'Void reason' : 'Correction reason'}<input placeholder="Required" {...register('reason', { required: true })} /></label>
    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'void' ? 'Void payment' : 'Save corrected payment'}</Button>
  </form>
}
