import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/feedback/EmptyState'
import { date, equipmentLabel, money, statusTone } from '../utils/coverageDisplay'

function Pager({ page, count, onPage }) { const pages = Math.max(1, Math.ceil(count / 25)); return <div className="coverage-pager"><span>{count ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}` : '0 results'}</span><div><Button variant="secondary" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} />Previous</Button><Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight size={16} /></Button></div></div> }

export function CoverageDirectory({ kind, rows, count, page, onPage, isLoading, emptyTitle, emptyDescription }) {
  if (isLoading) return <Card><p className="detail-loading">Loading coverage…</p></Card>
  if (!rows.length) return <Card><EmptyState title={emptyTitle} description={emptyDescription} /></Card>
  const isAmc = kind === 'amc'; const isPart = kind === 'part'
  return <Card className="coverage-directory"><div className="coverage-table"><div className="coverage-table__head"><span>{isAmc ? 'AMC' : isPart ? 'Part warranty' : 'Warranty'}</span><span>Equipment / customer</span><span>Dates</span><span>{isAmc ? 'Totals / visits' : isPart ? 'Part' : 'Visits'}</span><span>Status</span></div>{rows.map((row) => { const link = isAmc ? `/coverage/amc/${row.id}` : isPart ? `/coverage/part-warranties/${row.id}` : `/coverage/warranties/${row.id}`; const code = row.amc_code ?? row.part_warranty_code ?? row.warranty_code; const equipment = row.equipment; const status = isAmc ? (row.effective_status ?? row.status) : row.status; return <Link key={row.id} className="coverage-table__row" to={link}><strong>{code}<ExternalLink size={14} /></strong><div><b>{equipmentLabel(equipment)}</b><small>{equipment?.customers?.name ?? 'Customer unavailable'} · {equipment?.product_models?.model_name ?? 'Model not recorded'}</small></div><div><b>{date(row.start_date)}</b><small>to {date(row.end_date)}</small></div><div>{isAmc ? <><b>{row.totals?.agreed === null ? 'Charge unavailable' : money(row.totals?.agreed)}</b><small>{money(row.totals?.collected)} collected · {(row.services ?? []).length} visits</small></> : isPart ? <><b>{row.parts?.name ?? 'Part unavailable'}</b><small>{row.duration_months} months</small></> : <><b>{row.planned_visits} planned</b><small>{(row.services ?? []).length} actual visits</small></>}</div><Badge tone={statusTone(status)}>{status}</Badge></Link> })}</div><Pager page={page} count={count} onPage={onPage} /></Card>
}

