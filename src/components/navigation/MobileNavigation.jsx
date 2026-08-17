import { CirclePlus, House, Menu, UsersRound, Wrench } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export function MobileNavigation() {
  return <nav className="mobile-nav" aria-label="Mobile navigation">
    <NavLink to="/dashboard"><House size={19} /><span>Home</span></NavLink>
    <button disabled title="Customers is coming soon"><UsersRound size={19} /><span>Customers</span></button>
    <button disabled title="Service is coming soon"><Wrench size={19} /><span>Service</span></button>
    <button disabled className="mobile-nav__create" title="Create actions are coming soon"><CirclePlus size={24} /><span>Create</span></button>
    <button disabled title="More is coming soon"><Menu size={19} /><span>More</span></button>
  </nav>
}
