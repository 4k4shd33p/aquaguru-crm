import { MapPin, Pencil, Plus } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/feedback/EmptyState'

function locationAddress(location) { return [location.address, location.area, location.city, location.pincode].filter(Boolean).join(', ') || 'Not recorded' }

export function LocationList({ locations, isLoading, onAdd, onEdit }) {
  return <Card className="location-list"><div className="section-heading"><div><h2>Locations</h2><p>Addresses and places linked to this customer.</p></div><Button onClick={onAdd}><Plus size={17} />Add Location</Button></div>{isLoading ? <div className="location-loading">Loading locations…</div> : locations.length === 0 ? <EmptyState icon={MapPin} title="No locations recorded for this customer." description="Add a location to keep customer addresses organized." action={<Button onClick={onAdd}><Plus size={16} />Add Location</Button>} /> : <div className="location-list__grid">{locations.map((location) => <article className="location-card" key={location.id}><div className="location-card__heading"><span className="location-icon"><MapPin size={18} /></span><div><h3>{location.location_name || 'Unnamed location'}</h3><small>{location.location_code}</small></div><Badge tone={location.is_active ? 'success' : 'neutral'}>{location.is_active ? 'Active' : 'Inactive'}</Badge></div><p>{locationAddress(location)}</p>{location.notes && <p className="location-card__notes">{location.notes}</p>}<button className="location-edit" onClick={() => onEdit(location)}><Pencil size={15} />Edit location</button></article>)}</div>}</Card>
}
