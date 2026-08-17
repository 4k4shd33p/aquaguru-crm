import { BadgeIndianRupee, Boxes, ChartNoAxesCombined, ClipboardCheck, Gauge, Settings, ShieldCheck, UsersRound } from 'lucide-react'

export const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: Gauge, available: true },
  { label: 'Customers', to: '/customers', icon: UsersRound, available: true },
  { label: 'Equipment', to: '/equipment', icon: Boxes, available: true },
  { label: 'Sales', to: '/sales', icon: ChartNoAxesCombined, available: true },
  { label: 'Service', to: '/service', icon: ClipboardCheck, available: true },
  { label: 'Installations', to: '/installations', icon: ClipboardCheck, available: true },
  { label: 'Coverage', to: '/coverage', icon: ShieldCheck, available: true },
  { label: 'Finance', to: '/finance', icon: BadgeIndianRupee, available: true },
]

export const settingsItem = { label: 'Settings', icon: Settings }



