import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/coverage'

export const coverageKeys = { warranties: (filters) => ['coverage', 'warranties', filters], warranty: (id) => ['coverage', 'warranty', id], amcs: (filters) => ['coverage', 'amcs', filters], amc: (id) => ['coverage', 'amc', id], parts: (filters) => ['coverage', 'part-warranties', filters], part: (id) => ['coverage', 'part-warranty', id], equipment: (id) => ['coverage', 'equipment', id], methods: ['coverage', 'payment-methods'] }
export const useEquipmentWarranties = (filters) => useQuery({ queryKey: coverageKeys.warranties(filters), queryFn: () => api.getEquipmentWarranties(filters) })
export const useEquipmentWarranty = (id) => useQuery({ queryKey: coverageKeys.warranty(id), queryFn: () => api.getEquipmentWarranty(id), enabled: Boolean(id) })
export const useAmcCycles = (filters) => useQuery({ queryKey: coverageKeys.amcs(filters), queryFn: () => api.getAmcCycles(filters) })
export const useAmcCycle = (id) => useQuery({ queryKey: coverageKeys.amc(id), queryFn: () => api.getAmcCycle(id), enabled: Boolean(id) })
export const usePartWarranties = (filters) => useQuery({ queryKey: coverageKeys.parts(filters), queryFn: () => api.getPartWarranties(filters) })
export const usePartWarranty = (id) => useQuery({ queryKey: coverageKeys.part(id), queryFn: () => api.getPartWarranty(id), enabled: Boolean(id) })
export const useEquipmentCoverage = (id) => useQuery({ queryKey: coverageKeys.equipment(id), queryFn: () => api.getEquipmentCoverage(id), enabled: Boolean(id) })
export const usePaymentMethods = () => useQuery({ queryKey: coverageKeys.methods, queryFn: api.getPaymentMethods })
export function useCreateAmc() { const qc = useQueryClient(); return useMutation({ mutationFn: api.createAmcCycle, onSuccess: (result, values) => { qc.invalidateQueries({ queryKey: ['coverage', 'amcs'] }); qc.invalidateQueries({ queryKey: coverageKeys.amc(result.amc_cycle_id) }); qc.invalidateQueries({ queryKey: coverageKeys.equipment(values.equipmentId) }); qc.invalidateQueries({ queryKey: ['equipment', values.equipmentId] }) } }) }
export function useAddAmcPayment() { const qc = useQueryClient(); return useMutation({ mutationFn: api.addAmcPayment, onSuccess: (_, values) => { qc.invalidateQueries({ queryKey: coverageKeys.amc(values.amcCycleId) }); qc.invalidateQueries({ queryKey: ['coverage', 'amcs'] }) } }) }

