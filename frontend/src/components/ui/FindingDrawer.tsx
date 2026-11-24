import { ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage, getFindingDetail, updateFinding } from '../../services/api'
import { readOperatorSession } from '../../services/operatorSession'
import type { FindingDetailRead, FindingRead, FindingStatus } from '../../types/api'
import { Drawer } from './Drawer'
import { ErrorState, LoadingState, SeverityPill, StatusPill } from './Feedback'
import { formatDate } from '../../utils/format'

const findingStatuses: FindingStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED']

export function FindingDrawer({
  finding,
  onClose,
  onUpdated,
}: {
  finding: FindingRead
  onClose: () => void
  onUpdated: (finding: FindingDetailRead) => void
}) {
  const [detail, setDetail] = useState<FindingDetailRead | null>(null)
  const [status, setStatus] = useState<FindingStatus>(finding.status)
  const [notes, setNotes] = useState(finding.notes ?? '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const loadDetail = useCallback(async () => {
    try {
      const result = await getFindingDetail(finding.id)
      setDetail(result)
      setStatus(result.status)
      setNotes(result.notes ?? '')
      setError(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [finding.id])

  useEffect(() => {
    let active = true
    getFindingDetail(finding.id)
      .then((result) => {
        if (active) {
          setDetail(result)
          setStatus(result.status)
          setNotes(result.notes ?? '')
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
  }, [finding.id])

  async function saveUpdate() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await updateFinding(finding.id, {
        status,
        notes,
        actor: readOperatorSession()?.displayName,
      })
      setDetail(updated)
      setStatus(updated.status)
      setNotes(updated.notes ?? '')
      setSaved(true)
      onUpdated(updated)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  const current = detail ?? finding
  const hasChanges = status !== current.status || notes !== (current.notes ?? '')
  const saveLabel = saving
    ? 'Saving…'
    : saved
      ? 'Saved ✓'
      : status !== current.status
        ? status === 'OPEN'
          ? 'Reopen Finding'
          : status === 'ACKNOWLEDGED'
            ? 'Acknowledge Finding'
            : 'Mark Resolved'
        : hasChanges
          ? 'Save Notes'
          : 'No Changes'

  return (
    <Drawer
      title={current.title}
      subtitle={`${current.rule_id} · ${current.resource_id}`}
      icon={<ShieldAlert size={20} />}
      tone="coral"
      onClose={onClose}
    >
      {loading && <LoadingState label="Loading finding details…" />}
      {error && <ErrorState message={error} onRetry={() => void loadDetail()} />}
      <div className="finding-detail-stack">
        <div className="finding-detail-meta">
          <SeverityPill severity={current.severity} />
          <StatusPill status={current.status} />
          <span className="meta-text">{current.category}</span>
          <span className="meta-text">{current.region}</span>
        </div>

        <section className="inspector-section">
          <h3>Rule description</h3>
          <p>{current.description}</p>
        </section>
        <section className="inspector-section">
          <h3>Recommended action</h3>
          <p>{current.recommendation}</p>
        </section>
        {Object.keys(current.details).length > 0 && (
          <section className="inspector-section">
            <h3>Finding details</h3>
            <pre className="json-view">{JSON.stringify(current.details, null, 2)}</pre>
          </section>
        )}

        <section className="inspector-section update-section">
          <h3>Operator update</h3>
          <label className="field-label" htmlFor="finding-status">Status</label>
          <select
            id="finding-status"
            className="input-control"
            value={status}
            onChange={(event) => {
              setSaved(false)
              setStatus(event.target.value as FindingStatus)
            }}
          >
            {findingStatuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <label className="field-label" htmlFor="finding-notes">Notes</label>
          <textarea
            id="finding-notes"
            className="input-control textarea-control"
            value={notes}
            onChange={(event) => {
              setSaved(false)
              setNotes(event.target.value)
            }}
            placeholder="Add an operator note…"
            maxLength={10000}
          />
          <div className="update-actions">
            {saved && <span className="inline-feedback success" role="status">Update saved.</span>}
            <button className="button button-primary" type="button" onClick={() => void saveUpdate()} disabled={saving || loading || !hasChanges}>
              {saveLabel}
            </button>
          </div>
          <p className="muted-copy">Updates are recorded in PostgreSQL only. No AWS resources are changed.</p>
        </section>

        <section className="inspector-section">
          <h3>Remediation history</h3>
          {!detail || detail.remediation_history.length === 0 ? (
            <p className="muted-copy">No operator updates have been recorded.</p>
          ) : (
            <ol className="audit-timeline">
              {detail.remediation_history.map((item) => (
                <li key={item.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{item.action.replaceAll('_', ' ')}</strong>
                    <span>{item.previous_status} → {item.new_status}</span>
                    {item.notes && <p>{item.notes}</p>}
                    <small>{item.actor} · {formatDate(item.created_at)}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Drawer>
  )
}
