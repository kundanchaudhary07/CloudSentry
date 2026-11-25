import { ChartNoAxesCombined, CircleDollarSign, Lightbulb, ReceiptText } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { YAxisTickContentProps } from 'recharts'
import { FindingDrawer } from '../../components/ui/FindingDrawer'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoScansState,
  PageHeader,
  SeverityPill,
  StatusPill,
} from '../../components/ui/Feedback'
import { formatAmount, formatDate } from '../../utils/format'
import { useScanContext } from '../../context/scan-context'
import { getApiErrorMessage, getCosts } from '../../services/api'
import type { CostResponse, FindingDetailRead, FindingRead } from '../../types/api'

export function CostsPage() {
  const { scans, loading: scansLoading, error: scansError } = useScanContext()
  const [report, setReport] = useState<CostResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FindingRead | null>(null)
  const latestCompleted = scans.find((scan) => scan.status === 'COMPLETED')
  const latestCompletedId = latestCompleted?.id

  const loadCosts = useCallback(async () => {
    if (!latestCompleted) {
      return
    }
    try {
      setReport(await getCosts(latestCompleted.id))
      setError(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [latestCompleted])

  useEffect(() => {
    if (!latestCompletedId) return
    let active = true
    getCosts(latestCompletedId)
      .then((result) => {
        if (active) {
          setReport(result)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(getApiErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [latestCompletedId])

  function retryCosts() {
    setLoading(true)
    void loadCosts()
  }

  const costExplorer = report?.cost_report.cost_explorer
  const spendAvailable = Boolean(costExplorer?.cost_explorer_available)
  const trendAvailable = spendAvailable && costExplorer?.trend_percent_change !== null
  const breakdown = costExplorer?.service_breakdown ?? []
  const chartBreakdown = breakdown.map((service) => ({
    ...service,
    amount: clampNearZero(service.amount),
  }))

  function applyUpdate(updated: FindingDetailRead) {
    setReport((current) => current
      ? { ...current, findings: current.findings.map((item) => item.id === updated.id ? updated : item) }
      : current)
    setSelected(updated)
  }

  return (
    <div>
      <PageHeader
        eyebrow="FINOPS"
        title="Cost intelligence"
        description="Waste signals and billing data, without estimated or fabricated savings."
      />

      {scansError && <ErrorState message={scansError} />}
      {scansLoading && <LoadingState label="Checking scan history…" />}
      {!scansLoading && !scansError && scans.length === 0 && <NoScansState />}
      {!scansLoading && scans.length > 0 && !latestCompleted && (
        <EmptyState title="No completed scan yet" description="Cost findings are available after a scan completes." />
      )}
      {error && <ErrorState message={error} onRetry={retryCosts} />}
      {loading && latestCompleted && <LoadingState label="Loading cost intelligence…" />}

      {report && !loading && (
        <>
          <section className="cost-summary-grid costs-kpi-grid">
            <article className="surface-card cost-summary-card costs-kpi-card">
              <div className="cost-summary-card-head">
                <PastelIconBadge tone="blue"><CircleDollarSign size={19} /></PastelIconBadge>
                <p className="card-kicker">Current period spend</p>
              </div>
              <strong className={`cost-summary-value ${spendAvailable ? 'kpi-number' : 'kpi-status-text'}`}>
                {spendAvailable && costExplorer
                  ? formatCostAmount(costExplorer.current_period_total, costExplorer.currency)
                  : 'Unavailable'}
              </strong>
              <span className="muted-copy">
                {costExplorer?.cost_explorer_available
                  ? `${formatDate(costExplorer.current_period_start)} – ${formatDate(costExplorer.current_period_end)}`
                  : costExplorer?.error_note ?? 'Cost Explorer data is not available.'}
              </span>
              {spendAvailable && (
                <span className="muted-copy">Period end date is exclusive.</span>
              )}
            </article>
            <article className="surface-card cost-summary-card costs-kpi-card">
              <div className="cost-summary-card-head">
                <PastelIconBadge tone="violet"><ReceiptText size={19} /></PastelIconBadge>
                <p className="card-kicker">Prior period spend</p>
              </div>
              <strong className={`cost-summary-value ${spendAvailable ? 'kpi-number' : 'kpi-status-text'}`}>
                {spendAvailable && costExplorer
                  ? formatCostAmount(costExplorer.prior_period_total, costExplorer.currency)
                  : 'Unavailable'}
              </strong>
              <span className="muted-copy">
                {costExplorer?.cost_explorer_available
                  ? `${costExplorer.prior_period_start ?? '—'} – ${costExplorer.prior_period_end ?? '—'}`
                  : 'No billing figure is inferred.'}
              </span>
            </article>
            <article className="surface-card cost-summary-card costs-kpi-card">
              <div className="cost-summary-card-head">
                <PastelIconBadge tone="mint"><ChartNoAxesCombined size={19} /></PastelIconBadge>
                <p className="card-kicker">Month-over-month change</p>
              </div>
              <strong className={`cost-summary-value ${trendAvailable ? 'kpi-number' : 'kpi-status-text'}`}>
                {trendAvailable && costExplorer
                  ? `${Number(costExplorer.trend_percent_change) > 0 ? '+' : ''}${costExplorer.trend_percent_change}%`
                  : 'Unavailable'}
              </strong>
              <span className="muted-copy">Compared over matched month-to-date periods</span>
            </article>
            <article className="surface-card cost-summary-card costs-kpi-card">
              <div className="cost-summary-card-head">
                <PastelIconBadge tone="amber"><Lightbulb size={19} /></PastelIconBadge>
                <p className="card-kicker">Waste findings</p>
              </div>
              <strong className="cost-summary-value kpi-number">{report.cost_report.total_waste_findings}</strong>
              <span className="muted-copy">Optimization opportunities; no savings estimate</span>
            </article>
          </section>

          {!costExplorer?.cost_explorer_available && (
            <div className="notice-banner">
              <strong>Cost Explorer unavailable</strong>
              <span>{costExplorer?.error_note ?? 'This scan did not include available Cost Explorer data.'}</span>
            </div>
          )}

          <section className="cost-layout-grid">
            <article className="surface-card cost-chart-card">
              <div className="section-heading">
                <div>
                  <p className="card-kicker">Actual unblended cost</p>
                  <h2>Service breakdown</h2>
                </div>
                <span className="chart-caption">{costExplorer?.currency ?? 'No currency reported'}</span>
              </div>
              {!costExplorer?.cost_explorer_available || breakdown.length === 0 ? (
                <EmptyState title="No service breakdown available" description="Service costs are shown only when Cost Explorer returns them." />
              ) : (
                <div className="service-chart" style={{ height: Math.max(260, chartBreakdown.length * 42 + 46) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartBreakdown} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 18 }}>
                      <CartesianGrid stroke="var(--cs-line)" strokeDasharray="3 4" horizontal={false} />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--cs-muted)', fontSize: 'var(--text-caption)' }}
                        tickFormatter={(value: number) => formatCostAmount(value, costExplorer.currency)}
                      />
                      <YAxis
                        type="category"
                        dataKey="service"
                        width={230}
                        axisLine={false}
                        tickLine={false}
                        tick={ServiceAxisTick}
                      />
                      <Tooltip formatter={(value) => [formatCostAmount(String(value), costExplorer.currency), 'Unblended cost']} />
                      <Bar dataKey="amount" fill="var(--cs-blue)" radius={[0, 3, 3, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {costExplorer?.cost_explorer_available && breakdown.length > 0 && (
                <div className="service-cost-list">
                  {breakdown.map((service) => (
                    <div key={`${service.service}-${service.unit}`}>
                      <span>{service.service}</span>
                      <strong>{formatCostAmount(service.amount, service.unit)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="surface-card assumptions-card">
              <div className="section-heading">
                <div>
                  <p className="card-kicker">Detection context</p>
                  <h2>Assumptions</h2>
                </div>
              </div>
              <ul className="assumptions-list">
                {report.cost_report.detection_assumptions.map((assumption, index) => (
                  <li key={`${index}-${assumption}`}>{assumption}</li>
                ))}
              </ul>
              {report.cost_report.cloudwatch_errors.length > 0 && (
                <div className="notice-banner compact-notice">
                  <strong>CloudWatch collection issues</strong>
                  <span>{report.cost_report.cloudwatch_errors.length} metric request(s) were unavailable. Missing datapoints are not treated as zero utilization.</span>
                </div>
              )}
            </article>
          </section>

          <section className="surface-card cost-findings-card">
            <div className="section-heading">
              <div>
                <p className="card-kicker">Cost opportunities</p>
                <h2>FinOps findings</h2>
              </div>
              <span className="result-count">{report.findings.length} findings</span>
            </div>
            {report.findings.length === 0 ? (
              <EmptyState title="No FinOps findings" description="No waste signals were generated for this scan." />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Opportunity</th><th>Severity</th><th>Resource</th><th>Region</th><th>Status</th><th><span className="sr-only">Inspect</span></th></tr></thead>
                  <tbody>
                    {report.findings.map((finding) => (
                      <tr key={finding.id}>
                        <td>
                          <button className="table-primary-link" type="button" onClick={() => setSelected(finding)}>{finding.title}</button>
                          <span className="rule-id-chip">{finding.rule_id}</span>
                        </td>
                        <td><SeverityPill severity={finding.severity} /></td>
                        <td><span className="resource-cell">{finding.resource_id}</span></td>
                        <td>{finding.region}</td>
                        <td><StatusPill status={finding.status} /></td>
                        <td>
                          <button className="circle-arrow-button" type="button" onClick={() => setSelected(finding)} aria-label={`Open ${finding.rule_id}`}>
                            <span aria-hidden="true">→</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {selected && <FindingDrawer finding={selected} onClose={() => setSelected(null)} onUpdated={applyUpdate} />}
    </div>
  )
}

function clampNearZero(value: string | number): number {
  const amount = Number(value)
  return Math.abs(amount) < 0.005 ? 0 : amount
}

function formatCostAmount(value: string | number | null | undefined, currency: string | null): string {
  if (value === null || value === undefined) return formatAmount(value, currency)
  return formatAmount(String(clampNearZero(value)), currency)
}

function ServiceAxisTick({ x, y, payload }: YAxisTickContentProps) {
  const serviceName = String(payload.value ?? '')
  const label = serviceName.length > 30 ? `${serviceName.slice(0, 29).trimEnd()}…` : serviceName

  return (
    <g transform={`translate(${x}, ${y})`}>
      <title>{serviceName}</title>
      <text
        x={0}
        y={0}
        dx={-5}
        dy={4}
        textAnchor="end"
        fill="var(--cs-ink)"
        fontSize={12}
        style={{ whiteSpace: 'nowrap' }}
        aria-label={serviceName}
      >
        {label}
      </text>
    </g>
  )
}
