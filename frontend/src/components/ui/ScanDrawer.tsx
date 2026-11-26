import { Activity } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage, getScanDetail } from '../../services/api'
import type { ScanDetailRead, ScanRead } from '../../types/api'
import { Drawer } from './Drawer'
import {
  DrawerMetric,
  DrawerMetricGrid,
  DrawerRegionList,
  DrawerSeverityTiles,
} from './DrawerElements'
import { ErrorState, LoadingState } from './Feedback'
import { formatDate } from '../../utils/format'

export function ScanDrawer({
  scan,
  onClose,
}: {
  scan: ScanRead
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ScanDetailRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDetail(await getScanDetail(scan.id))
      setError(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [scan.id])

  useEffect(() => {
    let active = true
    getScanDetail(scan.id)
      .then((result) => {
        if (active) {
          setDetail(result)
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
  }, [scan.id])

  return (
    <Drawer
      title="Scan details"
      copyableId={scan.id}
      status={detail?.status ?? scan.status}
      icon={<Activity size={20} />}
      tone="blue"
      onClose={onClose}
      solidDetail
      footer={detail ? (
        <div className="drawer-footer-actions">
          <Link
            className="button button-primary"
            to={`/findings?scan_id=${encodeURIComponent(detail.id)}`}
            onClick={onClose}
          >
            Open findings for this scan <span aria-hidden="true">→</span>
          </Link>
          <button className="button button-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      ) : <button className="button button-secondary" type="button" onClick={onClose}>Close</button>}
    >
      {loading && <LoadingState label="Loading scan details…" />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {detail && (
        <div className="inspector-stack">
          <DrawerMetricGrid>
            <DrawerMetric label="Started" value={formatDate(detail.started_at)} />
            <DrawerMetric label="Completed" value={formatDate(detail.completed_at)} />
            <DrawerMetric
              label="Posture score"
              value={(
                <div className="drawer-posture-value">
                  <strong>{detail.posture_score ?? '—'}</strong>
                  <span>/100</span>
                </div>
              )}
              detail={(
                <div className="drawer-mini-progress" role="progressbar" aria-label="Posture score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={detail.posture_score ?? 0}>
                  <span style={{ width: `${detail.posture_score ?? 0}%` }} />
                </div>
              )}
            />
            <DrawerMetric label="Resources scanned" value={detail.resource_count.toLocaleString()} />
          </DrawerMetricGrid>

          <DrawerRegionList regions={detail.regions} />

          <section className="drawer-panel-section">
            <div className="drawer-section-heading"><h3>Severity breakdown</h3></div>
            <DrawerSeverityTiles counts={detail.severity_counts} />
          </section>

          <section className="drawer-panel-section">
            <h3>Collection errors</h3>
            {detail.collection_errors.length === 0 ? (
              <p className="muted-copy">No collection errors were reported.</p>
            ) : (
              <ul className="error-list">
                {detail.collection_errors.map((item, index) => (
                  <li key={`${item.service}-${item.operation}-${index}`}>
                    <strong>{item.service} · {item.operation}</strong>
                    <span>{item.code}: {item.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="drawer-panel-section">
            <h3>Findings ({detail.findings.length})</h3>
            {detail.findings.length === 0 ? (
              <p className="muted-copy">No findings were generated for this scan.</p>
            ) : (
              <div className="drawer-structured-finding-list">
                {detail.findings.map((finding) => (
                  <div className="drawer-structured-finding" data-severity={finding.severity.toLowerCase()} key={finding.id}>
                    <span className="drawer-structured-severity">{finding.severity}</span>
                    <div className="drawer-structured-copy">
                      <strong>{finding.title}</strong>
                      <code>{finding.resource_id}</code>
                      <small>{finding.rule_id} · {finding.region}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="drawer-panel-section">
            <h3>Cost summary</h3>
            <div className="drawer-cost-summary">
              <div>
                <span>Waste signals</span>
                <strong>{detail.cost_summary.total_waste_findings ?? '—'}</strong>
              </div>
              <div>
                <span>Cost Explorer</span>
                <strong>{detail.cost_summary.cost_explorer?.cost_explorer_available ? 'Available' : 'Unavailable'}</strong>
              </div>
            </div>
            {detail.cost_summary.detection_assumptions?.length ? (
              <ul className="error-list">
                {detail.cost_summary.detection_assumptions.map((assumption) => <li key={assumption}><span>{assumption}</span></li>)}
              </ul>
            ) : null}
          </section>
        </div>
      )}
    </Drawer>
  )
}
