import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AmcWizard } from '../features/coverage/components/AmcWizard'
import { useAmcCycle, useCreateAmc } from '../features/coverage/hooks/useCoverage'
import { useEquipmentDetail } from '../features/equipment/hooks/useEquipment'

export function NewAmcPage() { const navigate = useNavigate(); const [params] = useSearchParams(); const equipmentId = params.get('equipmentId'); const renewalId = params.get('renewalId'); const equipment = useEquipmentDetail(equipmentId); const renewal = useAmcCycle(renewalId); const create = useCreateAmc(); async function save(values) { const result = await create.mutateAsync(values); navigate(`/coverage/amc/${result.amc_cycle_id}`, { replace: true }) } return <div className="new-amc-page"><Link className="back-link" to="/coverage"><ArrowLeft size={17} />Coverage</Link><header className="page-heading"><div><span className="eyebrow">{renewalId ? 'Renew AMC' : 'New AMC'}</span><h2>{renewalId ? 'Create a renewal cycle' : 'Create an AMC cycle'}</h2><p>{renewalId ? 'This creates a new cycle; it never changes the existing AMC.' : 'Cycle number, concurrency, overlap checks and retries are handled atomically.'}</p></div></header>{(equipment.isLoading || renewal.isLoading) ? <p className="detail-loading">Loading AMC context…</p> : <AmcWizard initialEquipment={equipment.data ?? renewal.data?.equipment ?? null} renewal={renewal.data ?? null} onSave={save} isSaving={create.isPending} />}</div> }

