import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Cloud,
  FileText,
  Minus,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useScanContext } from '../../context/scan-context'
import { CloudSentryLogo } from '../../components/ui/CloudSentryLogo'
import { EmptyState, ErrorState, LoadingState, SeverityPill } from '../../components/ui/Feedback'
import { GradientHeroBanner } from '../../components/ui/GradientHeroBanner'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import { ScanTriggerButton } from '../../components/ui/ScanTriggerButton'
import { getApiErrorMessage, getDashboard } from '../../services/api'
import { readScanSettings } from '../../services/scanSettings'
import type { DashboardRead, SeverityCounts } from '../../types/api'
import { formatAmount, formatDate } from '../../utils/format'
import './dashboard.css'

const severityOrder: Array<keyof SeverityCounts> = ['critical', 'high', 'medium', 'low']

export function DashboardPage() {
  const { scans, loading: scansLoading, error: scansError } = useScanContext()
  const [dashboard, setDashboard] = useState<DashboardRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    try {
      setDashboard(await getDashboard())
      setError(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    getDashboard()
      .then((result) => {
        if (active) {
          setDashboard(result)
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
  }, [])

  const latestCompleted = scans.find((scan) => scan.status === 'COMPLETED')
  const severityCounts = latestCompleted?.severity_counts
  const costExplorer = dashboard?.cost_summary.cost_explorer
  const score = dashboard?.posture_score ?? null
  const regionCount = latestCompleted?.regions.length ?? 0
  const trend = (dashboard?.recent_scan_trend ?? []).map((point) => ({
    ...point,
    date_label: (() => {
      const date = new Date(point.started_at)
      const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const time = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      return `${day} · ${time}`
    })(),
  }))
  const totalSeverityCount = severityOrder.reduce(
    (total, severity) => total + (severityCounts?.[severity] ?? 0),
    0,
  )
  const statusText = latestCompleted
    ? 'Latest scan available'
    : scans.length === 0
      ? 'Ready to scan'
      : 'No completed scan'
  const heroTitle = !latestCompleted
    ? 'Ready to Scan'
    : latestCompleted.resource_count === 0
      ? 'No Resources Discovered'
    : score !== null && score >= 90 && dashboard?.high_critical_count === 0
      ? 'All Systems Healthy'
      : 'Review Security Posture'
  const highCriticalCount = dashboard?.high_critical_count ?? 0
  const heroAction: { type: 'scan'; label: string } | { type: 'link'; label: string; to: string } = scans.length === 0
    ? { type: 'scan', label: 'Run First Scan →' }
    : !latestCompleted
      ? { type: 'scan', label: 'Run New Scan →' }
    : highCriticalCount > 0
      ? { type: 'link', label: `Inspect ${highCriticalCount} Critical/High →`, to: '/findings' }
      : { type: 'link', label: 'View Latest Scan Report →', to: '/scans' }

  const refreshDashboard = useCallback(() => {
    setLoading(true)
    void loadDashboard()
  }, [loadDashboard])

  return (
    <div className="dashboard-page">
      <header className="dashboard-brand-header">
        <CloudSentryLogo />
        <div className="dashboard-header-actions">
          <Link className="dashboard-aws-settings-button" to="/settings">Open AWS Settings →</Link>
          <p>Read-only visibility across your AWS environment.</p>
        </div>
      </header>

      {scansError && <ErrorState message={scansError} />}
      {error && <ErrorState message={error} onRetry={refreshDashboard} />}
      {(loading || scansLoading) && <LoadingState label="Loading the latest scan data…" />}

      {!loading && dashboard && (
        <>
          <section className="overview-feature-grid" aria-label="CloudSentry overview">
            <GradientHeroBanner
              className="environment-feature"
              eyebrow="AWS environment"
              title={heroTitle}
              description={
                latestCompleted
                  ? `Latest completed ${formatDate(latestCompleted.completed_at)} · ${latestCompleted.resource_count.toLocaleString()} resources reviewed`
                  : 'Run a read-only scan to discover inventory and security posture.'
              }
              status={statusText}
              icon={<Cloud size={25} strokeWidth={1.8} />}
              action={heroAction.type === 'scan'
                ? <ScanTriggerButton settings={readScanSettings()} label={heroAction.label} />
                : <Link className="hero-action-link" to={heroAction.to}>{heroAction.label}</Link>}
            />

            <article className="surface-card posture-feature">
              <div className="reference-card-heading">
                <PastelIconBadge tone="coral"><ShieldAlert size={21} /></PastelIconBadge>
                <div>
                  <p className="card-kicker">Security</p>
                  <h2>Security Posture</h2>
                </div>
                <Link className="card-corner-link" to="/findings" aria-label="Open security findings">
                  <ArrowRight size={17} />
                </Link>
              </div>
              <PostureGauge
                counts={severityCounts}
                total={totalSeverityCount}
                openFindings={dashboard.open_findings_count}
              />
              <div className="severity-counts">
                {severityOrder.map((severity) => (
                  <span key={severity}>
                    <i className={`dot ${severity}`} />
                    {severity[0].toUpperCase()}{severity.slice(1)}
                    <b>{severityCounts?.[severity] ?? 0}</b>
                  </span>
                ))}
              </div>
            </article>

            <div className="metric-stack">
              <Link to="/costs" className="surface-card compact-metric cost-metric-card">
                <PastelIconBadge tone="mint"><CircleDollarSign size={21} /></PastelIconBadge>
                <div className="metric-copy">
                  <p className="card-kicker">Monthly cost</p>
                  <strong className={costExplorer?.cost_explorer_available ? 'metric-number kpi-number' : 'metric-number kpi-status-text'}>
                    {costExplorer?.cost_explorer_available
                      ? formatAmount(costExplorer.current_period_total, costExplorer.currency)
                      : 'Unavailable'}
                  </strong>
                  <span className="metric-footnote">
                    {costExplorer?.cost_explorer_available
                      ? 'Current Cost Explorer period'
                      : costExplorer?.error_note ?? 'Cost Explorer data is unavailable.'}
                  </span>
                </div>
                <CostSparkline
                  available={Boolean(costExplorer?.cost_explorer_available)}
                  prior={costExplorer?.prior_period_total}
                  current={costExplorer?.current_period_total}
                />
                <span className={`cost-trend${costExplorer?.trend_percent_change ? Number(costExplorer.trend_percent_change) > 0 ? ' trend-up' : ' trend-down' : ''}`}>
                  {costExplorer?.cost_explorer_available && costExplorer.trend_percent_change !== null
                    ? <>{Number(costExplorer.trend_percent_change) > 0 ? <ArrowUpRight size={14} /> : Number(costExplorer.trend_percent_change) < 0 ? <ArrowDownRight size={14} /> : <Minus size={14} />}{Math.abs(Number(costExplorer.trend_percent_change))}% vs prior period</>
                    : <><Minus size={14} /> Trend unavailable</>}
                </span>
              </Link>
              <Link to="/inventory" className="surface-card compact-metric resource-metric-card">
                <PastelIconBadge tone="violet"><Boxes size={21} /></PastelIconBadge>
                <div className="metric-copy">
                  <p className="card-kicker">Total resources</p>
                  <strong className="metric-number kpi-number">{dashboard.total_resources.toLocaleString()}</strong>
                  <span className="metric-footnote">
                    {latestCompleted ? `Across ${regionCount} ${regionCount === 1 ? 'region' : 'regions'}` : 'No completed scan'}
                  </span>
                </div>
              </Link>
            </div>
          </section>

          <section className="quick-access-grid" aria-label="CloudSentry modules">
            <QuickAccessCard to="/inventory" title="Resource Inventory" tone="blue" icon={<Boxes size={21} />} />
            <QuickAccessCard to="/costs" title="Cost Intelligence" tone="mint" icon={<BarChart3 size={21} />} />
            <QuickAccessCard to="/findings" title="Security Findings" tone="coral" icon={<ShieldAlert size={21} />} />
            <QuickAccessCard to="/remediation" title="Remediation" tone="amber" icon={<Wrench size={21} />} />
            <QuickAccessCard to="/scans" title="Reports" tone="violet" icon={<FileText size={21} />} />
          </section>

          <section className="dashboard-lower-grid">
            <article className="surface-card chart-card">
              <div className="section-heading">
                <div>
                  <p className="card-kicker">Posture history</p>
                  <h2>Recent scan trend</h2>
                </div>
                <Link className="text-link" to="/scans">All scans <span aria-hidden="true">→</span></Link>
              </div>
              {trend.length === 0 ? (
                <EmptyState title="No completed scans" description="Posture trend appears after a completed scan." />
              ) : (
                <div className="trend-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke="var(--cs-line)" strokeDasharray="3 4" vertical={false} />
                      <XAxis
                        dataKey="date_label"
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={28}
                        tick={{ fill: 'var(--cs-muted)', fontSize: 'var(--text-caption)' }}
                      />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: 'var(--cs-muted)', fontSize: 'var(--text-caption)' }} />
                      <Tooltip
                        formatter={(value) => [`${value ?? '—'} / 100`, 'Posture score']}
                        labelFormatter={(label) => `Scan ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="posture_score"
                        stroke="var(--cs-blue)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: 'var(--cs-card)', strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="surface-card priority-card">
              <div className="section-heading">
                <div>
                  <p className="card-kicker">Action required</p>
                  <h2>Top priority findings</h2>
                </div>
                <Link className="text-link" to="/findings">View all <span aria-hidden="true">→</span></Link>
              </div>
              {dashboard.top_findings.length === 0 ? (
                <EmptyState
                  title={scans.length === 0 ? 'No findings yet' : 'No open priority findings'}
                  description={scans.length === 0 ? 'Run a scan to see prioritized security and cost findings.' : 'The latest completed scan has no open findings.'}
                />
              ) : (
                <div className="priority-list">
                  {dashboard.top_findings.map((finding) => (
                    <Link
                      to={`/findings?scan_id=${encodeURIComponent(finding.scan_id)}`}
                      className="priority-row"
                      key={finding.id}
                    >
                      <span className="finding-row-severity">
                        <SeverityPill severity={finding.severity} />
                      </span>
                      <span className="priority-copy">
                        <strong>{finding.title}</strong>
                        <small>{finding.resource_id} · {finding.rule_id}</small>
                      </span>
                      <span className="priority-region">{finding.region}</span>
                    </Link>
                  ))}
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  )
}

function PostureGauge({
  counts,
  total,
  openFindings,
}: {
  counts?: Partial<SeverityCounts>
  total: number
  openFindings: number
}) {
  const colors: Record<keyof SeverityCounts, string> = {
    critical: '#F43F5E',
    high: '#F59E0B',
    medium: '#F6A2B0',
    low: '#10B981',
  }
  const segments = severityOrder.reduce<Array<{ severity: keyof SeverityCounts; start: number; end: number }>>(
    (items, severity) => {
      const value = counts?.[severity] ?? 0
      if (!value || total === 0) return items
      const start = items.at(-1)?.end ?? 150
      return [...items, { severity, start, end: start + (value / total) * 240 }]
    },
    [],
  )

  return (
    <div className="posture-gauge">
      <svg viewBox="0 0 200 200" role="img" aria-label={`${total} findings by severity`}>
        <path className="gauge-track" d={describeArc(100, 100, 78, 150, 390)} />
        {segments.map(({ severity, start, end }) => (
            <path
              key={severity}
              d={describeArc(100, 100, 78, start, end)}
              fill="none"
              stroke={colors[severity]}
              strokeWidth="18"
              strokeLinecap="round"
            />
        ))}
      </svg>
      <div className="gauge-center">
        <strong className="kpi-number">{openFindings.toLocaleString()}</strong>
        <span>Findings</span>
      </div>
    </div>
  )
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const point = (angle: number) => {
    const radians = (angle * Math.PI) / 180
    return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)]
  }
  const [startX, startY] = point(startAngle)
  const [endX, endY] = point(endAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
}

function CostSparkline({
  available,
  prior,
  current,
}: {
  available: boolean
  prior?: string | null
  current?: string | null
}) {
  if (!available || prior === null || prior === undefined || current === null || current === undefined) {
    return <span className="cost-sparkline-empty" aria-hidden="true"><Minus size={18} /></span>
  }
  const priorValue = Number(prior)
  const currentValue = Number(current)
  if (!Number.isFinite(priorValue) || !Number.isFinite(currentValue)) {
    return <span className="cost-sparkline-empty" aria-hidden="true"><Minus size={18} /></span>
  }
  const max = Math.max(priorValue, currentValue, 0.01)
  const startY = 37 - (priorValue / max) * 25
  const endY = 37 - (currentValue / max) * 25

  return (
    <svg className="cost-sparkline" viewBox="0 0 100 48" aria-hidden="true">
      <path d={`M 4 ${startY} C 26 ${startY}, 30 ${endY}, 70 ${endY} S 90 ${endY}, 94 ${endY}`} />
      <circle cx="94" cy={endY} r="3.5" />
    </svg>
  )
}

function QuickAccessCard({
  to,
  title,
  tone,
  icon,
}: {
  to: string
  title: string
  tone: 'blue' | 'mint' | 'coral' | 'amber' | 'violet'
  icon: ReactNode
}) {
  return (
    <Link to={to} className="quick-access-card surface-card">
      <PastelIconBadge tone={tone}>{icon}</PastelIconBadge>
      <span>{title}</span>
      <i aria-hidden="true"><ArrowRight size={17} /></i>
    </Link>
  )
}
