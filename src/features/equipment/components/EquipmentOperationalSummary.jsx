import { CalendarClock, CircleDollarSign, ShieldCheck, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { formatDate } from '../utils/equipmentDisplay'

function coverage(summary) {
  if (summary?.amc) return <Link to={`/coverage/amc/${summary.amc.id}`}><strong>{summary.amc.amc_code}</strong><span>Active · through {formatDate(summary.amc.end_date)}</span></Link>
  if (summary?.warranty) return <Link to={`/coverage/warranties/${summary.warranty.id}`}><strong>{summary.warranty.warranty_code}</strong><span>Active · through {formatDate(summary.warranty.end_date)}</span></Link>
  return <span>No active warranty or AMC</span>
}

export function EquipmentOperationalSummary({ equipment, summary, isLoading }) {
  if (isLoading) return <Card className="equipment-operational-summary"><p>Loading operational context…</p></Card>
  const installation = summary?.initialInstallation
  const service = summary?.latestService
  const previousAmcs = (summary?.amcHistory ?? []).filter((row) => row.id !== summary?.amc?.id).slice(0, 3)
  return <Card className="equipment-operational-summary"><div className="section-heading"><div><h2>Operational context</h2><p>Current coverage, latest activity, and the next recommended contact.</p></div></div><div className="equipment-operational-summary__grid"><section><ShieldCheck size={18} /><div><span>Current coverage</span>{coverage(summary)}</div></section><section><Wrench size={18} /><div><span>Most recent service</span>{service ? <Link to={`/service/${service.id}`}><strong>{service.service_code}</strong><small>{formatDate(service.service_date)} · {service.service_types?.name || 'Service'}{service.coverage_context ? ` · ${service.coverage_context}` : ''}</small></Link> : <strong>Not recorded</strong>}</div></section><section><CalendarClock size={18} /><div><span>Recommended next service</span><strong>{summary?.recommendedNextService ? formatDate(summary.recommendedNextService) : 'Not recorded'}</strong><small>Reminder only — not a booked appointment.</small></div></section><section><CircleDollarSign size={18} /><div><span>Origin and installation</span><strong>{equipment.source || 'Source not recorded'}</strong>{installation ? <Link to={`/installations/${installation.id}`}><small>Initial Installation: {formatDate(installation.installation_date)}</small></Link> : <small>Initial Installation not completed or not recorded.</small>}</div></section></div>{previousAmcs.length > 0 && <div className="equipment-operational-summary__history"><span>Earlier AMC cycles</span>{previousAmcs.map((cycle) => <Link key={cycle.id} to={`/coverage/amc/${cycle.id}`}><Badge tone={cycle.effective_status === 'Active' ? 'success' : 'neutral'}>{cycle.effective_status}</Badge>{cycle.amc_code} · through {formatDate(cycle.end_date)}</Link>)}</div>}</Card>
}
