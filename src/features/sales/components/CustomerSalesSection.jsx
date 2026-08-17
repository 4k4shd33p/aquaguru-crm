import { Plus, ReceiptText } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { formatCurrency, formatDate, saleStatusTone } from '../utils/salesDisplay'

export function CustomerSalesSection({ customer, sales, isLoading }) {
  const navigate = useNavigate()
  const startSale = () => navigate(`/sales/new?customerId=${encodeURIComponent(customer.id)}&customerName=${encodeURIComponent(customer.name)}&customerCode=${encodeURIComponent(customer.customer_code)}`)

  return <section className="card customer-sales">
    <div className="section-heading"><div><h2>Sales</h2><p>Latest 10 recorded sales.</p></div><Button onClick={startSale}><Plus size={16} />New Sale</Button></div>
    {isLoading ? <p>Loading sales…</p> : sales.length ? <div className="customer-sales__list">{sales.map((sale) => <Link key={sale.id} to={`/sales/${sale.id}`}><div><strong>{sale.sale_code}</strong><span>{formatDate(sale.sale_date)}</span></div><div><span>Total {formatCurrency(sale.totals.total)}</span><span>Collected {formatCurrency(sale.totals.collected)}</span><strong>Outstanding {formatCurrency(sale.totals.outstanding)}</strong></div><Badge tone={saleStatusTone(sale.status)}>{sale.status}</Badge></Link>)}</div> : <div className="customer-sales__empty"><ReceiptText size={20} /><div><strong>No sales recorded for this customer.</strong><Button onClick={startSale}>New Sale</Button></div></div>}
  </section>
}
