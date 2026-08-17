import { useState } from 'react'
import { MasterPanel } from '../features/settings/components/MasterPanel'
import { SettingsNavigation } from '../features/settings/components/SettingsNavigation'

export function SettingsPage() { const [section, setSection] = useState('productModels'); return <div className="settings-page"><header className="page-heading"><div><span className="eyebrow">Settings</span><h2>Master Data</h2><p>Manage CRM master data and operational configuration.</p></div></header><div className="settings-layout"><SettingsNavigation active={section} onChange={setSection} /><MasterPanel masterKey={section} /></div></div> }

