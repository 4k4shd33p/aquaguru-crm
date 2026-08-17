import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addEmiPayment, addSalePayment, createAtomicSale, createEmiAccount, getActiveCustomerLocations, getCustomerSales, getSale, getSaleLookups, getSales, searchSaleCustomers } from '../api/sales'

export const saleKeys = { all: ['sales'], list: (filters) => ['sales', 'list', filters], detail: (id) => ['sales', 'detail', id], lookups: ['sales', 'lookups'], customers: (term) => ['sales', 'customers', term], locations: (id) => ['sales', 'locations', id], customer: (id) => ['sales', 'customer', id] }
export const useSales = (filters) => useQuery({ queryKey: saleKeys.list(filters), queryFn: () => getSales(filters), placeholderData: (previous) => previous })
export const useSale = (id) => useQuery({ queryKey: saleKeys.detail(id), queryFn: () => getSale(id), enabled: Boolean(id) })
export const useSaleLookups = () => useQuery({ queryKey: saleKeys.lookups, queryFn: getSaleLookups, staleTime: 10 * 60 * 1000 })
export const useSaleCustomerSearch = (term) => useQuery({ queryKey: saleKeys.customers(term), queryFn: () => searchSaleCustomers(term), enabled: term.trim().length > 1, staleTime: 30 * 1000 })
export const useSaleCustomerLocations = (id) => useQuery({ queryKey: saleKeys.locations(id), queryFn: () => getActiveCustomerLocations(id), enabled: Boolean(id), staleTime: 60 * 1000 })
export const useCustomerSales = (id) => useQuery({ queryKey: saleKeys.customer(id), queryFn: () => getCustomerSales(id), enabled: Boolean(id) })
function mutation(mutationFn) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: saleKeys.all })
      if (variables?.saleId) queryClient.invalidateQueries({ queryKey: saleKeys.detail(variables.saleId) })
      if (variables?.customerId) {
        queryClient.invalidateQueries({ queryKey: saleKeys.customer(variables.customerId) })
        queryClient.invalidateQueries({ queryKey: ['equipment', 'customer', variables.customerId] })
        queryClient.invalidateQueries({ queryKey: ['equipment'] })
      }
    },
  })
}
export const useCreateSale = () => mutation(createAtomicSale)
export const useAddSalePayment = () => mutation(addSalePayment)
export const useCreateEmiAccount = () => mutation(createEmiAccount)
export const useAddEmiPayment = () => mutation(addEmiPayment)
