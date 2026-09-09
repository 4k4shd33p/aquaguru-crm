import { History, MapPin, MoveRight } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { useEquipmentLocationHistory } from '../hooks/useEquipment'
import { formatDate, locationLabel } from '../utils/equipmentDisplay'

function dateLabel(movement) {
  return movement.movement_date ? formatDate(movement.movement_date) : 'Date not recorded'
}

function sourceLabel(movement) {
  if (movement.source_service?.service_code) return `Service ${movement.source_service.service_code}`
  return movement.source || null
}

export function EquipmentLocationHistory({ equipmentId }) {
  const historyQuery = useEquipmentLocationHistory(equipmentId)
  if (historyQuery.isLoading) return <Card className="equipment-location-history"><p className="detail-loading">Loading location history…</p></Card>
  if (historyQuery.isError) return <Card className="equipment-location-history"><p className="component-empty">Location history could not be loaded. Please refresh and try again.</p></Card>
  const movements = historyQuery.data ?? []

  return <Card className="equipment-location-history">
    <div className="section-heading"><div><h2>Location history</h2><p>Known movements are retained while the overview shows the current location.</p></div><History size={18} /></div>
    {movements.length ? <div className="location-history-list">{movements.map((movement) => <article className="location-history-item" key={movement.id}>
      <div className="location-history-item__date">{dateLabel(movement)}</div>
      <div className="location-history-item__move"><span><MapPin size={15} />{locationLabel(movement.old_location)}</span><MoveRight size={17} /><span><MapPin size={15} />{locationLabel(movement.new_location)}</span></div>
      {(sourceLabel(movement) || movement.notes) && <div className="location-history-item__details">{sourceLabel(movement) && <small>{sourceLabel(movement)}</small>}{movement.notes && <small>{movement.notes}</small>}</div>
    </article>)}</div> : <p className="component-empty">No known location moves have been recorded.</p>}
  </Card>
}
