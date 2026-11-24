import { Activity } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage, getScanDetail } from '../../services/api'
import type { ScanDetailRead, ScanRead } from '../../types/api'
import { Drawer } from './Drawer'
import { ErrorState, LoadingState, SeverityPill, StatusPill } from './Feedback'
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
    <Drawer title="Scan details" subtitle={scan.id} icon={<Activity size={20} />} tone="blue" onClose={onClose} solidDetail>
      {loading && <LoadingState label="Loading scan details…" />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {detail && (
        <div className="inspector-stack">
          <section className="inspector-section">
            <div className="finding-detail-meta">
              <StatusPill status={detail.status} />
              <span className="meta-text">{detail.resource_count.toLocaleString()} resources</span>
            </div>
            <dl className="definition-list">
              <div><dt>Started</dt><dd>{formatDate(detail.started_at)}</dd></div>
              <div><dt>Completed</dt><dd>{formatDate(detail.completed_at)}</dd></div>
              <div><dt>Posture score</dt><dd>{detail.posture_score ?? '—'}</dd></div>
              <div><dt>Regions</dt><dd>{detail.regions.length ? detail.regions.join(', ') : '—'}</dd></div>
            </dl>
          </section>
          <section className="inspector-section">
            <h3>Severity counts</h3>
            <div className="severity-counts drawer-counts">
              {Object.entries(detail.severity_counts).map(([severity, count]) => (
                <span key={severity}><i className={`dot ${severity}`} /> {severity} <b>{count}</b></span>
              ))}
            </div>
          </section>
          <section className="inspector-section">
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
          <section className="inspector-section">
            <h3>Findings ({detail.findings.length})</h3>
            {detail.findings.length === 0 ? (
              <p className="muted-copy">No findings were generated for this scan.</p>
            ) : (
              <div className="drawer-finding-list">
                {detail.findings.map((finding) => (
                  <div className="drawer-finding-row" key={finding.id}>
                    <SeverityPill severity={finding.severity} />
                    <span>{finding.title} <small>{finding.resource_id}</small></span>
                  </div>
                ))}
              </div>
            )}
            <Link className="text-link" to={`/findings?scan_id=${encodeURIComponent(detail.id)}`} onClick={onClose}>
              Open findings for this scan <span aria-hidden="true">→</span>
            </Link>
          </section>
          <section className="inspector-section">
            <h3>Cost summary</h3>
            <pre className="json-view">{JSON.stringify(detail.cost_summary, null, 2)}</pre>
          </section>
        </div>
      )}
    </Drawer>
  )
}
