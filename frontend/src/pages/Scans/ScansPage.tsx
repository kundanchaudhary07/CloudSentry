import { Activity, ArrowRight, Boxes, Clock3, FileText, MapPin, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ScanDrawer } from '../../components/ui/ScanDrawer'
import { DomainSection } from '../../components/ui/DomainSections'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import { ScanTriggerButton } from '../../components/ui/ScanTriggerButton'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoScansState,
  PageHeader,
  StatusPill,
} from '../../components/ui/Feedback'
import { formatDate, formatRegionsSummary } from '../../utils/format'
import { useScanContext } from '../../context/scan-context'
import { readScanSettings } from '../../services/scanSettings'
import type { ScanRead, ScanStatus } from '../../types/api'
import '../../styles/data-grid.css'

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
  const latestVisible = latestScan && visibleScans.some((scan) => scan.id === latestScan.id) ? latestScan : null
  const historicalScans = visibleScans.filter((scan) => scan.id !== latestScan?.id)

  return (
    <div>
      <PageHeader
        eyebrow="SCAN OPERATIONS"
        title="Scan history"
        description="Historical inventory runs, posture scores, severity counts, and collector errors."
        action={
          <ScanTriggerButton
            settings={readScanSettings()}
            label={scans.length === 0 ? 'Run First Scan →' : 'Run New Scan →'}
          />
        }
      />

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {loading && <LoadingState label="Loading scan history…" />}
      {!loading && scans.length === 0 && !error && <NoScansState />}

      {!loading && scans.length > 0 && (
        <>
          <section className="operator-summary-grid scan-summary-grid remediation-kpi-grid" aria-label="Scan history summary">
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
            <div className="scan-groups">
              {latestVisible && (
                <ScanGroup id="latest-scan" title="Latest scan" description="Most recent inventory and posture snapshot" count={1}>
                  <ScanDataCard scan={latestVisible} onOpen={() => setSelected(latestVisible)} />
                </ScanGroup>
              )}
              {historicalScans.length > 0 && (
                <ScanGroup id="historical-scans" title="Historical scan runs" description="Previous inventory and posture snapshots" count={historicalScans.length}>
                  <div className="data-grid-list">
                    {historicalScans.map((scan) => (
                      <ScanDataCard key={scan.id} scan={scan} onOpen={() => setSelected(scan)} />
                    ))}
                  </div>
                </ScanGroup>
              )}
            </div>
          )}
        </>
      )}
      {selected && <ScanDrawer scan={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ScanGroup({
  id,
  title,
  description,
  count,
  children,
}: {
  id: string
  title: string
  description: string
  count: number
  children: ReactNode
}) {
  return (
    <DomainSection
      id={id}
      domain={{ id: 'compute', label: title, title, subtitle: description }}
      count={count}
      className="scan-domain-section"
    >
      {children}
    </DomainSection>
  )
}

function ScanDataCard({ scan, onOpen }: { scan: ScanRead; onOpen: () => void }) {
  const score = scan.posture_score
  const duration = formatScanDuration(scan.started_at, scan.completed_at)
  return (
    <article
      className="data-grid-row scan-row-card"
      role="group"
      tabIndex={0}
      aria-label={`Inspect scan from ${formatDate(scan.started_at)}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="scan-card-primary">
        <span className="resource-type-icon"><Activity size={17} aria-hidden="true" /></span>
        <div className="data-grid-title">
          <strong>{formatDate(scan.started_at)}</strong>
          <small>{scan.completed_at ? `Completed ${formatDate(scan.completed_at)}` : 'In progress'}</small>
        </div>
      </div>
      <div className="scan-card-meta">
        <StatusPill status={scan.status} />
        <span>{scan.resource_count.toLocaleString()} resources</span>
        <span
          className="region-label scan-region-summary"
          title={scan.regions.length > 2 ? scan.regions.join(', ') : undefined}
        >
          <MapPin size={13} aria-hidden="true" />
          {formatRegionsSummary(scan.regions)}
        </span>
        <span className="region-label"><Clock3 size={13} aria-hidden="true" />{duration}</span>
      </div>
      <div className="scan-card-posture">
        <div className="scan-card-posture-head">
          <span>Posture score</span>
          <strong>{score === null ? '—' : `${score}/100`}</strong>
        </div>
        <div
          className="scan-posture-track"
          role="progressbar"
          aria-label="Posture score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score ?? 0}
          aria-valuetext={score === null ? 'Unavailable' : `${score} out of 100`}
        >
          <div className="scan-posture-fill" style={{ width: `${score ?? 0}%` }} />
        </div>
      </div>
      <div className="scan-severity-counts" aria-label="Finding counts by severity">
        <span className="scan-severity-count critical">Critical {scan.severity_counts.critical ?? 0}</span>
        <span className="scan-severity-count high">High {scan.severity_counts.high ?? 0}</span>
        <span className="scan-severity-count medium">Medium {scan.severity_counts.medium ?? 0}</span>
        <span className="scan-severity-count low">Low {scan.severity_counts.low ?? 0}</span>
      </div>
      <button
        className="data-grid-inspect"
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
      >
        Inspect <ArrowRight size={15} aria-hidden="true" />
      </button>
    </article>
  )
}

function formatScanDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return 'Running'
  const elapsedMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt))
  const seconds = Math.floor(elapsedMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainderSeconds = seconds % 60
  return remainderSeconds ? `${minutes}m ${remainderSeconds}s` : `${minutes}m`
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
    <article className="surface-card operator-summary-card remediation-kpi-card">
      <PastelIconBadge tone={tone}>{icon}</PastelIconBadge>
      <div>
        <span className="kpi-label">{label}</span>
        {status
          ? <StatusPill status={status} className="kpi-status-pill" />
          : <strong className={valueKind === 'number' ? 'kpi-number' : 'kpi-status-text'}>{value}</strong>}
      </div>
    </article>
  )
}
