import { BadgeIndianRupee, Boxes, ChartNoAxesCombined, ClipboardCheck, House, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function MobileNavigation() {
  return <nav className="mobile-nav" aria-label="Mobile navigation">
    <NavLink to="/dashboard"><House size={19} /><span>Home</span></NavLink>
    <NavLink to="/customers"><UsersRound size={19} /><span>Customers</span></NavLink>
    <NavLink to="/equipment"><Boxes size={19} /><span>Equipment</span></NavLink>
    <NavLink to="/sales"><ChartNoAxesCombined size={19} /><span>Sales</span></NavLink>
    <NavLink to="/installations"><ClipboardCheck size={19} /><span>Install</span></NavLink>
    <NavLink to="/finance"><BadgeIndianRupee size={19} /><span>Finance</span></NavLink>
  </nav>
}



