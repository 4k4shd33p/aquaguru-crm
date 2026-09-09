import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEquipment, decommissionEquipment, getCustomerEquipment, getEquipmentById, getEquipmentComponents, getEquipmentCustomerLocations, getEquipmentList, getEquipmentTypes, getProductModels, getTrackedComponentParts, recordExistingComponent, searchEquipmentCustomers, updateEquipment } from '../api/equipment'

export const equipmentKeys = {
  all: ['equipment'],
  list: (filters) => ['equipment', 'list', filters],
  detail: (equipmentId) => ['equipment', 'detail', equipmentId],
  types: ['equipment', 'types'],
  productModels: (typeId) => ['equipment', 'product-models', typeId || 'all'],
  customerLookup: (term) => ['equipment', 'customer-lookup', term],
  customerLocations: (customerId) => ['equipment', 'customer-locations', customerId],
  components: (equipmentId) => ['equipment', 'components', equipmentId],
  componentParts: ['equipment', 'component-parts'],
  byCustomer: (customerId) => ['equipment', 'customer', customerId],
}

export function useEquipment(filters) { return useQuery({ queryKey: equipmentKeys.list(filters), queryFn: () => getEquipmentList(filters), placeholderData: (previous) => previous }) }
export function useEquipmentDetail(equipmentId) { return useQuery({ queryKey: equipmentKeys.detail(equipmentId), queryFn: () => getEquipmentById(equipmentId), enabled: Boolean(equipmentId) }) }
export function useEquipmentTypes() { return useQuery({ queryKey: equipmentKeys.types, queryFn: getEquipmentTypes, staleTime: 10 * 60 * 1000 }) }
export function useProductModels(typeId) { return useQuery({ queryKey: equipmentKeys.productModels(typeId), queryFn: () => getProductModels(typeId), staleTime: 10 * 60 * 1000 }) }
export function useEquipmentCustomerSearch(term) { return useQuery({ queryKey: equipmentKeys.customerLookup(term), queryFn: () => searchEquipmentCustomers(term), enabled: term.trim().length > 1, staleTime: 30 * 1000 }) }
export function useEquipmentCustomerLocations(customerId) { return useQuery({ queryKey: equipmentKeys.customerLocations(customerId), queryFn: () => getEquipmentCustomerLocations(customerId), enabled: Boolean(customerId), staleTime: 60 * 1000 }) }
export function useEquipmentComponents(equipmentId) { return useQuery({ queryKey: equipmentKeys.components(equipmentId), queryFn: () => getEquipmentComponents(equipmentId), enabled: Boolean(equipmentId) }) }
export function useTrackedComponentParts() { return useQuery({ queryKey: equipmentKeys.componentParts, queryFn: getTrackedComponentParts, staleTime: 5 * 60 * 1000 }) }
export function useCustomerEquipment(customerId) { return useQuery({ queryKey: equipmentKeys.byCustomer(customerId), queryFn: () => getCustomerEquipment(customerId), enabled: Boolean(customerId) }) }

function useEquipmentMutation(mutationFn) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (equipment, variables) => {
      const previousCustomerId = variables?.previousCustomerId
      queryClient.invalidateQueries({ queryKey: equipmentKeys.all })
      queryClient.invalidateQueries({ queryKey: equipmentKeys.detail(equipment.id) })
      queryClient.invalidateQueries({ queryKey: equipmentKeys.byCustomer(equipment.customer_id) })
      if (previousCustomerId && previousCustomerId !== equipment.customer_id) queryClient.invalidateQueries({ queryKey: equipmentKeys.byCustomer(previousCustomerId) })
    },
  })
}

export function useCreateEquipment() { return useEquipmentMutation(createEquipment) }
export function useUpdateEquipment() { return useEquipmentMutation(updateEquipment) }
export function useDecommissionEquipment() { return useEquipmentMutation(decommissionEquipment) }

export function useRecordExistingComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: recordExistingComponent,
    onSuccess: (_component, variables) => {
      queryClient.invalidateQueries({ queryKey: equipmentKeys.components(variables.equipmentId) })
    },
  })
}
