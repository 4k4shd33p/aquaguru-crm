import { Boxes, ChartNoAxesCombined, House, Menu, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function MobileNavigation() {
  return <nav className="mobile-nav" aria-label="Mobile navigation">
    <NavLink to="/dashboard"><House size={19} /><span>Home</span></NavLink>
    <NavLink to="/customers"><UsersRound size={19} /><span>Customers</span></NavLink>
    <NavLink to="/equipment"><Boxes size={19} /><span>Equipment</span></NavLink>
    <NavLink to="/sales"><ChartNoAxesCombined size={19} /><span>Sales</span></NavLink>
    <button disabled title="More is coming soon"><Menu size={19} /><span>More</span></button>
  </nav>
}

