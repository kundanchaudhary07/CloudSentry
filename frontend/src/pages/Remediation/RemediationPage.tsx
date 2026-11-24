import { CheckCheck, CircleDot, Search, ShieldAlert, Wrench } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
import { useScanContext } from '../../context/scan-context'
import { getApiErrorMessage, getFindings, updateFinding } from '../../services/api'
import { readOperatorSession } from '../../services/operatorSession'
import type { FindingDetailRead, FindingRead, FindingStatus } from '../../types/api'

export function RemediationPage() {
  const { scans, loading: scansLoading, error: scansError } = useScanContext()
  const [findings, setFindings] = useState<FindingRead[]>([])
  const [selected, setSelected] = useState<FindingRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<{ findingId: string; target: FindingStatus } | null>(null)
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queueSearch, setQueueSearch] = useState('')

  const loadQueue = useCallback(async () => {
    try {
      const [open, acknowledged] = await Promise.all([
        getFindings({ status: 'OPEN' }),
        getFindings({ status: 'ACKNOWLEDGED' }),
      ])
      setFindings([...open, ...acknowledged].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      setError(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (scans.length === 0) return
    let active = true
    Promise.all([
      getFindings({ status: 'OPEN' }),
      getFindings({ status: 'ACKNOWLEDGED' }),
    ])
      .then(([open, acknowledged]) => {
        if (active) {
          setFindings([...open, ...acknowledged].sort((a, b) => b.created_at.localeCompare(a.created_at)))
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
  }, [scans.length])

  const visibleFindings = useMemo(() => {
    const query = queueSearch.trim().toLowerCase()
    return findings.filter((finding) =>
      !query ||
      [finding.title, finding.rule_id, finding.resource_id, finding.resource_type]
        .some((value) => value.toLowerCase().includes(query)),
    )
  }, [findings, queueSearch])

  async function quickTransition(finding: FindingRead, nextStatus: FindingStatus) {
    setUpdating({ findingId: finding.id, target: nextStatus })
    setError(null)
    setUpdateFeedback(null)
    try {
      const updated = await updateFinding(finding.id, {
        status: nextStatus,
        actor: readOperatorSession()?.displayName,
      })
      if (nextStatus === 'RESOLVED') {
        setFindings((current) => current.filter((item) => item.id !== finding.id))
      } else {
        setFindings((current) => current.map((item) => item.id === finding.id ? updated : item))
      }
      setUpdateFeedback(nextStatus === 'RESOLVED' ? 'Finding resolved ✓' : 'Finding acknowledged ✓')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setUpdating(null)
    }
  }

  function applyUpdate(updated: FindingDetailRead) {
    if (updated.status === 'RESOLVED') {
      setFindings((current) => current.filter((item) => item.id !== updated.id))
    } else {
      setFindings((current) => current.map((item) => item.id === updated.id ? updated : item))
    }
    setSelected(updated)
  }

  return (
    <div>
      <PageHeader
        eyebrow="OPERATOR QUEUE"
        title="Remediation workflow"
        description="Track open and acknowledged findings. Actions update finding records only; AWS resources are never changed."
      />

      {scansError && <ErrorState message={scansError} />}
      {scansLoading && <LoadingState label="Checking scan history…" />}
      {!scansLoading && !scansError && scans.length === 0 && <NoScansState />}
      {error && <ErrorState message={error} onRetry={() => void loadQueue()} />}
      {updateFeedback && <div className="form-feedback success" role="status">{updateFeedback}</div>}
      {loading && scans.length > 0 && <LoadingState label="Loading the operator queue…" />}

      {!scansLoading && scans.length > 0 && !loading && !error && (
        <>
          <section className="operator-summary-grid" aria-label="Remediation queue totals">
            <OperatorSummaryCard label="Active queue" value={findings.length} tone="blue" icon={<Wrench size={19} />} />
            <OperatorSummaryCard label="Open" value={findings.filter((item) => item.status === 'OPEN').length} tone="amber" icon={<CircleDot size={19} />} />
            <OperatorSummaryCard label="Acknowledged" value={findings.filter((item) => item.status === 'ACKNOWLEDGED').length} tone="violet" icon={<CheckCheck size={19} />} />
            <OperatorSummaryCard label="High · critical" value={findings.filter((item) => item.severity === 'HIGH' || item.severity === 'CRITICAL').length} tone="coral" icon={<ShieldAlert size={19} />} />
          </section>

          <div className="toolbar surface-card">
            <label className="search-control">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search title, rule, or resource…"
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                aria-label="Search remediation queue"
              />
            </label>
            {queueSearch.trim() && (
              <button className="button button-secondary reset-filters-button" type="button" onClick={() => setQueueSearch('')}>
                Clear Filters
              </button>
            )}
            <span className="result-count">{visibleFindings.length} of {findings.length} active findings</span>
          </div>
          {visibleFindings.length === 0 ? (
            <EmptyState
              title={findings.length === 0 ? 'Queue is clear' : 'No matching findings'}
              description={findings.length === 0 ? 'No open or acknowledged findings are waiting for operator review.' : 'Clear the search filter to see the rest of the operator queue.'}
            />
          ) : (
            <div className="table-card surface-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Finding</th><th>Severity</th><th>Resource</th><th>Status</th><th>Last updated</th><th>Quick action</th></tr></thead>
                  <tbody>
                    {visibleFindings.map((finding) => (
                      <tr key={finding.id}>
                        <td>
                          <button className="table-primary-link" type="button" onClick={() => setSelected(finding)}>{finding.title}</button>
                          <span className="table-subtext">{finding.rule_id} · {finding.category}</span>
                        </td>
                        <td><SeverityPill severity={finding.severity} /></td>
                        <td>
                          <span className="resource-cell">{finding.resource_id}</span>
                          <span className="table-subtext">{finding.resource_type} · {finding.region}</span>
                        </td>
                        <td><StatusPill status={finding.status} /></td>
                        <td>{new Date(finding.updated_at).toLocaleDateString()}</td>
                        <td>
                          <div className="quick-actions">
                            {finding.status === 'OPEN' && (
                              <button
                                className="button button-table"
                                type="button"
                                onClick={() => void quickTransition(finding, 'ACKNOWLEDGED')}
                                disabled={updating?.findingId === finding.id}
                              >
                                {updating?.findingId === finding.id && updating.target === 'ACKNOWLEDGED' ? 'Saving…' : 'Acknowledge Finding'}
                              </button>
                            )}
                            <button
                              className="button button-table"
                              type="button"
                              onClick={() => void quickTransition(finding, 'RESOLVED')}
                              disabled={updating?.findingId === finding.id}
                            >
                              {updating?.findingId === finding.id && updating.target === 'RESOLVED'
                                ? 'Saving…'
                                : 'Mark Resolved'}
                            </button>
                          </div>
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

function OperatorSummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'blue' | 'amber' | 'violet' | 'coral'
  icon: ReactNode
}) {
  return (
    <article className="surface-card operator-summary-card">
      <PastelIconBadge tone={tone}>{icon}</PastelIconBadge>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-number">{value.toLocaleString()}</strong>
    </article>
  )
}
