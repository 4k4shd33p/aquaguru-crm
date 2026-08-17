import { ArrowLeft, MapPin, Pencil, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { EquipmentComponents } from '../features/equipment/components/EquipmentComponents'
import { EquipmentForm } from '../features/equipment/components/EquipmentForm'
import { useDecommissionEquipment, useEquipmentComponents, useEquipmentDetail, useUpdateEquipment } from '../features/equipment/hooks/useEquipment'
import { equipmentSaveMessage } from '../features/equipment/validation/equipmentValidation'
import { equipmentStatusTone, locationLabel, recorded } from '../features/equipment/utils/equipmentDisplay'

function DetailItem({ label, value }) { return <div className="detail-item"><div><span>{label}</span><strong>{value || 'Not recorded'}</strong></div></div> }

export function EquipmentDetailPage() {
  const { equipmentId } = useParams()
  const navigate = useNavigate()
  const equipmentQuery = useEquipmentDetail(equipmentId)
  const componentsQuery = useEquipmentComponents(equipmentId)
  const updateEquipment = useUpdateEquipment()
  const decommission = useDecommissionEquipment()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDecommissionOpen, setIsDecommissionOpen] = useState(false)
  const [formError, setFormError] = useState('')

  if (equipmentQuery.isLoading) return <div className="detail-loading">Loading equipment…</div>
  if (equipmentQuery.isError || !equipmentQuery.data) return <ErrorState title="Equipment could not be loaded" description="The equipment may be unavailable or you may not have access." />
  const equipment = equipmentQuery.data
  const saleOrigin = equipment.sale_items?.sales
  async function saveEquipment(values) { setFormError(''); try { await updateEquipment.mutateAsync({ equipmentId, values, previousCustomerId: equipment.customer_id }); setIsEditOpen(false) } catch (error) { setFormError(equipmentSaveMessage(error)) } }
  async function confirmDecommission() { setFormError(''); try { await decommission.mutateAsync(equipmentId); setIsDecommissionOpen(false) } catch { setFormError('Equipment could not be decommissioned. Please try again.') } }

  return <div className="equipment-detail"><Link className="back-link" to="/equipment"><ArrowLeft size={17} />Equipment</Link><header className="customer-detail__header"><div><span className="eyebrow">Equipment</span><h2>{equipment.equipment_code}</h2><p>{recorded(equipment.equipment_types?.name)} <span>·</span> {recorded(equipment.product_models?.model_name)}</p><div className="customer-detail__contact">{equipment.serial_number ? `Serial number: ${equipment.serial_number}` : 'Serial number not recorded'}</div></div><div className="customer-detail__actions"><Badge tone={equipmentStatusTone(equipment.status)}>{equipment.status}</Badge><Button variant="secondary" onClick={() => { setFormError(''); setIsEditOpen(true) }}><Pencil size={16} />Edit Equipment</Button>{equipment.status !== 'Decommissioned' && <Button variant="secondary" onClick={() => { setFormError(''); setIsDecommissionOpen(true) }}>Decommission</Button>}</div></header><div className="equipment-detail__layout"><Card className="equipment-overview"><div className="section-heading"><div><h2>Overview</h2><p>Core equipment information.</p></div></div><div className="customer-overview__grid"><DetailItem label="Equipment type" value={equipment.equipment_types?.name} /><DetailItem label="Product model" value={equipment.product_models?.model_name} /><DetailItem label="Source" value={equipment.source} />{saleOrigin && <><DetailItem label="Origin" value="Aquaguru Sale" /><DetailItem label="Sale" value={<Link className="table-view-link" to={`/sales/${saleOrigin.id}`}>{saleOrigin.sale_code}</Link>} /></>}<DetailItem label="Serial number" value={equipment.serial_number} /><DetailItem label="Customer" value={<Link className="table-view-link" to={`/customers/${equipment.customer_id}`}><UserRound size={15} />{recorded(equipment.customers?.name)}</Link>} /><DetailItem label="Location" value={<span className="equipment-location"><MapPin size={15} />{locationLabel(equipment.locations)}</span>} /><DetailItem label="Notes" value={equipment.notes} /></div></Card><EquipmentComponents components={componentsQuery.data ?? []} isLoading={componentsQuery.isLoading} /></div>
    {isEditOpen && <Modal title="Edit equipment" description="Equipment code cannot be changed." onClose={() => setIsEditOpen(false)}>{formError && <p className="form-message" role="alert">{formError}</p>}<EquipmentForm equipment={equipment} onCancel={() => setIsEditOpen(false)} onSave={saveEquipment} isSaving={updateEquipment.isPending} /></Modal>}
    {isDecommissionOpen && <Modal title="Decommission equipment" description="This safely marks the equipment as decommissioned." onClose={() => setIsDecommissionOpen(false)}>{formError && <p className="form-message" role="alert">{formError}</p>}<div className="crm-form"><p className="decommission-copy">Sales, service, and component history will remain preserved. This equipment will no longer be active.</p><div className="form-actions"><Button variant="secondary" onClick={() => setIsDecommissionOpen(false)} disabled={decommission.isPending}>Cancel</Button><Button onClick={confirmDecommission} disabled={decommission.isPending}>{decommission.isPending ? 'Decommissioning…' : 'Decommission equipment'}</Button></div></div></Modal>}
  </div>
}
