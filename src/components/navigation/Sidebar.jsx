import { ChevronLeft, Droplets, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { IconButton } from '../ui/IconButton'
import { navigationItems, settingsItem } from './navigationConfig'

function NavItem({ item, compact }) {
  const Icon = item.icon
  if (!item.available) return <button className="sidebar__link sidebar__link--disabled" disabled title={`${item.label} is coming soon`}><Icon size={19} /><span>{item.label}</span>{!compact && <em>Soon</em>}</button>
  return <NavLink to={item.to} className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}><Icon size={19} /><span>{item.label}</span></NavLink>
}

export function Sidebar({ compact, onToggle }) {
  return <aside className={`sidebar ${compact ? 'sidebar--compact' : ''}`}>
    <div className="sidebar__brand"><span className="brand-mark"><Droplets size={21} fill="currentColor" /></span>{!compact && <span>Aquaguru<small>CRM</small></span>}<IconButton label={compact ? 'Expand navigation' : 'Collapse navigation'} onClick={onToggle}>{compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</IconButton></div>
    <nav aria-label="Main navigation" className="sidebar__nav">{navigationItems.map((item) => <NavItem item={item} compact={compact} key={item.label} />)}</nav>
    <div className="sidebar__footer"><NavItem item={settingsItem} compact={compact} /></div>
  </aside>
}
