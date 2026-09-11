import { supabase } from '../../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function requireData({ data, error }) {
  if (error) throw error
  return data ?? []
}

export async function getFinanceSummary({ dateFrom, dateTo }) {
  const rows = requireData(await client().rpc('get_finance_summary', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  }))
  return rows[0] ?? null
}

export async function getInstallationFinanceSummary({ dateFrom, dateTo }) {
  const rows = requireData(await client().rpc('get_installation_finance_summary', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  }))
  return rows[0] ?? null
}

export async function getFinancePerformance({ dateFrom, dateTo }) {
  return requireData(await client().rpc('get_finance_performance', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  }))
}

export async function getFinanceRecentCollections({ dateFrom, dateTo, limit = 25 }) {
  return requireData(await client().rpc('get_finance_recent_collections', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_limit: Math.min(Math.max(Number(limit) || 25, 1), 100),
  }))
}

export async function getFinanceOutstanding({ category, asOf, page = 1, pageSize = 25 }) {
  const rows = requireData(await client().rpc('get_finance_outstanding', {
    p_category: category || null,
    p_as_of: asOf,
    p_offset: Math.max(page - 1, 0) * pageSize,
    p_limit: pageSize,
  }))

  return { rows, count: Number(rows[0]?.total_count ?? 0) }
}


