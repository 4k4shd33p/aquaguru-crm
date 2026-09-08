import { ClipboardList, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { useEquipmentServices } from '../hooks/useService'
import { formatCurrency, formatDate, serviceStatusTone } from '../utils/serviceDisplay'
import { Badge } from '../../../components/ui/Badge'
export function EquipmentServiceHistory({ equipmentId }) { const query = useEquipmentServices(equipmentId); const navigate = useNavigate(); const services = query.data ?? []; return <Card className="component-history"><div className="section-heading"><div><h2>Service history</h2><p>Latest ten services recorded for this equipment.</p></div><Button onClick={() => navigate(`/service/new?equipmentId=${equipmentId}`)}><Plus size={16} />New Service</Button></div>{query.isLoading ? <p>Loading service history…</p> : services.length ? <div className="equipment-service-history">{services.map((service) => <Link key={service.id} to={`/service/${service.id}`}><div><strong>{service.service_code}</strong><span>{service.service_types?.name || 'Service'} · {formatDate(service.service_date)}</span><small>{service.totals.chargeKnown ? `Service value ${formatCurrency(service.totals.total)}` : 'Customer charge not set'}</small></div><Badge tone={serviceStatusTone(service.status)}>{service.status}</Badge></Link>)}</div> : <p className="component-empty"><ClipboardList size={17} />No service history has been recorded.</p>}</Card> }

