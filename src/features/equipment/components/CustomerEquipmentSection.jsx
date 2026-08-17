import { Boxes, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { equipmentStatusTone, locationLabel } from '../utils/equipmentDisplay'

export function CustomerEquipmentSection({ customer, equipment, isLoading }) {
  const navigate = useNavigate()
  return <Card className="customer-equipment"><div className="section-heading"><div><h2>Equipment</h2><p>Equipment recorded for this customer.</p></div><Button onClick={() => navigate('/equipment', { state: { createForCustomer: customer } })}><Plus size={16} />Add Equipment</Button></div>{isLoading ? <p className="detail-loading">Loading equipment…</p> : equipment.length ? <div className="customer-equipment__list">{equipment.map((item) => <Link key={item.id} to={`/equipment/${item.id}`}><div><strong>{item.equipment_code}</strong><span>{item.equipment_types?.name || 'Type not recorded'} · {item.product_models?.model_name || 'Model not recorded'}</span><small>{locationLabel(item.locations)} · {item.source}</small></div><Badge tone={equipmentStatusTone(item.status)}>{item.status}</Badge></Link>)}</div> : <div className="customer-equipment__empty"><Boxes size={20} /><span>This customer has no equipment recorded.</span></div>}</Card>
}

