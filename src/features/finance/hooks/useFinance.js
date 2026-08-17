import { useQuery } from '@tanstack/react-query'
import * as api from '../api/finance'

export const financeKeys = {
  summary: (dates) => ['finance', 'summary', dates],
  recentCollections: (dates, limit) => ['finance', 'recent-collections', dates, limit],
  outstanding: (filters) => ['finance', 'outstanding', filters],
}

export const useFinanceSummary = (dates, enabled) => useQuery({
  queryKey: financeKeys.summary(dates),
  queryFn: () => api.getFinanceSummary(dates),
  enabled,
})

export const useFinanceRecentCollections = (dates, limit, enabled) => useQuery({
  queryKey: financeKeys.recentCollections(dates, limit),
  queryFn: () => api.getFinanceRecentCollections({ ...dates, limit }),
  enabled,
})

export const useFinanceOutstanding = (filters, enabled) => useQuery({
  queryKey: financeKeys.outstanding(filters),
  queryFn: () => api.getFinanceOutstanding(filters),
  enabled,
})

