import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMasterRows, getSettingsLookups, saveMaster, setMasterActive } from '../api/masterData'

export const settingsKeys = { master: (key, search) => ['settings', key, search], lookups: ['settings', 'lookups'] }
export const useMasterRows = (key, search) => useQuery({ queryKey: settingsKeys.master(key, search), queryFn: () => getMasterRows(key, search) })
export const useSettingsLookups = () => useQuery({ queryKey: settingsKeys.lookups, queryFn: getSettingsLookups })
export function useSaveMaster() { const queryClient = useQueryClient(); return useMutation({ mutationFn: saveMaster, onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: ['settings', variables.key] }); if (variables.key === 'equipmentTypes' || variables.key === 'componentRoles') queryClient.invalidateQueries({ queryKey: settingsKeys.lookups }) } }) }
export function useSetMasterActive() { const queryClient = useQueryClient(); return useMutation({ mutationFn: setMasterActive, onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: ['settings', variables.key] }); if (variables.key === 'equipmentTypes' || variables.key === 'componentRoles') queryClient.invalidateQueries({ queryKey: settingsKeys.lookups }) } }) }

