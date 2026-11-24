import { ArrowRight, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FindingDrawer } from '../../components/ui/FindingDrawer'
import { GradientHeroBanner } from '../../components/ui/GradientHeroBanner'
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
import { useScanContext } from '../../context/scan-context'
import { getApiErrorMessage, getFindings } from '../../services/api'
import type {
  FindingCategory,
  FindingRead,
  FindingSeverity,
  FindingStatus,
  ResourceType,
} from '../../types/api'

const severities: FindingSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const statuses: FindingStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED']
const categories: FindingCategory[] = ['SECURITY', 'COST']
const resourceTypes: ResourceType[] = [
  'EC2',
  'SecurityGroup',
  'EBS',
  'S3',
  'IAMUser',
  'IAMRole',
  'RDS',
  'CloudTrail',
]

export function FindingsPage() {
  const { scans, loading: scansLoading, error: scansError } = useScanContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedScanId = searchParams.get('scan_id') ?? undefined
  const queryFromUrl = searchParams.get('search') ?? ''
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const status = searchParams.get('status') ?? ''
  const [resourceType, setResourceType] = useState('')
  const [allFindings, setAllFindings] = useState<FindingRead[]>([])
  const [loadedScanId, setLoadedScanId] = useState<string | undefined>()
  const [selected, setSelected] = useState<FindingRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const latestCompleted = scans.find((scan) => scan.status === 'COMPLETED')
  const scanId = requestedScanId ?? latestCompleted?.id
  const summaryScan = scans.find((scan) => scan.id === scanId) ?? latestCompleted
  const scanFindings = useMemo(
    () => loadedScanId === scanId ? allFindings : [],
    [allFindings, loadedScanId, scanId],
  )
  const findingsLoading = Boolean(scanId && (loading || loadedScanId !== scanId))
  const findingsError = loadedScanId === scanId ? error : null
  const severityCount = (value: FindingSeverity) =>
    scanFindings.filter((finding) => finding.severity === value).length
  const statusCount = (value: FindingStatus) =>
    scanFindings.filter((finding) => finding.status === value).length
  const categoryCount = (value: FindingCategory) =>
    scanFindings.filter((finding) => finding.category === value).length
  const resourceTypeCount = (value: ResourceType) =>
    scanFindings.filter((finding) => finding.resource_type === value).length
  const activeFilters = Boolean(category || severity || status || resourceType || queryFromUrl.trim())
  const severityTotal = severities.reduce((total, value) => total + severityCount(value), 0)
  const findings = useMemo(() => {
    const query = queryFromUrl.trim().toLowerCase()
    return scanFindings.filter((finding) =>
      (!category || finding.category === category) &&
      (!severity || finding.severity === severity) &&
      (!status || finding.status === status) &&
      (!resourceType || finding.resource_type === resourceType) &&
      (!query || [finding.title, finding.description, finding.resource_id, finding.resource_type]
        .some((value) => value.toLowerCase().includes(query))),
    )
  }, [scanFindings, category, severity, status, resourceType, queryFromUrl])

  function setSearch(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('search', value)
    else next.delete('search')
    setSearchParams(next, { replace: true })
  }

  function setStatus(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('status', value)
    else next.delete('status')
    setSearchParams(next, { replace: true })
  }

  function resetFilters() {
    setCategory('')
    setSeverity('')
    setResourceType('')
    const next = new URLSearchParams(searchParams)
    next.delete('search')
    next.delete('status')
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!scanId) return
    let active = true
    getFindings({ scan_id: scanId })
      .then((result) => {
        if (active) {
          setAllFindings(result)
          setLoadedScanId(scanId)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setLoadedScanId(scanId)
          setError(getApiErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [scanId, reloadKey])

  function retryFindings() {
    setError(null)
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  function applyUpdate(updated: FindingRead) {
    setAllFindings((current) => current.map((item) => item.id === updated.id ? updated : item))
    setSelected(updated)
  }

  return (
    <div>
      <PageHeader
        eyebrow="SECURITY & COST"
        title="Findings"
        description="Filter evaluated findings and review the underlying rule context."
      />

      {summaryScan && (
        <section className="finding-summary-grid" aria-label="Scan posture summary">
          <GradientHeroBanner
            className="finding-posture-banner"
            eyebrow="Security posture"
            title={summaryScan.posture_score === null ? 'Score unavailable' : `Posture · ${summaryScan.posture_score}/100`}
            description="Severity totals from the selected scan. Findings remain reviewable in their original rule context."
            status={`${severityTotal} findings in scan`}
            icon={<ShieldAlert size={23} />}
          />
          <article className="surface-card severity-breakdown-card" aria-label="Severity breakdown">
            <div className="section-heading severity-breakdown-heading">
              <div>
                <p className="card-kicker">FINDINGS MIX</p>
                <h2>Severity Breakdown</h2>
              </div>
              <span className="severity-total">{severityTotal} total</span>
            </div>
            <div className="severity-breakdown-strip">
              {severities.map((value) => {
                const tone = value === 'CRITICAL' ? 'coral' : value === 'HIGH' ? 'amber' : value === 'MEDIUM' ? 'blue' : 'mint'
                return (
                  <button
                    className={`severity-breakdown-item${severity === value ? ' selected' : ''}`}
                    type="button"
                    aria-pressed={severity === value}
                    onClick={() => setSeverity(severity === value ? '' : value)}
                    key={value}
                  >
                    <PastelIconBadge tone={tone}><ShieldAlert size={17} /></PastelIconBadge>
                    <span>
                      <small>{value[0] + value.slice(1).toLowerCase()}</small>
                      <strong className="kpi-number">{severityCount(value)}</strong>
                    </span>
                  </button>
                )
              })}
            </div>
          </article>
        </section>
      )}

      {scansError && <ErrorState message={scansError} />}
      {scansLoading && <LoadingState label="Checking scan history…" />}
      {!scansLoading && !scansError && scans.length === 0 && <NoScansState />}
      {!scansLoading && scans.length > 0 && !latestCompleted && (
        <EmptyState title="No completed scan yet" description="Findings appear after inventory evaluation completes." />
      )}

      {scanId && (
        <>
          <div className="toolbar surface-card filter-toolbar">
            <label className="search-control">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search findings or resource IDs…"
                value={queryFromUrl}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search findings"
              />
            </label>
            {activeFilters && (
              <button className="button button-secondary reset-filters-button" type="button" onClick={resetFilters}>
                Clear Filters
              </button>
            )}
            <span className="result-count">{findings.length} of {scanFindings.length} findings</span>
          </div>

          <section className="surface-card findings-filter-panel" aria-label="Finding filters">
            <FilterGroup label="Status">
              <FilterPill label="All" count={scanFindings.length} active={!status} onClick={() => setStatus('')} />
              {statuses.map((value) => (
                <FilterPill key={value} label={value[0] + value.slice(1).toLowerCase()} count={statusCount(value)} active={status === value} onClick={() => setStatus(value)} />
              ))}
            </FilterGroup>
            <FilterGroup label="Severity">
              <FilterPill label="All" count={scanFindings.length} active={!severity} onClick={() => setSeverity('')} />
              {severities.map((value) => (
                <FilterPill key={value} label={value} count={severityCount(value)} active={severity === value} onClick={() => setSeverity(value)} />
              ))}
            </FilterGroup>
            <FilterGroup label="Category">
              <FilterPill label="All" count={scanFindings.length} active={!category} onClick={() => setCategory('')} />
              {categories.map((value) => (
                <FilterPill key={value} label={value} count={categoryCount(value)} active={category === value} onClick={() => setCategory(value)} />
              ))}
            </FilterGroup>
            <FilterGroup label="Resource type">
              <FilterPill label="All" count={scanFindings.length} active={!resourceType} onClick={() => setResourceType('')} />
              {resourceTypes.map((value) => (
                <FilterPill key={value} label={value} count={resourceTypeCount(value)} active={resourceType === value} onClick={() => setResourceType(value)} />
              ))}
            </FilterGroup>
          </section>

          {findingsError && <ErrorState message={findingsError} onRetry={retryFindings} />}
          {findingsLoading && <LoadingState label="Loading findings…" />}
          {!findingsLoading && !findingsError && findings.length === 0 && (
            <EmptyState
              title={scanFindings.length === 0 ? 'No findings in this scan' : 'No findings match these filters'}
              description={scanFindings.length === 0 ? 'This scan produced no findings.' : 'Reset or widen the active filters to see matching findings.'}
            />
          )}
          {!findingsLoading && findings.length > 0 && (
            <div className="table-card surface-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Finding</th>
                      <th>Severity</th>
                      <th>Category</th>
                      <th>Resource</th>
                      <th>Region</th>
                      <th>Status</th>
                      <th><span className="sr-only">Inspect</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((finding) => (
                      <tr key={finding.id}>
                        <td>
                          <button className="table-primary-link" type="button" onClick={() => setSelected(finding)}>
                            {finding.title}
                          </button>
                          <span className="rule-id-chip">{finding.rule_id}</span>
                        </td>
                        <td><SeverityPill severity={finding.severity} /></td>
                        <td>{finding.category}</td>
                        <td>
                          <span className="resource-cell">{finding.resource_id}</span>
                          <span className="table-subtext">{finding.resource_type}</span>
                        </td>
                        <td>{finding.region}</td>
                        <td><StatusPill status={finding.status} /></td>
                        <td>
                          <button className="circle-arrow-button" type="button" onClick={() => setSelected(finding)} aria-label={`Open ${finding.rule_id}`}>
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

      {selected && (
        <FindingDrawer
          finding={selected}
          onClose={() => setSelected(null)}
          onUpdated={applyUpdate}
        />
      )}
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="finding-filter-group">
      <span>{label}</span>
      <div className="finding-filter-pills">{children}</div>
    </div>
  )
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`filter-pill${active ? ' selected' : ''}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {label} ({count.toLocaleString()})
    </button>
  )
}
