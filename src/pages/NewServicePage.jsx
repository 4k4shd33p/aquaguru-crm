import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { NewServiceForm } from '../features/service/components/NewServiceForm'
import { useCreateService } from '../features/service/hooks/useService'
import { useEquipmentDetail } from '../features/equipment/hooks/useEquipment'
export function NewServicePage() { const navigate = useNavigate(); const [params] = useSearchParams(); const equipmentId = params.get('equipmentId'); const equipmentQuery = useEquipmentDetail(equipmentId); const create = useCreateService(); async function submit(values) { const result = await create.mutateAsync(values); navigate(`/service/${result.serviceId}`, { replace: true }) } return <div className="new-service-page"><Link className="back-link" to="/service"><ArrowLeft size={17} />Service</Link><header className="page-heading"><div><span className="eyebrow">New service</span><h2>Create a service</h2><p>Work, coverage and component effects are recorded atomically.</p></div></header><NewServiceForm initialEquipment={equipmentId ? equipmentQuery.data : null} onSubmit={submit} onCancel={() => navigate('/service')} isSubmitting={create.isPending} /></div> }

