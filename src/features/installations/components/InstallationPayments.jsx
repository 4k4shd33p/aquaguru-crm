import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Modal } from '../../../components/ui/Modal'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import { useCorrectInstallationPayment, useInstallationPaymentMethods, useRecordInstallationPayment, useVoidInstallationPayment } from '../hooks/useInstallations'

const today = () => new Date().toLocaleDateString('en-CA')
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const money = (value) => formatCurrency(Number(value ?? 0))
const paymentError = (error, fallback) => {
  const message = String(error?.message ?? '').toLowerCase()
  if (message.includes('exceeds') || message.includes('cannot be reduced')) return 'This change would exceed the authoritative Additional Work balance.'
  if (message.includes('completed')) return 'Payments can be recorded only after the Installation is completed.'
  return fallback
}

function RecordForm({ due, methods, saving, onSave }) {
  const key = useRef(newKey())
  const [message, setMessage] = useState('')
  const form = useForm({ defaultValues: { paymentDate: today(), amount: '', paymentMethodId: '', referenceNumber: '', notes: '' } })
  const submit = async (values) => {
    const amount = Number(values.amount)
    if (!amount || amount <= 0) return setMessage('Enter an amount greater than ₹0.')
    if (amount > Number(due)) return setMessage('Amount cannot exceed the current Amount Due.')
    try { setMessage(''); await onSave({ ...values, submissionKey: key.current }) } catch (error) { setMessage(paymentError(error, 'The Installation payment could not be recorded.')) }
  }
  return <form className="crm-form" onSubmit={form.handleSubmit(submit)}>{message && <p className="form-message" role="alert">{message}</p>}<p className="form-help">Current Amount Due: {money(due)}. Use the same reference when this allocation is part of a combined customer receipt.</p><label>Payment Date<input type="date" {...form.register('paymentDate', { required: true })} /></label><label>Amount<input type="number" min="0.01" max={Math.max(Number(due), 0)} step="0.01" {...form.register('amount', { required: true })} /></label><label>Payment Method<select {...form.register('paymentMethodId', { required: true })}><option value="">Choose method</option>{methods.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Reference<input {...form.register('referenceNumber')} /></label><label>Notes<input {...form.register('notes')} /></label><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</Button></form>
}

function CorrectionForm({ payment, due, methods, saving, onSave }) {
  const [message, setMessage] = useState('')
  const form = useForm({ defaultValues: { paymentDate: payment.payment_date, amount: payment.amount, paymentMethodId: payment.payment_method_id, referenceNumber: payment.reference_number ?? '', notes: payment.notes ?? '', reason: '' } })
  const submit = async (values) => {
    const amount = Number(values.amount)
    const ceiling = Number(due) + Number(payment.amount)
    if (!amount || amount <= 0) return setMessage('Enter an amount greater than ₹0.')
    if (amount > ceiling) return setMessage('Corrected amount cannot exceed the payable balance.')
    if (!values.reason.trim()) return setMessage('Enter a correction reason.')
    try { setMessage(''); await onSave(values) } catch (error) { setMessage(paymentError(error, 'The Installation payment could not be corrected.')) }
  }
  return <form className="crm-form" onSubmit={form.handleSubmit(submit)}>{message && <p className="form-message" role="alert">{message}</p>}<p className="form-help">The original payment remains in history as Corrected. Replacement ceiling: {money(Number(due) + Number(payment.amount))}.</p><label>Payment Date<input type="date" {...form.register('paymentDate', { required: true })} /></label><label>Amount<input type="number" min="0.01" step="0.01" {...form.register('amount', { required: true })} /></label><label>Payment Method<select {...form.register('paymentMethodId', { required: true })}>{methods.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Reference<input {...form.register('referenceNumber')} /></label><label>Notes<input {...form.register('notes')} /></label><label>Correction reason<textarea {...form.register('reason')} /></label><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save correction'}</Button></form>
}

function VoidForm({ saving, onSave }) {
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  return <form className="crm-form" onSubmit={async (event) => { event.preventDefault(); if (!reason.trim()) return setMessage('Enter a void reason.'); try { setMessage(''); await onSave(reason) } catch (error) { setMessage(paymentError(error, 'The Installation payment could not be voided.')) } }}>{message && <p className="form-message" role="alert">{message}</p>}<p className="form-help">The payment will remain in history and stop counting toward Amount Received.</p><label>Void reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button type="submit" disabled={saving}>{saving ? 'Voiding…' : 'Void payment'}</Button></form>
}

export function InstallationPayments({ installation }) {
  const methods = useInstallationPaymentMethods()
  const record = useRecordInstallationPayment()
  const correct = useCorrectInstallationPayment()
  const voidPayment = useVoidInstallationPayment()
  const [modal, setModal] = useState(null)
  const summary = installation.paymentSummary ?? { additional_work_value: 0, amount_received: 0, amount_due: 0 }
  const payments = installation.payments ?? []
  const due = Number(summary.amount_due ?? 0)
  const canRecord = installation.status === 'Completed' && due > 0

  return <Card><div className="section-heading"><div><h2>Payments / Collections</h2><p>Only Paid Additional Work is payable. Legacy Installation Charge is excluded.</p></div>{canRecord && <Button onClick={() => setModal({ mode: 'record' })}><Plus size={16} />Record payment</Button>}</div><div className="service-financial-detail"><p><span>Additional Work Value</span><strong>{money(summary.additional_work_value)}</strong></p><p><span>Amount Received</span><strong>{money(summary.amount_received)}</strong></p><p><span>Amount Due</span><strong>{money(summary.amount_due)}</strong></p></div>{!canRecord && due <= 0 && <p className="coverage-empty-copy">No payment is due for this Installation.</p>}{payments.length ? payments.map((payment) => <div className="payment-history-row" key={payment.id}><p>{formatDate(payment.payment_date)} · {money(payment.amount)} · {payment.payment_methods?.name || 'Payment method unavailable'} {payment.reference_number ? `· ${payment.reference_number}` : ''} <Badge tone={payment.payment_status === 'Valid' ? 'success' : 'muted'}>{payment.payment_status}</Badge></p>{payment.void_reason && <small>Reason: {payment.void_reason}</small>}{payment.corrected_by_payment_id && <small>Replacement payment recorded.</small>}{payment.correction_of_payment_id && <small>Replacement for an earlier payment.</small>}{payment.payment_status === 'Valid' && <div className="payment-history-row__actions"><Button variant="secondary" onClick={() => setModal({ mode: 'void', payment })}><Trash2 size={15} />Void Payment</Button><Button variant="secondary" onClick={() => setModal({ mode: 'correct', payment })}><Pencil size={15} />Correct Payment</Button></div>}</div>) : <p>No Installation payments recorded yet.</p>}{modal?.mode === 'record' && <Modal title="Record Installation payment" onClose={() => setModal(null)}><RecordForm due={due} methods={methods.data ?? []} saving={record.isPending} onSave={async (values) => { await record.mutateAsync({ installationId: installation.id, equipmentId: installation.equipment_id, values }); setModal(null) }} /></Modal>}{modal?.mode === 'correct' && <Modal title="Correct Installation payment" onClose={() => setModal(null)}><CorrectionForm payment={modal.payment} due={due} methods={methods.data ?? []} saving={correct.isPending} onSave={async (values) => { await correct.mutateAsync({ installationId: installation.id, equipmentId: installation.equipment_id, paymentId: modal.payment.id, values }); setModal(null) }} /></Modal>}{modal?.mode === 'void' && <Modal title="Void Installation payment" onClose={() => setModal(null)}><VoidForm saving={voidPayment.isPending} onSave={async (reason) => { await voidPayment.mutateAsync({ installationId: installation.id, equipmentId: installation.equipment_id, paymentId: modal.payment.id, reason }); setModal(null) }} /></Modal>}</Card>
}
