import { ClipboardPlus, FilePlus2, UserPlus, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

const actions = [
  { label: 'New Customer', to: '/customers', icon: UserPlus },
  { label: 'New Sale', to: '/sales/new', icon: FilePlus2 },
  { label: 'New Service', to: '/service/new', icon: Wrench },
  { label: 'New Installation', to: '/installations/new', icon: ClipboardPlus },
]

export function DashboardQuickActions() {
  return <nav className="dashboard-actions" aria-label="Quick actions">{actions.map(({ label, to, icon: Icon }) => <Link key={to} to={to}><Icon size={18} /><span>{label}</span></Link>)}</nav>
}

