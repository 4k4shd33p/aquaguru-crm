import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui/Card'
import { displayBalance, displayMoney } from '../utils/dashboardDisplay'

function Metric({ label, value, unavailable, balance }) {
  const credit = balance && Number(value) < 0
  return <div className="dashboard-finance-metric"><span>{label}</span><strong className={credit ? 'dashboard-credit' : ''}>{unavailable ? 'Unavailable' : balance ? displayBalance(value) : displayMoney(value)}</strong></div>
}

export function DashboardFinanceSnapshot({ query }) {
  const summary = query.data
  return <Card className="dashboard-finance"><header><div><span className="eyebrow">Current month</span><h3>Finance snapshot</h3><p>Month-to-date activity and balance as of today.</p></div><Link to="/finance">View Finance <ArrowRight size={16} /></Link></header>{query.isLoading ? <p className="dashboard-card-state">Loading finance snapshot…</p> : query.isError ? <p className="dashboard-card-state dashboard-card-state--error">Finance snapshot is unavailable right now.</p> : <><div className="dashboard-finance__metrics"><Metric label="Transaction Value" value={summary?.total_transaction_value} unavailable={!summary?.total_transaction_value_available} /><Metric label="Collections" value={summary?.total_collections} /><Metric label="Outstanding" value={summary?.total_outstanding_as_of} unavailable={!summary?.total_outstanding_available} balance /></div><div className="dashboard-finance__breakdown"><span>Sales collections {displayMoney(summary?.sales_collections)}</span><span>Service collections {displayMoney(summary?.service_collections)}</span><span>AMC collections {displayMoney(summary?.amc_collections)}</span></div></>}</Card>
}

