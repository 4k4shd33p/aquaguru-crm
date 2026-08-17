import { AlertCircle } from 'lucide-react'
import { Card } from '../../../components/ui/Card'

export function DashboardListCard({ title, description, query, emptyText, children, className = '' }) {
  const items = query.data ?? []
  return <Card className={`dashboard-list-card ${className}`.trim()}><header><div><h3>{title}</h3>{description && <p>{description}</p>}</div></header>{query.isLoading ? <p className="dashboard-card-state">Loading…</p> : query.isError ? <p className="dashboard-card-state dashboard-card-state--error"><AlertCircle size={15} />Could not load this section.</p> : !items.length ? <p className="dashboard-card-state">{emptyText}</p> : <div className="dashboard-list">{items.map(children)}</div>}</Card>
}

