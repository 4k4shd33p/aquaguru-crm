import { ChevronDown, LogOut, Plus, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthProvider'
import { IconButton } from '../ui/IconButton'

export function Header() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const isCustomerRoute = location.pathname.startsWith('/customers')
  const isEquipmentRoute = location.pathname.startsWith('/equipment')
  const isFinanceRoute = location.pathname.startsWith('/finance')
  const isSalesRoute = location.pathname.startsWith('/sales')
  const isServiceRoute = location.pathname.startsWith('/service')
  const isInstallationRoute = location.pathname.startsWith('/installations')
  const isCoverageRoute = location.pathname.startsWith('/coverage')
  const title = isCustomerRoute ? (location.pathname === '/customers' ? 'Customers' : 'Customer details') : isEquipmentRoute ? (location.pathname === '/equipment' ? 'Equipment' : 'Equipment details') : isSalesRoute ? 'Sales' : isServiceRoute ? 'Service' : isInstallationRoute ? 'Installations' : isCoverageRoute ? 'Coverage' : isFinanceRoute ? 'Finance' : 'Dashboard'
  const initials = (user?.email || 'A').slice(0, 1).toUpperCase()
  return <header className="app-header">
    <div><p className="breadcrumb">Workspace <span>/</span> {title}</p><h1>{title}</h1></div>
    <div className="app-header__actions">
      <label className="search"><Search size={17} /><input aria-label="Global search" placeholder="Search CRM" disabled /><kbd>⌘ K</kbd></label>
      <button className="header-create" disabled title="Create actions will be available with business modules"><Plus size={17} /> Create</button>
      <details className="user-menu"><summary aria-label="Open user menu"><span className="avatar">{initials}</span><span className="user-menu__email">{user?.email}</span><ChevronDown size={15} /></summary><div className="user-menu__panel"><button onClick={signOut}><LogOut size={16} />Sign out</button></div></details>
      <IconButton className="header-menu" label="Open navigation"><ChevronDown size={18} /></IconButton>
    </div>
  </header>
}



