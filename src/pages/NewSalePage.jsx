import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { NewSaleForm } from '../features/sales/components/NewSaleForm'
import { useCreateSale } from '../features/sales/hooks/useSales'

export function NewSalePage() { const navigate = useNavigate(); const [params] = useSearchParams(); const initialCustomer = params.get('customerId') ? { id: params.get('customerId'), name: params.get('customerName') || 'Selected customer', customer_code: params.get('customerCode') || '', phone: '' } : null; const create = useCreateSale(); async function submit(values) { const result = await create.mutateAsync(values); navigate(`/sales/${result.saleId}`, { replace: true }) } return <div className="new-sale-page"><Link className="back-link" to="/sales"><ArrowLeft size={17} />Sales</Link><header className="page-heading"><div><span className="eyebrow">New sale</span><h2>Create a sale</h2><p>Equipment is generated atomically for every sold unit.</p></div></header><NewSaleForm initialCustomer={initialCustomer} onSubmit={submit} isSubmitting={create.isPending} /></div> }

