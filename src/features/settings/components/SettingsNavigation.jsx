export const settingsSections = [
  ['productModels', 'Product Models'], ['parts', 'Parts'], ['technicians', 'Technicians'], ['serviceTypes', 'Service Types'], ['equipmentTypes', 'Equipment Types'], ['customerTypes', 'Customer Types'], ['leadSources', 'Lead Sources'], ['paymentMethods', 'Payment Methods'], ['componentRoles', 'Component Roles'],
]

export function SettingsNavigation({ active, onChange }) { return <nav className="settings-nav" aria-label="Master data sections"><label>Master data<select value={active} onChange={(event) => onChange(event.target.value)}>{settingsSections.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><div>{settingsSections.map(([id, label]) => <button type="button" key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</div></nav> }

