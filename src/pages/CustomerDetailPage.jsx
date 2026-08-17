import { ArrowLeft, MapPin, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { CustomerForm, customerSaveMessage } from '../features/customers/components/CustomerForm'
import { CustomerOverview } from '../features/customers/components/CustomerOverview'
import { useCustomer, useUpdateCustomer } from '../features/customers/hooks/useCustomers'
import { LocationForm, locationSaveMessage } from '../features/locations/components/LocationForm'
import { LocationList } from '../features/locations/components/LocationList'
import { useCreateLocation, useCustomerLocations, useUpdateLocation } from '../features/locations/hooks/useLocations'
import { CustomerEquipmentSection } from '../features/equipment/components/CustomerEquipmentSection'
import { useCustomerEquipment } from '../features/equipment/hooks/useEquipment'

export function CustomerDetailPage() {
  const { customerId } = useParams()
  const customerQuery = useCustomer(customerId)
  const locationsQuery = useCustomerLocations(customerId)
  const equipmentQuery = useCustomerEquipment(customerId)
  const updateCustomer = useUpdateCustomer()
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation()
  const [customerEditorOpen, setCustomerEditorOpen] = useState(false)
  const [locationEditor, setLocationEditor] = useState(null)
  const [formError, setFormError] = useState('')

  if (customerQuery.isLoading) return <div className="detail-loading">Loading customer…</div>
  if (customerQuery.isError || !customerQuery.data) return <ErrorState title="Customer could not be loaded" description="The customer may be unavailable or you may not have access." />
  const customer = customerQuery.data

  async function saveCustomer(values) { setFormError(''); try { await updateCustomer.mutateAsync({ customerId, values }); setCustomerEditorOpen(false) } catch (error) { setFormError(customerSaveMessage(error)) } }
  async function saveLocation(values) { setFormError(''); try { if (locationEditor?.id) await updateLocation.mutateAsync({ locationId: locationEditor.id, customerId, values }); else await createLocation.mutateAsync({ customerId, values }); setLocationEditor(null) } catch (error) { setFormError(locationSaveMessage(error)) } }
  const openLocationEditor = (location = {}) => { setFormError(''); setLocationEditor(location) }

  return <div className="customer-detail"><Link className="back-link" to="/customers"><ArrowLeft size={17} />Customers</Link><header className="customer-detail__header"><div><span className="eyebrow">Customer</span><h2>{customer.name}</h2><p>{customer.customer_code} <span>·</span> {customer.customer_types?.name || 'Customer type not recorded'}</p><div className="customer-detail__contact">{customer.phone || 'Phone not recorded'}</div></div><div className="customer-detail__actions"><Badge tone={customer.is_active ? 'success' : 'neutral'}>{customer.is_active ? 'Active' : 'Inactive'}</Badge><Button variant="secondary" onClick={() => { setFormError(''); setCustomerEditorOpen(true) }}><Pencil size={16} />Edit Customer</Button><Button onClick={() => openLocationEditor()}><Plus size={16} />Add Location</Button></div></header><div className="customer-detail__layout"><CustomerOverview customer={customer} /><CustomerEquipmentSection customer={customer} equipment={equipmentQuery.data ?? []} isLoading={equipmentQuery.isLoading} />{locationsQuery.isError ? <ErrorState title="Locations could not be loaded" description="Please refresh and try again." /> : <LocationList locations={locationsQuery.data ?? []} isLoading={locationsQuery.isLoading} onAdd={() => openLocationEditor()} onEdit={openLocationEditor} />}</div>
    {customerEditorOpen && <Modal title="Edit customer" description="Customer code cannot be changed." onClose={() => setCustomerEditorOpen(false)}>{formError && <p className="form-message" role="alert">{formError}</p>}<CustomerForm customer={customer} onCancel={() => setCustomerEditorOpen(false)} onSave={saveCustomer} isSaving={updateCustomer.isPending} /></Modal>}
    {locationEditor && <Modal title={locationEditor.id ? 'Edit location' : 'Add location'} description="This location will be linked to the current customer." onClose={() => setLocationEditor(null)}>{formError && <p className="form-message" role="alert">{formError}</p>}<LocationForm location={locationEditor.id ? locationEditor : undefined} onCancel={() => setLocationEditor(null)} onSave={saveLocation} isSaving={createLocation.isPending || updateLocation.isPending} /></Modal>}
  </div>
}

