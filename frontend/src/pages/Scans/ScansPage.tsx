import { Activity, ArrowRight, Boxes, FileText, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ScanDrawer } from '../../components/ui/ScanDrawer'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoScansState,
  PageHeader,
  StatusPill,
} from '../../components/ui/Feedback'
import { formatDate } from '../../utils/format'
import { useScanContext } from '../../context/scan-context'
import type { ScanRead, ScanStatus } from '../../types/api'

const scanStatuses: ScanStatus[] = ['RUNNING', 'COMPLETED', 'FAILED']

export function ScansPage() {
  const { scans, loading, error, refresh } = useScanContext()
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<ScanRead | null>(null)
  const latestScan = scans[0]
  const latestCompleted = scans.find((scan) => scan.status === 'COMPLETED')
  const visibleScans = useMemo(
    () => scans.filter((scan) => !status || scan.status === status),
    [scans, status],
  )

  return (
    <div>
      <PageHeader
        eyebrow="SCAN OPERATIONS"
        title="Scan history"
        description="Historical inventory runs, posture scores, severity counts, and collector errors."
      />

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {loading && <LoadingState label="Loading scan history…" />}
      {!loading && scans.length === 0 && !error && <NoScansState />}

      {!loading && scans.length > 0 && (
        <>
          <section className="operator-summary-grid scan-summary-grid" aria-label="Scan history summary">
            <ScanSummaryCard label="Total scans" value={scans.length.toLocaleString()} valueKind="number" tone="blue" icon={<FileText size={19} />} />
            <ScanSummaryCard label="Latest status" status={latestScan?.status} tone={latestScan?.status === 'FAILED' ? 'coral' : 'mint'} icon={<Activity size={19} />} />
            <ScanSummaryCard label="Latest inventory" value={latestCompleted?.resource_count.toLocaleString() ?? '—'} valueKind={latestCompleted ? 'number' : 'text'} tone="violet" icon={<Boxes size={19} />} />
            <ScanSummaryCard label="Latest posture" value={latestCompleted?.posture_score === null || latestCompleted?.posture_score === undefined ? '—' : `${latestCompleted.posture_score}/100`} valueKind={latestCompleted?.posture_score === null || latestCompleted?.posture_score === undefined ? 'text' : 'number'} tone="amber" icon={<ShieldCheck size={19} />} />
          </section>

          <div className="toolbar surface-card scan-filter-toolbar">
            <div className="resource-type-pills" role="group" aria-label="Filter by scan status">
              <button type="button" className={`filter-pill${!status ? ' selected' : ''}`} aria-pressed={!status} onClick={() => setStatus('')}>
                All ({scans.length})
              </button>
              {scanStatuses.map((value) => (
                <button
                  type="button"
                  className={`filter-pill${status === value ? ' selected' : ''}`}
                  aria-pressed={status === value}
                  key={value}
                  onClick={() => setStatus(value)}
                >
                  {value[0] + value.slice(1).toLowerCase()} ({scans.filter((scan) => scan.status === value).length})
                </button>
              ))}
            </div>
            {status && (
              <button className="button button-secondary reset-filters-button" type="button" onClick={() => setStatus('')}>
                Clear Filters
              </button>
            )}
            <span className="result-count">{visibleScans.length} of {scans.length} scans</span>
          </div>
          {visibleScans.length === 0 ? (
            <EmptyState title="No scans in this status" description="Choose another status to see its scan runs." />
          ) : (
            <div className="table-card surface-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Status</th>
                      <th>Resources</th>
                      <th>Posture</th>
                      <th>Severity counts</th>
                      <th>Regions</th>
                      <th><span className="sr-only">Inspect</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleScans.map((scan) => (
                      <tr key={scan.id}>
                        <td>
                          <button className="table-primary-link" type="button" onClick={() => setSelected(scan)}>
                            {formatDate(scan.started_at)}
                          </button>
                          <span className="table-subtext">{scan.completed_at ? `Completed ${formatDate(scan.completed_at)}` : 'Not completed'}</span>
                        </td>
                        <td><StatusPill status={scan.status} /></td>
                        <td>{scan.resource_count.toLocaleString()}</td>
                        <td>{scan.posture_score === null ? '—' : `${scan.posture_score} / 100`}</td>
                        <td>
                          <div className="severity-inline">
                            <span className="critical-text">C {scan.severity_counts.critical ?? 0}</span>
                            <span className="high-text">H {scan.severity_counts.high ?? 0}</span>
                            <span>M {scan.severity_counts.medium ?? 0}</span>
                            <span>L {scan.severity_counts.low ?? 0}</span>
                          </div>
                        </td>
                        <td>{scan.regions.length ? scan.regions.join(', ') : '—'}</td>
                        <td>
                          <button className="circle-arrow-button" type="button" onClick={() => setSelected(scan)} aria-label={`Inspect scan from ${formatDate(scan.started_at)}`}>
                            <ArrowRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {selected && <ScanDrawer scan={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ScanSummaryCard({
  label,
  value,
  valueKind = 'number',
  status,
  tone,
  icon,
}: {
  label: string
  value?: string
  valueKind?: 'number' | 'text'
  status?: string
  tone: 'blue' | 'mint' | 'amber' | 'violet' | 'coral'
  icon: ReactNode
}) {
  return (
    <article className="surface-card operator-summary-card">
      <PastelIconBadge tone={tone}>{icon}</PastelIconBadge>
      <span className="kpi-label">{label}</span>
      {status
        ? <StatusPill status={status} className="kpi-status-pill" />
        : <strong className={valueKind === 'number' ? 'kpi-number' : 'kpi-status-text'}>{value}</strong>}
    </article>
  )
}
