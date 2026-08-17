import { BadgeIndianRupee, Boxes, ChartNoAxesCombined, ClipboardCheck, Gauge, Settings, ShieldCheck, UsersRound } from 'lucide-react'

export const navigationItems = [
  { label: 'Dashboard', to: '/dashboard', icon: Gauge, available: true },
  { label: 'Customers', to: '/customers', icon: UsersRound, available: true },
  { label: 'Equipment', icon: Boxes },
  { label: 'Sales', icon: ChartNoAxesCombined },
  { label: 'Service', icon: ClipboardCheck },
  { label: 'Coverage', icon: ShieldCheck },
  { label: 'Finance', icon: BadgeIndianRupee },
]

export const settingsItem = { label: 'Settings', icon: Settings }
