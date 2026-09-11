import { Boxes, CalendarClock, Plus, Wrench } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { useEquipmentOperationalSummaries } from '../hooks/useEquipment'
import { equipmentStatusTone, formatDate, locationLabel } from '../utils/equipmentDisplay'

function coverageSummary(summary) {
  if (summary?.amc) return `${summary.amc.amc_code} · Active through ${formatDate(summary.amc.end_date)}`
  if (summary?.warranty) return `Warranty · Active through ${formatDate(summary.warranty.end_date)}`
  return 'No active warranty or AMC'
}

export function CustomerEquipmentSection({ customer, equipment, isLoading }) {
  const navigate = useNavigate()
  const summaries = useEquipmentOperationalSummaries(equipment.map((item) => item.id))
  return <Card className="customer-equipment"><div className="section-heading"><div><h2>Equipment</h2><p>Operational units recorded for this customer.</p></div><Button onClick={() => navigate('/equipment', { state: { createForCustomer: customer } })}><Plus size={16} />Add Existing Equipment</Button></div>{isLoading || summaries.isLoading ? <p className="detail-loading">Loading equipment context…</p> : equipment.length ? <div className="customer-equipment__list">{equipment.map((item) => {
    const summary = summaries.data?.get(item.id)
    return <article key={item.id} className="customer-equipment__item"><div><Link to={`/equipment/${item.id}`}><strong>{item.equipment_code}</strong></Link><span>{item.equipment_types?.name || 'Type not recorded'} · {item.product_models?.model_name || 'Model not recorded'}</span><small>{locationLabel(item.locations)} · {item.source || 'Source not recorded'}</small><small>{coverageSummary(summary)}</small>{summary?.latestService && <small><Wrench size={13} />Last service: {summary.latestService.service_code} · {formatDate(summary.latestService.service_date)}</small>}{summary?.recommendedNextService && <small><CalendarClock size={13} />Recommended next service: {formatDate(summary.recommendedNextService)} · reminder only</small>}</div><div className="customer-equipment__actions"><Badge tone={equipmentStatusTone(item.status)}>{item.status}</Badge><Link to={`/service/new?equipmentId=${item.id}`}><Button type="button" variant="secondary">New Service</Button></Link></div></article>
  })}</div> : <div className="customer-equipment__empty"><Boxes size={20} /><span>This customer has no equipment recorded.</span></div>}</Card>
}
