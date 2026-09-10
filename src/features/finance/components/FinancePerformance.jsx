import { Card } from '../../../components/ui/Card'
import { formatMoney } from '../utils/financeDisplay'

const labels = { 'Product Sales': 'Product Sales', 'Paid Service': 'Paid Service', AMC: 'AMC', 'Complimentary / Goodwill': 'Complimentary / Goodwill', Unallocated: 'Unallocated', Consolidated: 'Consolidated' }

function PerformanceCard({ row }) {
  const isConsolidated = row.category === 'Consolidated'
  const valueLabel = row.category === 'AMC' ? 'Contract Value' : isConsolidated ? 'Revenue / Value' : 'Revenue'
  const grossLabel = row.category === 'AMC' ? 'Gross Profit to Date' : 'Gross Profit'
  return <Card className={`finance-category-card${isConsolidated ? ' finance-category-card--consolidated' : ''}`}><header><h3>{labels[row.category]}</h3></header><dl>{!['Complimentary / Goodwill', 'Unallocated'].includes(row.category) && <div><dt>{valueLabel}</dt><dd>{formatMoney(row.revenue)}</dd></div>}<div><dt>Known Direct Cost</dt><dd>{formatMoney(row.known_direct_cost)}</dd></div>{row.category === 'Product Sales' && <><div><dt>Product Cost</dt><dd>{formatMoney(row.product_cost)}</dd></div><div><dt>Installation Cost</dt><dd>{formatMoney(row.installation_direct_cost)}</dd></div><div><dt>Warranty Cost</dt><dd>{formatMoney(row.warranty_direct_cost)}</dd></div></>}{row.category === 'AMC' && <><div><dt>Service Item Cost</dt><dd>{formatMoney(row.service_item_direct_cost)}</dd></div><div><dt>Shared Service Cost</dt><dd>{formatMoney(row.shared_direct_cost)}</dd></div></>}<div><dt>{grossLabel}</dt><dd className={Number(row.gross_profit) < 0 ? 'finance-credit' : ''}>{formatMoney(row.gross_profit)}</dd></div></dl>{Number(row.unknown_cost_count) > 0 && <p>Includes {row.unknown_cost_count} unknown cost value{Number(row.unknown_cost_count) === 1 ? '' : 's'}; Gross Profit reflects known direct costs only.</p>}</Card>
}

export function FinancePerformance({ rows, isLoading }) {
  if (isLoading) return <section className="card"><h2>Business Performance</h2><p>Loading performance…</p></section>
  return <section className="finance-performance"><header className="section-heading"><div><span className="eyebrow">Business Performance</span><h2>Revenue, Direct Cost and Gross Profit</h2><p>Collections are shown separately below and do not change Revenue or Gross Profit.</p></div></header><div className="finance-breakdown">{(rows ?? []).map((row) => <PerformanceCard key={row.category} row={row} />)}</div></section>
}

