const presets = [
  ['today', 'Today'],
  ['this-month', 'This Month'],
  ['last-month', 'Last Month'],
  ['this-year', 'This Year'],
  ['custom', 'Custom'],
]

export function FinanceDateControls({ preset, dates, onPresetChange, onDateChange }) {
  return <section className="finance-date-controls" aria-label="Finance reporting period">
    <div className="finance-date-controls__presets" role="group" aria-label="Date range preset">
      {presets.map(([value, label]) => <button key={value} type="button" className={preset === value ? 'active' : ''} onClick={() => onPresetChange(value)}>{label}</button>)}
    </div>
    <div className="finance-date-controls__custom">
      <label>From<input type="date" value={dates.dateFrom} onChange={(event) => onDateChange('dateFrom', event.target.value)} /></label>
      <label>To<input type="date" value={dates.dateTo} onChange={(event) => onDateChange('dateTo', event.target.value)} /></label>
    </div>
  </section>
}

