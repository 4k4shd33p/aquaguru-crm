import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { InstallationWizard } from '../features/installations/components/InstallationWizard'
import { useCreateInstallation } from '../features/installations/hooks/useInstallations'
import { useEquipmentDetail } from '../features/equipment/hooks/useEquipment'
import { installationError } from '../features/installations/utils/installationDisplay'
export function NewInstallationPage() { const navigate = useNavigate(); const [params] = useSearchParams(); const equipmentId = params.get('equipmentId'); const equipment = useEquipmentDetail(equipmentId); const create = useCreateInstallation(); async function save(values) { try { const result = await create.mutateAsync(values); navigate(`/installations/${result.installation_id}`, { replace: true }) } catch (error) { throw new Error(installationError(error)) } } return <div className="new-installation-page"><Link className="back-link" to="/installations"><ArrowLeft size={17} />Installations</Link><header className="page-heading"><div><span className="eyebrow">New Installation</span><h2>Schedule an Installation</h2><p>Equipment, customer and sale linkage stay traceable throughout the workflow.</p></div></header>{equipment.isLoading ? <p className="detail-loading">Loading Equipment context…</p> : <InstallationWizard initialEquipment={equipment.data ?? null} onSave={save} isSaving={create.isPending} />}</div> }

