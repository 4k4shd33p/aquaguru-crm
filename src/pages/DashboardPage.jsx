import { ArrowRight, ClipboardCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState'
import { Card } from '../components/ui/Card'
import { DashboardFinanceSnapshot } from '../features/dashboard/components/DashboardFinanceSnapshot'
import { DashboardListCard } from '../features/dashboard/components/DashboardListCard'
import { DashboardQuickActions } from '../features/dashboard/components/DashboardQuickActions'
import { useDashboardFinance, useDashboardRecentCollections, useExpiringAmcs, useExpiringWarranties, useOverdueInstallations, useRecentCompletedServices, useRecentSales, useServiceQueue, useTodayInstallations, useUpcomingInstallations } from '../features/dashboard/hooks/useDashboard'
import { addBusinessDays, businessDate, collectionPath, daysUntil, displayDate, displayMoney, firstBusinessDayOfMonth } from '../features/dashboard/utils/dashboardDisplay'

export function DashboardPage() {
  const today = businessDate()
  const nextWeek = addBusinessDays(today, 7)
  const expiryWindow = addBusinessDays(today, 30)
  const month = { dateFrom: firstBusinessDayOfMonth(), dateTo: today }
  const lastThirtyDays = { dateFrom: addBusinessDays(today, -30), dateTo: today }
  const overdueInstallations = useOverdueInstallations(today)
  const todayInstallations = useTodayInstallations(today)
  const upcomingInstallations = useUpcomingInstallations({ today, through: nextWeek })
  const serviceQueue = useServiceQueue()
  const expiringAmcs = useExpiringAmcs({ today, through: expiryWindow })
  const expiringWarranties = useExpiringWarranties({ today, through: expiryWindow })
  const recentSales = useRecentSales()
  const recentServices = useRecentCompletedServices()
  const finance = useDashboardFinance(month)
  const recentCollections = useDashboardRecentCollections(lastThirtyDays)
  const operationalQueries = [overdueInstallations, todayInstallations, upcomingInstallations, serviceQueue, expiringAmcs, expiringWarranties, recentSales, recentServices, recentCollections]
  const isEmpty = operationalQueries.every((query) => !query.isLoading && !query.isError && !(query.data ?? []).length)

  return <div className="dashboard"><header className="page-heading dashboard-heading"><div><span className="eyebrow">Dashboard</span><h2>Operations at a glance</h2><p>{displayDate(today)} · What needs attention across Aquaguru CRM.</p></div></header><DashboardQuickActions />
    {isEmpty && <Card className="dashboard-ready"><EmptyState icon={ClipboardCheck} title="Ready to get started" description="Create a customer, sale, service or installation to begin building your operational view." /></Card>}
    <section className="dashboard-section"><div className="dashboard-section__heading"><div><span className="eyebrow">Attention needed</span><h3>Work requiring follow-through</h3></div></div><div className="dashboard-grid dashboard-grid--attention">
      <DashboardListCard title="Overdue installations" description="Scheduled before today" query={overdueInstallations} emptyText="No overdue installations.">{(item) => <InstallationRow key={item.id} item={item} detail="overdue" />}</DashboardListCard>
      <DashboardListCard title="Service queue" description="Scheduled and open services" query={serviceQueue} emptyText="No services need attention.">{(item) => <ServiceRow key={item.id} item={item} />}</DashboardListCard>
      <DashboardListCard title="AMC expiry" description="Active cycles ending within 30 days" query={expiringAmcs} emptyText="No AMC cycles expiring soon.">{(item) => <CoverageRow key={item.id} item={item} type="amc" today={today} />}</DashboardListCard>
      <DashboardListCard title="Warranty expiry" description="Active warranties ending within 30 days" query={expiringWarranties} emptyText="No equipment warranties expiring soon.">{(item) => <CoverageRow key={item.id} item={item} type="warranty" today={today} />}</DashboardListCard>
    </div></section>
    <section className="dashboard-section"><div className="dashboard-section__heading"><div><span className="eyebrow">Today & upcoming</span><h3>Installation schedule</h3></div><Link to="/installations">All installations <ArrowRight size={15} /></Link></div><div className="dashboard-grid dashboard-grid--two">
      <DashboardListCard title="Today’s installations" description="Scheduled for today" query={todayInstallations} emptyText="No installations scheduled today.">{(item) => <InstallationRow key={item.id} item={item} />}</DashboardListCard>
      <DashboardListCard title="Next 7 days" description="Upcoming scheduled installations" query={upcomingInstallations} emptyText="No upcoming installations.">{(item) => <InstallationRow key={item.id} item={item} />}</DashboardListCard>
    </div></section>
    <DashboardFinanceSnapshot query={finance} />
    <section className="dashboard-section"><div className="dashboard-section__heading"><div><span className="eyebrow">Recent activity</span><h3>Latest business activity</h3></div></div><div className="dashboard-grid dashboard-grid--three">
      <DashboardListCard title="Recent sales" query={recentSales} emptyText="No recent sales.">{(item) => <ActivityRow key={item.id} to={`/sales/${item.id}`} code={item.sale_code} title={item.customers?.name || 'Customer unavailable'} meta={`${displayDate(item.sale_date)} · ${item.status}`} />}</DashboardListCard>
      <DashboardListCard title="Recent completed services" query={recentServices} emptyText="No recent completed services.">{(item) => <ActivityRow key={item.id} to={`/service/${item.id}`} code={item.service_code} title={`${item.equipment?.equipment_code || 'Equipment unavailable'} · ${item.equipment?.customers?.name || 'Customer unavailable'}`} meta={displayDate(item.service_date)} />}</DashboardListCard>
      <DashboardListCard title="Recent collections" query={recentCollections} emptyText="No recent collections.">{(item) => <CollectionRow key={item.payment_id} item={item} />}</DashboardListCard>
    </div></section>
  </div>
}

function InstallationRow({ item, detail }) { return <ActivityRow to={`/installations/${item.id}`} code={item.installation_code} title={`${item.equipment?.equipment_code || 'Equipment unavailable'} · ${item.equipment?.customers?.name || 'Customer unavailable'}`} meta={`${detail === 'overdue' ? 'Scheduled ' : ''}${displayDate(item.scheduled_date)} · ${item.technicians?.name || 'Unassigned'} · ${item.status}`} /> }
function ServiceRow({ item }) { return <ActivityRow to={`/service/${item.id}`} code={item.service_code} title={`${item.equipment?.equipment_code || 'Equipment unavailable'} · ${item.equipment?.customers?.name || 'Customer unavailable'}`} meta={`${displayDate(item.service_date)} · ${item.status}`} /> }
function CoverageRow({ item, type, today }) { const days = daysUntil(item.end_date, today); return <ActivityRow to={type === 'amc' ? `/coverage/amc/${item.id}` : `/coverage/warranties/${item.id}`} code={type === 'amc' ? item.amc_code : item.warranty_code} title={`${item.equipment?.equipment_code || 'Equipment unavailable'} · ${item.equipment?.customers?.name || 'Customer unavailable'}`} meta={`${displayDate(item.end_date)} · ${days === 0 ? 'Ends today' : `${days} days remaining`}`} /> }
function ActivityRow({ to, code, title, meta }) { return <Link className="dashboard-row" to={to}><strong>{code}</strong><span>{title}</span><small>{meta}</small></Link> }
function CollectionRow({ item }) { const path = collectionPath(item); const content = <><strong>{displayMoney(item.amount)}</strong><span>{item.customer_name || 'Customer unavailable'}</span><small>{item.collection_type} · {displayDate(item.payment_date)}</small></>; return path ? <Link className="dashboard-row" to={path}>{content}</Link> : <div className="dashboard-row">{content}</div> }

