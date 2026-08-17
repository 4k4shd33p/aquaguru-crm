import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/feedback/EmptyState'
import { formatBusinessDate, formatMoney } from '../utils/financeDisplay'

function collectionPath(item) {
  if (item.collection_type === 'Sales' || item.collection_type === 'EMI') return `/sales/${item.transaction_id}`
  if (item.collection_type === 'Service') return `/service/${item.transaction_id}`
  if (item.collection_type === 'AMC') return `/coverage/amc/${item.transaction_id}`
  return null
}

function CollectionReference({ item }) {
  const path = collectionPath(item)
  const content = <><strong>{item.payment_code || 'Collection'}</strong><span>{item.transaction_code || 'Reference unavailable'}</span></>
  return path ? <Link className="finance-table-link" to={path}>{content}</Link> : <div className="finance-table-link">{content}</div>
}

export function FinanceRecentCollections({ items, isLoading, limit, onLimitChange }) {
  return <Card className="finance-section"><header className="finance-section__header"><div><h3>Recent collections</h3><p>Payments received within the selected reporting period.</p></div><label className="finance-select">Show<select value={limit} onChange={(event) => onLimitChange(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option></select></label></header>{isLoading ? <p className="finance-loading">Loading collections…</p> : !items.length ? <EmptyState title="No collections for this period" description="Collections will appear here when payments are recorded." /> : <><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Customer</th><th>Method</th><th>Amount</th></tr></thead><tbody>{items.map((item) => <tr key={item.payment_id}><td>{formatBusinessDate(item.payment_date)}</td><td>{item.collection_type}</td><td><CollectionReference item={item} /></td><td>{item.customer_name || 'Customer unavailable'}</td><td>{item.payment_method_name || 'Not recorded'}</td><td className="finance-amount">{formatMoney(item.amount)}</td></tr>)}</tbody></table></div><div className="finance-mobile-cards">{items.map((item) => <article key={item.payment_id}><div><strong>{formatMoney(item.amount)}</strong><span>{formatBusinessDate(item.payment_date)}</span></div><CollectionReference item={item} /><p>{item.customer_name || 'Customer unavailable'} · {item.payment_method_name || 'Not recorded'}</p><small>{item.collection_type}</small></article>)}</div></>}</Card>
}

