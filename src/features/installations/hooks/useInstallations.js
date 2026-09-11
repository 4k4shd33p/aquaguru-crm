import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/installations'

export const installationKeys = {
  all: ['installations'], list: (filters) => ['installations', 'list', filters], detail: (id) => ['installations', 'detail', id],
  history: (equipmentId) => ['installations', 'equipment-history', equipmentId], equipmentSearch: (term) => ['installations', 'equipment-search', term], technicians: ['installations', 'technicians'], paymentMethods: ['installations', 'payment-methods'],
}
export const useInstallations = (filters) => useQuery({ queryKey: installationKeys.list(filters), queryFn: () => api.getInstallations(filters), placeholderData: (previous) => previous })
export const useInstallation = (id) => useQuery({ queryKey: installationKeys.detail(id), queryFn: () => api.getInstallation(id), enabled: Boolean(id) })
export const useEquipmentInstallationHistory = (id) => useQuery({ queryKey: installationKeys.history(id), queryFn: () => api.getEquipmentInstallationHistory(id), enabled: Boolean(id) })
export const useInstallationEquipmentSearch = (term) => useQuery({ queryKey: installationKeys.equipmentSearch(term), queryFn: () => api.searchInstallationEquipment(term), enabled: term.trim().length >= 2, staleTime: 30_000 })
export const useInstallationTechnicians = () => useQuery({ queryKey: installationKeys.technicians, queryFn: api.getTechnicians, staleTime: 10 * 60_000 })
export const useInstallationPaymentMethods = () => useQuery({ queryKey: installationKeys.paymentMethods, queryFn: api.getInstallationPaymentMethods, staleTime: 10 * 60_000 })

function invalidate(qc, equipmentId, installationId, warrantyId) {
  qc.invalidateQueries({ queryKey: installationKeys.all }); if (installationId) qc.invalidateQueries({ queryKey: installationKeys.detail(installationId) }); if (equipmentId) { qc.invalidateQueries({ queryKey: installationKeys.history(equipmentId) }); qc.invalidateQueries({ queryKey: ['equipment', 'detail', equipmentId] }); qc.invalidateQueries({ queryKey: ['coverage', 'equipment', equipmentId] }) }; if (warrantyId) qc.invalidateQueries({ queryKey: ['coverage', 'warranty', warrantyId] }); qc.invalidateQueries({ queryKey: ['coverage', 'warranties'] })
}
export function useCreateInstallation() { const qc = useQueryClient(); return useMutation({ mutationFn: api.createInstallation, onSuccess: (result, values) => invalidate(qc, values.equipmentId, result.installation_id) }) }
export function useCompleteInstallation() { const qc = useQueryClient(); return useMutation({ mutationFn: api.completeInstallation, onSuccess: (result, variables) => invalidate(qc, variables.equipmentId, variables.installationId, result.equipment_warranty_id) }) }
export function useCorrectInstallation() { const qc = useQueryClient(); return useMutation({ mutationFn: api.correctInstallation, onSuccess: (result, variables) => invalidate(qc, variables.equipmentId, variables.installationId, result.equipment_warranty_id) }) }
export function useRescheduleInstallation() { const qc = useQueryClient(); return useMutation({ mutationFn: api.rescheduleInstallation, onSuccess: (result) => invalidate(qc, result.equipment_id, result.id) }) }



function invalidatePayment(qc, equipmentId, installationId) {
  invalidate(qc, equipmentId, installationId)
  qc.invalidateQueries({ queryKey: ['finance'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}
export function useRecordInstallationPayment() { const qc = useQueryClient(); return useMutation({ mutationFn: api.recordInstallationPayment, onSuccess: (result, variables) => invalidatePayment(qc, variables.equipmentId, variables.installationId) }) }
export function useCorrectInstallationPayment() { const qc = useQueryClient(); return useMutation({ mutationFn: api.correctInstallationPayment, onSuccess: (result, variables) => invalidatePayment(qc, variables.equipmentId, variables.installationId) }) }
export function useVoidInstallationPayment() { const qc = useQueryClient(); return useMutation({ mutationFn: api.voidInstallationPayment, onSuccess: (result, variables) => invalidatePayment(qc, variables.equipmentId, variables.installationId) }) }
