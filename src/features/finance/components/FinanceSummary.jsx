import { Card } from '../../../components/ui/Card'
import { formatBalance, formatMoney } from '../utils/financeDisplay'

function MetricCard({ label, value, note, unavailable = false, balance = false }) {
  return <Card className="finance-metric-card"><span>{label}</span><strong className={balance && Number(value) < 0 ? 'finance-credit' : ''}>{unavailable ? 'Unavailable' : balance ? formatBalance(value) : formatMoney(value)}</strong>{note && <small>{note}</small>}</Card>
}

export function FinanceSummary({ summary, installation, asOf }) {
  return <>
    <section className="finance-metrics" aria-label="Finance summary">
      <MetricCard label="Transaction Value" value={summary?.total_transaction_value} unavailable={!summary?.total_transaction_value_available} />
      <MetricCard label="Collections" value={summary?.total_collections} />
      <MetricCard label={`Outstanding as of ${asOf}`} value={summary?.total_outstanding_as_of} unavailable={!summary?.total_outstanding_available} balance />
    </section>
    <section className="finance-breakdown" aria-label="Category performance">
      <CategoryCard title="Sales" value={summary?.sales_value} valueAvailable collections={summary?.sales_collections} outstanding={summary?.sales_outstanding_as_of} cost={summary?.sales_known_direct_cost} costAvailable={summary?.sales_direct_cost_available} contribution={summary?.sales_contribution} contributionAvailable={summary?.sales_contribution_available} extras={<><span>Direct collections: {formatMoney(summary?.sales_direct_collections)}</span><span>EMI collections: {formatMoney(summary?.sales_emi_collections)}</span></>} />
      <CategoryCard title="Service" value={summary?.service_value} valueAvailable collections={summary?.service_collections} outstanding={summary?.service_outstanding_as_of} cost={summary?.service_known_direct_cost} costAvailable={summary?.service_direct_cost_available} contribution={summary?.service_contribution} contributionAvailable={summary?.service_contribution_available} />
      <CategoryCard title="Installation / Additional Work" value={installation?.installation_value} valueAvailable collections={installation?.installation_collections} outstanding={installation?.installation_outstanding_as_of} note="Only separately charged Additional Work is included. Legacy Installation Charge is excluded." />
      <CategoryCard title="AMC" value={summary?.amc_value} valueAvailable={summary?.amc_value_available} collections={summary?.amc_collections} outstanding={summary?.amc_outstanding_as_of} note="AMC direct costs and contribution are not available in this report." />
    </section>
    <section className="finance-collection-cards" aria-label="Collection breakdown">
      <MetricCard label="Sales direct collections" value={summary?.sales_direct_collections} />
      <MetricCard label="Sales EMI collections" value={summary?.sales_emi_collections} />
      <MetricCard label="Service collections" value={summary?.service_collections} />
      <MetricCard label="AMC collections" value={summary?.amc_collections} />
      <MetricCard label="Installation collections" value={installation?.installation_collections} />
    </section>
  </>
}

function CategoryCard({ title, value, valueAvailable, collections, outstanding, cost, costAvailable, contribution, contributionAvailable, extras, note }) {
  return <Card className="finance-category-card"><header><h3>{title}</h3></header><dl><div><dt>Transaction value</dt><dd>{valueAvailable ? formatMoney(value) : 'Unavailable'}</dd></div><div><dt>Collections</dt><dd>{formatMoney(collections)}</dd></div><div><dt>Outstanding</dt><dd className={Number(outstanding) < 0 ? 'finance-credit' : ''}>{formatBalance(outstanding)}</dd></div>{costAvailable !== undefined && <div><dt>Known direct cost</dt><dd>{costAvailable ? formatMoney(cost) : 'Unavailable'}</dd></div>}{contributionAvailable !== undefined && <div><dt>Contribution</dt><dd>{contributionAvailable ? formatMoney(contribution) : 'Unavailable'}</dd></div>}</dl>{extras && <div className="finance-category-card__extras">{extras}</div>}{note && <p>{note}</p>}</Card>
}


