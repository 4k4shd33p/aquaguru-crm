import { CalendarClock, ClipboardList, UsersRound } from 'lucide-react'
import { EmptyState } from '../components/feedback/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'

export function DashboardPage() {
  return <div className="dashboard"><div className="page-heading"><div><span className="eyebrow">Overview</span><h2>Good to see you</h2><p>Your workspace foundation is ready for the Aquaguru CRM modules.</p></div><Badge tone="blue">V1 foundation</Badge></div>
    <div className="dashboard-grid" aria-label="Future dashboard areas"><Card><UsersRound size={20} /><h3>Customer relationships</h3><p>Customer management will appear here when that module is introduced.</p></Card><Card><CalendarClock size={20} /><h3>Service schedule</h3><p>Upcoming appointments and service operations will be available here.</p></Card><Card><ClipboardList size={20} /><h3>Coverage activity</h3><p>Warranty and AMC workflow summaries will live here.</p></Card></div>
    <Card className="dashboard-empty"><EmptyState icon={ClipboardList} title="No dashboard data yet" description="Business modules and operational data have intentionally not been added in this foundation release." /></Card>
  </div>
}
