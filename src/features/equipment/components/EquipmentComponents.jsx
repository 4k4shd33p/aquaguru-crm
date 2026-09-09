import { Cpu, History } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { componentLabel, formatDate } from '../utils/equipmentDisplay'

function sourceLabel(component) {
  const serviceCode = component.source_service_item?.services?.service_code
  return serviceCode ? `Replaced during ${serviceCode}` : `Existing component recorded ${formatDate(component.created_at?.slice(0, 10))}`
}

function dateLabel(component) {
  return component.installed_date ? `Known original installation date: ${formatDate(component.installed_date)}` : 'Original installation date not recorded'
}

function noteLabel(component) {
  return component.notes ? `Note: ${component.notes}` : null
}

export function EquipmentComponents({ components, isLoading }) {
  if (isLoading) return <Card className="equipment-components"><p className="detail-loading">Loading component history…</p></Card>
  const current = components.filter((component) => !component.removed_date)
  const historyByRole = components.filter((component) => component.removed_date).reduce((groups, component) => {
    const role = component.component_roles?.name || 'Tracked component'
    groups[role] = [...(groups[role] || []), component]
    return groups
  }, {})

  return <><Card className="equipment-components"><div className="section-heading"><div><h2>Current components</h2><p>Tracked components currently known to be on this equipment.</p></div></div>{current.length ? <div className="component-grid">{current.map((component) => <article className="component-card" key={component.id}><Cpu size={18} /><div><span>{component.component_roles?.name || 'Tracked component'}</span><strong>{componentLabel(component)}</strong><small>{sourceLabel(component)}</small><small>{dateLabel(component)}</small>{noteLabel(component) && <small>{noteLabel(component)}</small>}</div></article>)}</div> : <p className="component-empty">Not recorded</p>}</Card>
    <Card className="component-history"><div className="section-heading"><div><h2>Component history</h2><p>Earlier components are retained when a completed Service replaces them.</p></div><History size={18} /></div>{Object.keys(historyByRole).length ? <div className="component-history__groups">{Object.entries(historyByRole).map(([role, entries]) => <section key={role}><h3>{role}</h3>{entries.map((component) => <article className="component-history__item" key={component.id}><div><strong>Replaced</strong><span>{componentLabel(component)}</span><small>{sourceLabel(component)}</small>{noteLabel(component) && <small>{noteLabel(component)}</small>}</div><small>{dateLabel(component)} · Replaced {formatDate(component.removed_date)}</small></article>)}</section>)}</div> : <p className="component-empty">No historical component replacements have been recorded.</p>}</Card></>
}
