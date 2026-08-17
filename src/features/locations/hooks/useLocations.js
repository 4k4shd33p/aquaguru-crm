import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customerKeys } from '../../customers/hooks/useCustomers'
import { createLocation, getCustomerLocations, updateLocation } from '../api/locations'

export const locationKeys = { byCustomer: (customerId) => ['locations', 'customer', customerId] }

export function useCustomerLocations(customerId) {
  return useQuery({ queryKey: locationKeys.byCustomer(customerId), queryFn: () => getCustomerLocations(customerId), enabled: Boolean(customerId) })
}

function useLocationMutation(mutationFn) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn, onSuccess: (_location, variables) => {
    const customerId = variables.customerId
    if (customerId) queryClient.invalidateQueries({ queryKey: locationKeys.byCustomer(customerId) })
    queryClient.invalidateQueries({ queryKey: customerKeys.all })
  } })
}

export function useCreateLocation() { return useLocationMutation(createLocation) }

export function useUpdateLocation() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: updateLocation, onSuccess: (_location, variables) => {
    queryClient.invalidateQueries({ queryKey: locationKeys.byCustomer(variables.customerId) })
    queryClient.invalidateQueries({ queryKey: customerKeys.all })
  } })
}
