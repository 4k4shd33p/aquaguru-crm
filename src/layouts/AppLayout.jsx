import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from '../components/navigation/Header'
import { MobileNavigation } from '../components/navigation/MobileNavigation'
import { Sidebar } from '../components/navigation/Sidebar'

export function AppLayout() {
  const [compact, setCompact] = useState(false)
  return <div className={`app-shell ${compact ? 'app-shell--compact' : ''}`}>
    <Sidebar compact={compact} onToggle={() => setCompact((value) => !value)} />
    <div className="app-shell__content"><Header /><main className="page-content"><Outlet /></main></div>
    <MobileNavigation />
  </div>
}
