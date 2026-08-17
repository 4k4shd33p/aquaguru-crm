import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addServicePayment, createAtomicService, getEquipmentCoverage, getEquipmentServices, getPartWarranties, getService, getServiceLookups, getServices, searchServiceEquipment } from '../api/service'

export const serviceKeys = { all: ['service'], list: (filters) => ['service', 'list', filters], detail: (id) => ['service', 'detail', id], lookups: ['service', 'lookups'], equipmentSearch: (term) => ['service', 'equipment-search', term], coverage: (id, date) => ['service', 'coverage', id, date], partWarranty: (equipmentId, partId, date) => ['service', 'part-warranty', equipmentId, partId, date], equipmentHistory: (id) => ['service', 'equipment-history', id] }
export const useServices = (filters) => useQuery({ queryKey: serviceKeys.list(filters), queryFn: () => getServices(filters), placeholderData: (previous) => previous })
export const useService = (id) => useQuery({ queryKey: serviceKeys.detail(id), queryFn: () => getService(id), enabled: Boolean(id) })
export const useServiceLookups = () => useQuery({ queryKey: serviceKeys.lookups, queryFn: getServiceLookups, staleTime: 10 * 60 * 1000 })
export const useServiceEquipmentSearch = (term) => useQuery({ queryKey: serviceKeys.equipmentSearch(term), queryFn: () => searchServiceEquipment(term), enabled: term.trim().length > 1, staleTime: 30 * 1000 })
export const useEquipmentCoverage = (id, date) => useQuery({ queryKey: serviceKeys.coverage(id, date), queryFn: () => getEquipmentCoverage(id, date), enabled: Boolean(id && date), staleTime: 60 * 1000 })
export const usePartWarranties = (equipmentId, partId, date) => useQuery({ queryKey: serviceKeys.partWarranty(equipmentId, partId, date), queryFn: () => getPartWarranties(equipmentId, partId, date), enabled: Boolean(equipmentId && partId && date), staleTime: 30 * 1000 })
export const useEquipmentServices = (id) => useQuery({ queryKey: serviceKeys.equipmentHistory(id), queryFn: () => getEquipmentServices(id), enabled: Boolean(id) })
function mutation(mutationFn) { const queryClient = useQueryClient(); return useMutation({ mutationFn, onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: serviceKeys.all }); if (variables?.serviceId) queryClient.invalidateQueries({ queryKey: serviceKeys.detail(variables.serviceId) }); if (variables?.equipmentId) { queryClient.invalidateQueries({ queryKey: serviceKeys.equipmentHistory(variables.equipmentId) }); queryClient.invalidateQueries({ queryKey: ['equipment'] }) } } }) }
export const useCreateService = () => mutation(createAtomicService)
export const useAddServicePayment = () => mutation(addServicePayment)

