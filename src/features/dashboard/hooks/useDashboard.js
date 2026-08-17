import { useQuery } from '@tanstack/react-query'
import * as api from '../api/dashboard'

export const dashboardKeys = {
  finance: (dates) => ['dashboard', 'finance', dates],
  installationsOverdue: (today) => ['dashboard', 'installations-overdue', today],
  installationsToday: (today) => ['dashboard', 'installations-today', today],
  installationsUpcoming: (dates) => ['dashboard', 'installations-upcoming', dates],
  serviceQueue: ['dashboard', 'service-queue'],
  amcExpiring: (dates) => ['dashboard', 'amc-expiring', dates],
  warrantiesExpiring: (dates) => ['dashboard', 'warranties-expiring', dates],
  recentSales: ['dashboard', 'recent-sales'],
  recentServices: ['dashboard', 'recent-services'],
  recentCollections: (dates) => ['dashboard', 'recent-collections', dates],
}

export const useDashboardFinance = (dates) => useQuery({ queryKey: dashboardKeys.finance(dates), queryFn: () => api.getDashboardFinance(dates) })
export const useDashboardRecentCollections = (dates) => useQuery({ queryKey: dashboardKeys.recentCollections(dates), queryFn: () => api.getDashboardRecentCollections(dates) })
export const useOverdueInstallations = (today) => useQuery({ queryKey: dashboardKeys.installationsOverdue(today), queryFn: () => api.getOverdueInstallations(today) })
export const useTodayInstallations = (today) => useQuery({ queryKey: dashboardKeys.installationsToday(today), queryFn: () => api.getTodayInstallations(today) })
export const useUpcomingInstallations = (dates) => useQuery({ queryKey: dashboardKeys.installationsUpcoming(dates), queryFn: () => api.getUpcomingInstallations(dates) })
export const useServiceQueue = () => useQuery({ queryKey: dashboardKeys.serviceQueue, queryFn: api.getServiceQueue })
export const useExpiringAmcs = (dates) => useQuery({ queryKey: dashboardKeys.amcExpiring(dates), queryFn: () => api.getExpiringAmcs(dates) })
export const useExpiringWarranties = (dates) => useQuery({ queryKey: dashboardKeys.warrantiesExpiring(dates), queryFn: () => api.getExpiringWarranties(dates) })
export const useRecentSales = () => useQuery({ queryKey: dashboardKeys.recentSales, queryFn: api.getRecentSales })
export const useRecentCompletedServices = () => useQuery({ queryKey: dashboardKeys.recentServices, queryFn: api.getRecentCompletedServices })

