import { Plus, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState'
import { Modal } from '../components/ui/Modal'
import { CustomerForm, customerSaveMessage } from '../features/customers/components/CustomerForm'
import { CustomerList } from '../features/customers/components/CustomerList'
import { useCustomers, useCreateCustomer, useCustomerLocationFilterOptions, useCustomerTypes } from '../features/customers/hooks/useCustomers'
import { useDebouncedValue } from '../features/customers/hooks/useDebouncedValue'

export function CustomersPage() {
  const navigate = useNavigate()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [filters, setFilters] = useState({ page: 1, pageSize: 25, search: '', customerTypeId: '', status: '', city: '', area: '' })
  const debouncedSearch = useDebouncedValue(filters.search)
  const queryFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch])
  const customersQuery = useCustomers(queryFilters)
  const typesQuery = useCustomerTypes()
  const locationFilterOptionsQuery = useCustomerLocationFilterOptions(filters.city)
  const createCustomer = useCreateCustomer()

  async function saveCustomer(values) { setFormError(''); try { const customer = await createCustomer.mutateAsync(values); setIsCreateOpen(false); navigate(`/customers/${customer.id}`) } catch (error) { setFormError(customerSaveMessage(error)) } }

  function updateFilters(changes) {
    setFilters((current) => ({ ...current, ...changes, ...(Object.hasOwn(changes, 'city') ? { area: '' } : {}) }))
  }

  return <div className="customers-page"><div className="page-heading"><div><span className="eyebrow">Customers</span><h2>Customer directory</h2><p>Manage the people and organizations Aquaguru serves.</p></div><span className="page-heading__count"><UsersRound size={17} />{customersQuery.data?.count ?? 0} customers</span></div>{customersQuery.isError ? <ErrorState title="Customers could not be loaded" description="Please refresh and try again." /> : <CustomerList customers={customersQuery.data?.customers ?? []} total={customersQuery.data?.count ?? 0} isLoading={customersQuery.isLoading || customersQuery.isFetching && !customersQuery.data} filters={{ ...filters, customerTypes: typesQuery.data ?? [], cities: locationFilterOptionsQuery.data?.cities ?? [], areas: locationFilterOptionsQuery.data?.areas ?? [], locationFiltersLoading: locationFilterOptionsQuery.isLoading }} onFilterChange={updateFilters} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onNewCustomer={() => { setFormError(''); setIsCreateOpen(true) }} />}{isCreateOpen && <Modal title="New customer" description="Customer codes are generated automatically." onClose={() => setIsCreateOpen(false)}>{formError && <p className="form-message" role="alert">{formError}</p>}<CustomerForm onCancel={() => setIsCreateOpen(false)} onSave={saveCustomer} isSaving={createCustomer.isPending} /></Modal>}</div>
}

