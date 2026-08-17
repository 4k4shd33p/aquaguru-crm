import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { date, tone } from '../utils/installationDisplay'
import { useEquipmentInstallationHistory } from '../hooks/useInstallations'
export function EquipmentInstallationHistory({ equipmentId }) { const query = useEquipmentInstallationHistory(equipmentId); const rows = query.data ?? []; return <Card className="equipment-installation-history"><div className="section-heading"><div><h2>Installations</h2><p>Latest Installation and relocation history.</p></div><Link to={`/installations/new?equipmentId=${encodeURIComponent(equipmentId)}`}><Button><Plus size={16} />New Installation</Button></Link></div>{query.isLoading ? <p>Loading installation history…</p> : rows.length ? <div className="equipment-installation-history__rows">{rows.map((item) => <Link key={item.id} to={`/installations/${item.id}`}><div><strong>{item.installation_code}</strong><span>{item.installation_classification}</span></div><div><span>{item.installation_date ? `Completed ${date(item.installation_date)}` : `Scheduled ${date(item.scheduled_date)}`}</span><Badge tone={tone(item.status)}>{item.status}</Badge></div></Link>)}</div> : <p className="coverage-empty-copy">No installation history is recorded for this equipment.</p>}</Card> }

