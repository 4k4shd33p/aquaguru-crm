import { supabase } from '../../../lib/supabase'
import { getFinanceRecentCollections, getFinanceSummary } from '../../finance/api/finance'

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }

const installationFields = 'id, installation_code, scheduled_date, status, equipment ( id, equipment_code, customers ( id, name ) ), technicians ( id, name )'
const serviceFields = 'id, service_code, service_date, status, equipment ( id, equipment_code, customers ( id, name ) ), technicians ( id, name )'
const amcFields = 'id, amc_code, end_date, equipment ( id, equipment_code, customers ( id, name ) )'
const warrantyFields = 'id, warranty_code, end_date, equipment ( id, equipment_code, customers ( id, name ) )'

async function rows(query) { const { data, error } = await query; if (error) throw error; return data ?? [] }

export const getDashboardFinance = ({ dateFrom, dateTo }) => getFinanceSummary({ dateFrom, dateTo })
export const getDashboardRecentCollections = ({ dateFrom, dateTo }) => getFinanceRecentCollections({ dateFrom, dateTo, limit: 5 })

export function getOverdueInstallations(today) {
  return rows(client().from('installations').select(installationFields).in('status', ['Scheduled', 'Rescheduled']).not('scheduled_date', 'is', null).lt('scheduled_date', today).order('scheduled_date', { ascending: true }).limit(5))
}

export function getTodayInstallations(today) {
  return rows(client().from('installations').select(installationFields).in('status', ['Scheduled', 'Rescheduled']).eq('scheduled_date', today).order('installation_code').limit(5))
}

export function getUpcomingInstallations({ today, through }) {
  return rows(client().from('installations').select(installationFields).in('status', ['Scheduled', 'Rescheduled']).gt('scheduled_date', today).lte('scheduled_date', through).order('scheduled_date').order('installation_code').limit(5))
}

export function getServiceQueue() {
  return rows(client().from('services').select(serviceFields).in('status', ['Scheduled', 'Open']).order('service_date').order('created_at').limit(5))
}

export function getExpiringAmcs({ today, through }) {
  return rows(client().from('amc_cycles_effective').select(amcFields).eq('effective_status', 'Active').gte('end_date', today).lte('end_date', through).order('end_date').order('amc_code').limit(5))
}

export function getExpiringWarranties({ today, through }) {
  return rows(client().from('equipment_warranties').select(warrantyFields).eq('status', 'Active').gte('end_date', today).lte('end_date', through).order('end_date').order('warranty_code').limit(5))
}

export function getRecentSales() {
  return rows(client().from('sales').select('id, sale_code, sale_date, status, customers ( id, name )').in('status', ['Confirmed', 'Completed']).order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(5))
}

export function getRecentCompletedServices() {
  return rows(client().from('services').select(serviceFields).eq('status', 'Completed').order('service_date', { ascending: false }).order('created_at', { ascending: false }).limit(5))
}

