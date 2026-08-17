import { Cpu, History } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { componentLabel, formatDate } from '../utils/equipmentDisplay'

export function EquipmentComponents({ components, isLoading }) {
  if (isLoading) return <Card className="equipment-components"><p className="detail-loading">Loading component history…</p></Card>
  const current = components.filter((component) => !component.removed_date)
  const historyByRole = components.reduce((groups, component) => {
    const role = component.component_roles?.name || 'Tracked component'
    groups[role] = [...(groups[role] || []), component]
    return groups
  }, {})
  return <><Card className="equipment-components"><div className="section-heading"><div><h2>Current components</h2><p>Tracked components currently installed on this equipment.</p></div></div>{current.length ? <div className="component-grid">{current.map((component) => <article className="component-card" key={component.id}><Cpu size={18} /><div><span>{component.component_roles?.name || 'Tracked component'}</span><strong>{componentLabel(component)}</strong><small>Installed {formatDate(component.installed_date)}</small></div></article>)}</div> : <p className="component-empty">Not recorded</p>}</Card>
    <Card className="component-history"><div className="section-heading"><div><h2>Component history</h2><p>Replacement activity will be recorded through completed service workflows.</p></div><History size={18} /></div>{Object.keys(historyByRole).length ? <div className="component-history__groups">{Object.entries(historyByRole).map(([role, entries]) => <section key={role}><h3>{role} history</h3>{entries.map((component) => <article className="component-history__item" key={component.id}><div><strong>{component.removed_date ? 'Previous' : 'Current'}</strong><span>{componentLabel(component)}</span></div><small>{formatDate(component.installed_date)} → {component.removed_date ? formatDate(component.removed_date) : 'Present'}</small></article>)}</section>)}</div> : <p className="component-empty">No tracked component history has been recorded.</p>}</Card></>
}

