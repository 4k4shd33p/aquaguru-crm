import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/feedback/EmptyState'
import { categoryPath, formatBalance, formatBusinessDate, formatMoney } from '../utils/financeDisplay'

const tabs = [['all', 'All'], ['Sales', 'Sales'], ['Service', 'Service'], ['AMC', 'AMC'], ['Installation', 'Installation']]

function OutstandingReference({ row }) {
  const path = categoryPath(row)
  const content = <><strong>{row.transaction_code || 'Reference unavailable'}</strong><span>{formatBusinessDate(row.transaction_date)}</span></>
  return path ? <Link className="finance-table-link" to={path}>{content}</Link> : <div className="finance-table-link">{content}</div>
}

export function FinanceOutstanding({ result, isLoading, category, onCategoryChange, page, onPageChange, asOf }) {
  const rows = result?.rows ?? []
  const count = result?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / 25))
  return <Card className="finance-section finance-outstanding"><header className="finance-section__header"><div><h3>Outstanding</h3><p>Unpaid balance as of {asOf}.</p></div></header><div className="finance-tabs" role="tablist" aria-label="Outstanding category">{tabs.map(([value, label]) => <button key={value} type="button" className={category === value ? 'active' : ''} onClick={() => onCategoryChange(value)} role="tab" aria-selected={category === value}>{label}</button>)}</div>{isLoading ? <p className="finance-loading">Loading outstanding balances…</p> : !rows.length ? <EmptyState title="No outstanding balances" description="There are no matching balances as of this date." /> : <><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Category</th><th>Reference</th><th>Customer</th><th>Value</th><th>Collected</th><th>Outstanding</th><th>Contribution</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.category}-${row.transaction_id}`}><td>{row.category}</td><td><OutstandingReference row={row} /></td><td>{row.customer_name || 'Customer unavailable'}</td><td className="finance-amount">{formatMoney(row.transaction_value)}</td><td className="finance-amount">{formatMoney(row.collections_as_of)}</td><td className={`finance-amount ${Number(row.outstanding) < 0 ? 'finance-credit' : ''}`}>{formatBalance(row.outstanding)}</td><td className="finance-amount">{row.category === 'AMC' ? 'Unavailable' : row.direct_cost_available ? formatMoney(row.contribution) : 'Unavailable'}</td></tr>)}</tbody></table></div><div className="finance-mobile-cards">{rows.map((row) => <article key={`${row.category}-${row.transaction_id}`}><div><strong className={Number(row.outstanding) < 0 ? 'finance-credit' : ''}>{formatBalance(row.outstanding)}</strong><span>{row.category}</span></div><OutstandingReference row={row} /><p>{row.customer_name || 'Customer unavailable'}</p><small>Value {formatMoney(row.transaction_value)} · Collected {formatMoney(row.collections_as_of)}</small></article>)}</div></>}<footer className="finance-pagination"><span>{count} records</span><div><Button variant="secondary" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</Button></div></footer></Card>
}

