import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCustomer, findCustomersByPhone, getCustomerById, getCustomers, getCustomerTypes, updateCustomer } from '../api/customers'

export const customerKeys = {
  all: ['customers'],
  list: (filters) => ['customers', 'list', filters],
  detail: (customerId) => ['customers', 'detail', customerId],
  types: ['customer-types'],
  duplicatePhone: (phone, customerId) => ['customers', 'duplicate-phone', phone, customerId],
}

export function useCustomers(filters) {
  return useQuery({ queryKey: customerKeys.list(filters), queryFn: () => getCustomers(filters), placeholderData: (previous) => previous })
}

export function useCustomer(customerId) {
  return useQuery({ queryKey: customerKeys.detail(customerId), queryFn: () => getCustomerById(customerId), enabled: Boolean(customerId) })
}

export function useCustomerTypes() {
  return useQuery({ queryKey: customerKeys.types, queryFn: getCustomerTypes, staleTime: 10 * 60 * 1000 })
}

export function useDuplicatePhone(phone, customerId) {
  return useQuery({ queryKey: customerKeys.duplicatePhone(phone, customerId), queryFn: () => findCustomersByPhone(phone, customerId), enabled: phone.trim().length > 0, staleTime: 30 * 1000 })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: createCustomer, onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.all }) })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateCustomer,
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
      queryClient.setQueryData(customerKeys.detail(customer.id), customer)
    },
  })
}
