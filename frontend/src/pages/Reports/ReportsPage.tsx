import { Download, FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader, ErrorState, LoadingState, NoScansState, EmptyState } from '../../components/ui/Feedback'
import { DomainSection, DomainSegmentedControl } from '../../components/ui/DomainSections'
import { useScanContext } from '../../context/scan-context'
import { getApiErrorMessage, getFindings, getInventory } from '../../services/api'
import type { FindingRead, ResourceRead } from '../../types/api'
import { domains, getFindingDomain, getResourceDomain } from '../../utils/dataDomains'
import type { DomainFilter, DomainId } from '../../utils/dataDomains'
import { formatDate, formatRegionsSummary } from '../../utils/format'
import '../../styles/data-grid.css'

export function ReportsPage() {
  const { scans, loading: scansLoading, error: scansError } = useScanContext()
  const latestCompleted = scans.find((scan) => scan.status === 'COMPLETED')
  const latestCompletedId = latestCompleted?.id
  const [resources, setResources] = useState<ResourceRead[]>([])
  const [findings, setFindings] = useState<FindingRead[]>([])
  const [domain, setDomain] = useState<DomainFilter>('all')
  const [loading, setLoading] = useState(true)
  const [loadedScanId, setLoadedScanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reportLoading = Boolean(latestCompletedId && (loading || loadedScanId !== latestCompletedId))

  useEffect(() => {
    if (!latestCompletedId) return
    let active = true
    Promise.all([
      getInventory({ scan_id: latestCompletedId }),
      getFindings({ scan_id: latestCompletedId }),
    ])
      .then(([inventory, scanFindings]) => {
        if (active) {
          setResources(inventory)
          setFindings(scanFindings)
          setLoadedScanId(latestCompletedId)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setLoadedScanId(latestCompletedId)
          setError(getApiErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [latestCompletedId, reloadKey])

  const reports = useMemo(() => domains.map((domainDefinition) => ({
    domain: domainDefinition,
    resources: resources.filter((resource) => getResourceDomain(resource) === domainDefinition.id),
    findings: findings.filter((finding) => getFindingDomain(finding) === domainDefinition.id),
  })), [resources, findings])
  const visibleReports = reports.filter((report) => domain === 'all' || report.domain.id === domain)
  const domainCounts = reports.reduce<Record<DomainId, number>>((counts, report) => {
    counts[report.domain.id] = report.resources.length + report.findings.length
    return counts
  }, { compute: 0, security: 0, storage: 0, finops: 0 })

  function downloadReport(domainId: DomainId) {
    const report = reports.find((item) => item.domain.id === domainId)
    if (!report || !latestCompleted) return
    const content = {
      report: report.domain.title,
      scan_id: latestCompleted.id,
      generated_at: new Date().toISOString(),
      resources: report.resources,
      findings: report.findings,
    }
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `cloudsentry-${domainId}-report-${latestCompleted.id.slice(0, 8)}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function retryReport() {
    setError(null)
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  return (
    <div>
      <PageHeader
        eyebrow="REPORTING"
        title="Cloud reports"
        description="Domain-focused report previews generated from the latest completed read-only scan."
        icon={<FileText size={20} />}
      />

      {scansError && <ErrorState message={scansError} />}
      {scansLoading && <LoadingState label="Checking scan history…" />}
      {!scansLoading && !scansError && scans.length === 0 && <NoScansState />}
      {!scansLoading && scans.length > 0 && !latestCompleted && (
        <EmptyState title="No completed scan yet" description="Domain reports are available after a scan completes successfully." />
      )}
      {error && <ErrorState message={error} onRetry={retryReport} />}
      {reportLoading && <LoadingState label="Preparing domain report previews…" />}

      {latestCompleted && !reportLoading && !error && (
        <>
          <section className="surface-card report-preview-summary" aria-label="Report source scan">
            <div className="data-grid-title">
              <strong>Latest completed scan</strong>
              <small>
                {formatDate(latestCompleted.started_at)} · {latestCompleted.resource_count.toLocaleString()} resources ·{' '}
                <span title={latestCompleted.regions.length > 2 ? latestCompleted.regions.join(', ') : undefined}>
                  {latestCompleted.regions.length ? formatRegionsSummary(latestCompleted.regions) : 'No regions recorded'}
                </span>
              </small>
            </div>
            <div className="report-preview-metrics">
              <span>{resources.length.toLocaleString()} resources</span>
              <span>{findings.length.toLocaleString()} findings</span>
              <span>{latestCompleted.posture_score === null ? 'Posture unavailable' : `Posture ${latestCompleted.posture_score}/100`}</span>
            </div>
          </section>

          <DomainSegmentedControl value={domain} counts={domainCounts} onChange={setDomain} />

          <div className="domain-section-list">
            {visibleReports.map(({ domain: section, resources: domainResources, findings: domainFindings }) => (
              <DomainSection
                key={section.id}
                domain={section}
                count={domainResources.length + domainFindings.length}
              >
                <article className="report-preview-card">
                  <div className="report-preview-summary">
                    <div className="data-grid-title">
                      <strong>{section.title} report preview</strong>
                      <small>Generated from scan {latestCompleted.id.slice(0, 8)}</small>
                    </div>
                    <div className="report-preview-metrics">
                      <span>{domainResources.length.toLocaleString()} resources</span>
                      <span>{domainFindings.length.toLocaleString()} findings</span>
                    </div>
                    <button className="domain-action-button" type="button" onClick={() => downloadReport(section.id)}>
                      <Download size={14} aria-hidden="true" /> Export JSON
                    </button>
                  </div>
                  {domainResources.length + domainFindings.length === 0 ? (
                    <div className="reports-empty-state">No records in this domain for the latest completed scan.</div>
                  ) : (
                    <div className="report-preview-items" aria-label={`${section.title} preview records`}>
                      {domainResources.slice(0, 2).map((resource) => (
                        <span key={resource.id}>
                          Resource · {resource.name || resource.resource_id} · {resource.resource_type} · {resource.region}
                        </span>
                      ))}
                      {domainFindings.slice(0, 2).map((finding) => (
                        <span key={finding.id}>
                          Finding · {finding.title} · {finding.rule_id} · {finding.severity}
                        </span>
                      ))}
                      {domainResources.length + domainFindings.length > 4 && (
                        <span>+{domainResources.length + domainFindings.length - 4} more records in export</span>
                      )}
                    </div>
                  )}
                </article>
              </DomainSection>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
