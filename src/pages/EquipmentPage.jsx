import { Boxes, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState'
import { Modal } from '../components/ui/Modal'
import { EquipmentForm } from '../features/equipment/components/EquipmentForm'
import { EquipmentList } from '../features/equipment/components/EquipmentList'
import { useCreateEquipment, useEquipment, useEquipmentTypes } from '../features/equipment/hooks/useEquipment'
import { equipmentSaveMessage } from '../features/equipment/validation/equipmentValidation'
import { useDebouncedValue } from '../features/customers/hooks/useDebouncedValue'

export function EquipmentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [prefilledCustomer, setPrefilledCustomer] = useState(location.state?.createForCustomer || null)
  const [isCreateOpen, setIsCreateOpen] = useState(Boolean(location.state?.createForCustomer))
  const [formError, setFormError] = useState('')
  const [filters, setFilters] = useState({ page: 1, pageSize: 25, search: '', equipmentTypeId: '', source: '', status: '' })
  const debouncedSearch = useDebouncedValue(filters.search)
  const queryFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch])
  const equipmentQuery = useEquipment(queryFilters)
  const typesQuery = useEquipmentTypes()
  const createEquipment = useCreateEquipment()
  function updateFilters(changes) { setFilters((current) => ({ ...current, ...changes })) }
  async function saveEquipment(values) { setFormError(''); try { const equipment = await createEquipment.mutateAsync(values); setIsCreateOpen(false); navigate(`/equipment/${equipment.id}`) } catch (error) { setFormError(equipmentSaveMessage(error)) } }
  const openCreate = () => { setFormError(''); setPrefilledCustomer(null); setIsCreateOpen(true) }

  return <div className="equipment-page"><div className="page-heading"><div><span className="eyebrow">Equipment</span><h2>Equipment directory</h2><p>Track customer equipment and its current tracked components.</p></div><span className="page-heading__count"><Boxes size={17} />{equipmentQuery.data?.count ?? 0} equipment</span></div>{equipmentQuery.isError ? <ErrorState title="Equipment could not be loaded" description="Please refresh and try again." /> : <EquipmentList equipment={equipmentQuery.data?.equipment ?? []} total={equipmentQuery.data?.count ?? 0} isLoading={equipmentQuery.isLoading || equipmentQuery.isFetching && !equipmentQuery.data} filters={filters} types={typesQuery.data ?? []} onFilterChange={updateFilters} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onNewEquipment={openCreate} />}{isCreateOpen && <Modal title="Add Existing Equipment" description="Use this for equipment not created from a new Aquaguru Sale. Equipment codes are generated automatically." onClose={() => setIsCreateOpen(false)}>{formError && <p className="form-message" role="alert">{formError}</p>}<EquipmentForm initialCustomer={prefilledCustomer} onCancel={() => setIsCreateOpen(false)} onSave={saveEquipment} isSaving={createEquipment.isPending} /></Modal>}</div>
}


