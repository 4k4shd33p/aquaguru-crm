import { useState } from 'react'
import { ErrorState } from '../components/feedback/ErrorState'
import { FinanceDateControls } from '../features/finance/components/FinanceDateControls'
import { FinanceOutstanding } from '../features/finance/components/FinanceOutstanding'
import { FinanceRecentCollections } from '../features/finance/components/FinanceRecentCollections'
import { FinanceSummary } from '../features/finance/components/FinanceSummary'
import { FinancePerformance } from '../features/finance/components/FinancePerformance'
import { useFinanceOutstanding, useFinancePerformance, useFinanceRecentCollections, useFinanceSummary, useInstallationFinanceSummary } from '../features/finance/hooks/useFinance'
import { dateRangeForPreset, formatBusinessDate, humanError, isValidDateRange } from '../features/finance/utils/financeDisplay'

export function FinancePage() {
  const [preset, setPreset] = useState('this-month')
  const [dates, setDates] = useState(() => dateRangeForPreset('this-month'))
  const [recentLimit, setRecentLimit] = useState(25)
  const [outstandingCategory, setOutstandingCategory] = useState('all')
  const [outstandingPage, setOutstandingPage] = useState(1)
  const datesAreValid = isValidDateRange(dates)
  const summary = useFinanceSummary(dates, datesAreValid)
  const performance = useFinancePerformance(dates, datesAreValid)
  const installationSummary = useInstallationFinanceSummary(dates, datesAreValid)
  const recent = useFinanceRecentCollections(dates, recentLimit, datesAreValid)
  const outstanding = useFinanceOutstanding({ category: outstandingCategory === 'all' ? null : outstandingCategory, asOf: dates.dateTo, page: outstandingPage, pageSize: 25 }, datesAreValid)

  const selectPreset = (value) => {
    setPreset(value)
    if (value !== 'custom') setDates(dateRangeForPreset(value))
    setOutstandingPage(1)
  }
  const setDate = (name, value) => {
    setPreset('custom')
    setDates((current) => ({ ...current, [name]: value }))
    setOutstandingPage(1)
  }
  const setCategory = (value) => { setOutstandingCategory(value); setOutstandingPage(1) }

  return <div className="finance-page"><header className="page-heading"><div><span className="eyebrow">Finance</span><h2>Finance reporting</h2><p>Business performance and cash collections are reported separately.</p></div></header><FinanceDateControls preset={preset} dates={dates} onPresetChange={selectPreset} onDateChange={setDate} />{!datesAreValid ? <div className="form-message" role="alert">End date cannot be earlier than start date.</div> : <>{summary.isError || installationSummary.isError || performance.isError || recent.isError || outstanding.isError ? <ErrorState title="Finance data could not be loaded" description={humanError()} /> : <><FinancePerformance rows={performance.data} isLoading={performance.isLoading} /><section className="section-heading"><div><span className="eyebrow">Cash & Collections</span><h2>Amount Received and Amount Due</h2></div></section><FinanceSummary summary={summary.data} installation={installationSummary.data} asOf={formatBusinessDate(dates.dateTo)} /><FinanceRecentCollections items={recent.data ?? []} isLoading={recent.isLoading} limit={recentLimit} onLimitChange={setRecentLimit} /><FinanceOutstanding result={outstanding.data} isLoading={outstanding.isLoading} category={outstandingCategory} onCategoryChange={setCategory} page={outstandingPage} onPageChange={setOutstandingPage} asOf={formatBusinessDate(dates.dateTo)} /></>}</>}</div>
}


