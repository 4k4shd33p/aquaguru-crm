import { ArrowLeft, CreditCard, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ErrorState } from '../components/feedback/ErrorState'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { PaymentCorrectionForm } from '../features/payments/components/PaymentCorrectionForm'
import { useAddEmiPayment, useAddSalePayment, useCorrectSale, useCreateEmiAccount, useSale, useSaleLookups } from '../features/sales/hooks/useSales'
import { formatCurrency, formatDate, locationLabel, saleStatusTone, warrantyLabel } from '../features/sales/utils/salesDisplay'

const today=()=>new Date().toLocaleDateString('en-CA')
const money=(value)=>value===null||value===undefined?'Not recorded':formatCurrency(value)

function PaymentForm({onSave,saving,methods}) {
  const {register,handleSubmit}=useForm({defaultValues:{payment_date:today(),amount:'',payment_method_id:'',reference_number:'',notes:''}})
  return <form className="crm-form" onSubmit={handleSubmit(onSave)}><label className="form-checkbox"><input type="checkbox" {...register('historicalEntry',{onChange:(e)=>{if(e.target.checked)setValue('payment_date','')}})}/>Historical Entry — enter the actual payment date</label><label>Date<input type="date" {...register('payment_date',{required:true})}/></label><label>Amount<input type="number" min="0.01" step="0.01" {...register('amount',{required:true})}/></label><label>Method<select {...register('payment_method_id',{required:true})}><option value="">Choose method</option>{methods.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label>Reference<input {...register('reference_number')}/></label><label>Notes<input {...register('notes')}/></label><Button type="submit" disabled={saving}>{saving?'Saving…':'Record payment'}</Button></form>
}

function CorrectionForm({sale,leadSources,onSave,saving}) {
  const {register,handleSubmit,watch}=useForm({defaultValues:{
    sale_date:sale.sale_date,lead_source_id:sale.lead_source_id||'',invoice_number:sale.invoice_number||'',invoice_date:sale.invoice_date||'',source_detail:sale.source_detail||'',notes:sale.notes||'',correction_note:'',
    items:sale.sale_items.map(i=>({id:i.id,standard_unit_price:i.standard_unit_price??'',actual_unit_price:i.actual_unit_price,unit_cost:i.unit_cost??'',warranty_months:i.warranty_months??''})),
  }})
  const items=watch('items')||[]
  return <form className="crm-form sale-correction-form" onSubmit={handleSubmit(onSave)}>
    <p className="form-help">Correct only the recorded Sale details and financial snapshots. Customer, product, quantity, Equipment and payments stay locked.</p>
    <div className="sale-correction-form__header">
      <label>Sale Date<input type="date" {...register('sale_date',{required:true})}/></label>
      <label>Lead Source<select {...register('lead_source_id')}><option value="">Not recorded</option>{leadSources.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      <label>Invoice / Reference<input {...register('invoice_number')}/></label>
      <label>Invoice Date<input type="date" {...register('invoice_date')}/></label>
      <label>Source detail<input {...register('source_detail')}/></label>
      <label>Sale notes<input {...register('notes')}/></label>
    </div>
    <div className="sale-correction-form__items"><h3>Sale Items</h3>{sale.sale_items.map((item,index)=>{
      const current=items[index]||{}
      const usual=Number(current.standard_unit_price||0), selling=Number(current.actual_unit_price||0)
      return <section className="sale-correction-item" key={item.id}>
        <div><strong>{item.product_models?.model_name||'Product'}</strong><span>Product and quantity are locked to preserve generated Equipment.</span></div>
        <div className="sale-correction-item__locked"><span>Quantity</span><strong>{item.quantity}</strong></div>
        <input type="hidden" {...register(`items.${index}.id`)}/>
        <label>Usual Price<input type="number" min="0" step="0.01" {...register(`items.${index}.standard_unit_price`)}/></label>
        <label>Selling Price<input type="number" min="0" step="0.01" {...register(`items.${index}.actual_unit_price`,{required:true})}/></label>
        <label>Our Cost<input type="number" min="0" step="0.01" {...register(`items.${index}.unit_cost`)}/></label>
        <label>Warranty Months<input type="number" min="0" step="1" {...register(`items.${index}.warranty_months`)}/></label>
        <div className="sale-correction-item__derived"><span>Derived Discount</span><strong>{formatCurrency(Math.max(usual-selling,0))}</strong></div>
      </section>
    })}</div>
    <label>Correction Note / Reason<input placeholder="Required when changing price, cost or warranty months" {...register('correction_note')}/></label>
    <Button type="submit" disabled={saving}>{saving?'Saving…':'Save correction'}</Button>
  </form>
}

export function SaleDetailPage(){
  const {saleId}=useParams(),q=useSale(saleId),lookups=useSaleLookups(),pay=useAddSalePayment(),emi=useCreateEmiAccount(),emiPay=useAddEmiPayment(),correct=useCorrectSale()
  const [modal,setModal]=useState('')
  const [paymentAction,setPaymentAction]=useState(null)
  if(q.isLoading)return <div className="detail-loading">Loading sale…</div>
  if(q.isError||!q.data)return <ErrorState title="Sale could not be loaded" description="Please refresh and try again."/>
  const sale=q.data,methods=lookups.data?.paymentMethods??[],leadSources=lookups.data?.leadSources??[],account=sale.emi_accounts?.[0],actualEmi=sale.totals.emiPayments
  const paymentHistory = (payment, table) => <div className="payment-history-row" key={payment.id}><p>{formatDate(payment.payment_date)} · {formatCurrency(payment.amount)} · {payment.payment_methods?.name}{payment.reference_number ? ` · ${payment.reference_number}` : ''} <Badge tone={payment.payment_status === 'Valid' ? 'success' : 'muted'}>{payment.payment_status ?? 'Valid'}</Badge></p>{payment.void_reason && <small>Reason: {payment.void_reason}</small>}{payment.corrected_by_payment?.payment_code && <small>Replacement: {payment.corrected_by_payment.payment_code}</small>}{payment.correction_of_payment?.payment_code && <small>Correction of {payment.correction_of_payment.payment_code}</small>}{(payment.payment_status ?? 'Valid') === 'Valid' && <div className="payment-history-row__actions"><Button variant="secondary" onClick={() => setPaymentAction({ mode: 'void', table, payment })}>Void Payment</Button><Button variant="secondary" onClick={() => setPaymentAction({ mode: 'correct', table, payment })}>Correct Payment</Button></div>}</div>
  return <div className="sale-detail">
    <Link className="back-link" to="/sales"><ArrowLeft size={17}/>Sales</Link>
    <header className="customer-detail__header"><div><span className="eyebrow">Sale</span><h2>{sale.sale_code}</h2><p>{formatDate(sale.sale_date)} · {sale.customers?.name}</p></div><div className="sale-detail__actions"><Badge tone={saleStatusTone(sale.status)}>{sale.status}</Badge><Button onClick={()=>setModal('correct')}><Pencil size={16}/>Edit / Correct Sale</Button></div></header>
    <div className="sale-summary"><div><span>Total</span><strong>{money(sale.totals.total)}</strong></div><div><span>Collected</span><strong>{formatCurrency(sale.totals.collected)}</strong></div><div><span>Outstanding</span><strong>{money(sale.totals.outstanding)}</strong></div></div>
    <section className="card"><h2>Overview</h2><p>Invoice: {sale.invoice_number||'Not recorded'} · Lead source: {sale.lead_sources?.name||'Not recorded'}</p><p>{sale.notes||'No notes recorded.'}</p></section>
    <section className="card"><h2>Items</h2>{sale.sale_items.map(i=><div className="sale-item-row" key={i.id}><strong>{i.product_models?.model_name} × {i.quantity}</strong><span>{i.actual_unit_price === null ? 'Not recorded' : formatCurrency(Number(i.actual_unit_price)*i.quantity)} · {warrantyLabel(i.warranty_months)}</span><small>Usual {formatCurrency(i.standard_unit_price)} · Our Cost {formatCurrency(i.unit_cost)} · Discount {money(i.discount)}</small></div>)}</section>
    <section className="card"><h2>Generated equipment</h2>{sale.equipment.length ? sale.equipment.map(e=><Link className="sale-item-row" key={e.id} to={`/equipment/${e.id}`}><strong>{e.equipment_code}</strong><span>{locationLabel(e.locations)}</span></Link>) : <p>No generated equipment found.</p>}</section>
    {sale.sale_corrections?.length ? <section className="card"><h2>Correction History</h2>{sale.sale_corrections.map(c=><p key={c.id}>{formatDate(c.corrected_at)} · {c.correction_note||'Sale details corrected'}</p>)}</section> : null}
    <section className="card"><div className="section-heading"><h2>Payments</h2><Button onClick={()=>setModal('payment')}><Plus size={16}/>Record payment</Button></div>{sale.sale_payments.length?<div>{sale.sale_payments.map((payment) => paymentHistory(payment, 'sale_payments'))}</div>:<p>No payments recorded yet.</p>}</section>
    <section className="card"><div className="section-heading"><h2>EMI</h2>{!account&&<Button onClick={()=>setModal('emi')}><CreditCard size={16}/>Set up EMI</Button>}</div>{account?<div><p>{formatCurrency(account.total_financed_amount)} financed · Actual EMI paid {formatCurrency(actualEmi)} · Remaining {formatCurrency(account.total_financed_amount-actualEmi)}</p><p>Expected terms are reference only: {account.expected_payment_amount?formatCurrency(account.expected_payment_amount):'Not recorded'} {account.expected_payment_frequency||''}</p><Button onClick={()=>setModal('emiPayment')}>Record EMI payment</Button>{account.emi_payments.map((payment) => paymentHistory(payment, 'emi_payments'))}</div>:<p>No EMI arrangement for this sale.</p>}</section>
    {modal==='correct'&&<Modal title="Edit / Correct Sale" onClose={()=>setModal('')}><CorrectionForm sale={sale} leadSources={leadSources} saving={correct.isPending} onSave={async values=>{await correct.mutateAsync({saleId,values});setModal('')}}/></Modal>}
    {modal==='payment'&&<Modal title="Record payment" onClose={()=>setModal('')}><PaymentForm methods={methods} saving={pay.isPending} onSave={async v=>{await pay.mutateAsync({saleId,values:v});setModal('')}}/></Modal>}
    {modal==='emiPayment'&&<Modal title="Record EMI payment" onClose={()=>setModal('')}><PaymentForm methods={methods} saving={emiPay.isPending} onSave={async v=>{await emiPay.mutateAsync({emiAccountId:account.id,values:v});setModal('')}}/></Modal>}
    {modal==='emi'&&<Modal title="Set up EMI" onClose={()=>setModal('')}><EmiForm saving={emi.isPending} total={sale.totals.outstanding} onSave={async v=>{await emi.mutateAsync({saleId,values:v});setModal('')}}/></Modal>}
    {paymentAction&&<Modal title={paymentAction.mode === 'void' ? 'Void payment' : 'Correct payment'} onClose={()=>setPaymentAction(null)}><PaymentCorrectionForm mode={paymentAction.mode} paymentTable={paymentAction.table} payment={paymentAction.payment} methods={methods} onSaved={()=>{q.refetch();setPaymentAction(null)}} /></Modal>}
  </div>
}

function EmiForm({onSave,saving,total}){const {register,handleSubmit}=useForm({defaultValues:{total_financed_amount:total,expected_payment_amount:'',expected_payment_frequency:'Monthly',expected_payment_day:'',start_date:today(),end_date:'',notes:''}});return <form className="crm-form" onSubmit={handleSubmit(onSave)}><label>Financed amount<input type="number" min="0" {...register('total_financed_amount',{required:true})}/></label><label>Expected amount<input type="number" min="0" {...register('expected_payment_amount')}/></label><label>Expected frequency<input {...register('expected_payment_frequency')}/></label><label>Expected day<input type="number" min="1" max="31" {...register('expected_payment_day')}/></label><label>Start<input type="date" {...register('start_date')}/></label><label>End<input type="date" {...register('end_date')}/></label><label>Notes<input {...register('notes')}/></label><Button type="submit" disabled={saving}>{saving?'Saving…':'Create EMI account'}</Button></form>}
