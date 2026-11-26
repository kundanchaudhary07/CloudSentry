import { Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { SeverityCounts } from '../../types/api'

export function CopyableIdChip({ value }: { value: string }) {
  const [message, setMessage] = useState('')
  const displayValue = value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value

  async function copyId() {
    if (!navigator.clipboard?.writeText) {
      setMessage('Clipboard unavailable; select the ID to copy it.')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setMessage('ID copied.')
    } catch {
      setMessage('Could not copy ID; select it and copy manually.')
    }
  }

  return (
    <span className="drawer-id-chip">
      <code title={value}>{displayValue}</code>
      <button type="button" onClick={() => void copyId()} aria-label="Copy ID" title="Copy ID">
        {message === 'ID copied.' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      </button>
      {message && <span className="drawer-copy-feedback" role="status">{message}</span>}
    </span>
  )
}

export function DrawerMetricGrid({ children }: { children: ReactNode }) {
  return <div className="drawer-metric-grid">{children}</div>
}

export function DrawerMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
}) {
  return (
    <div className="drawer-metric-card">
      <span>{label}</span>
      <div className="drawer-metric-value">{value}</div>
      {detail && <div className="drawer-metric-detail">{detail}</div>}
    </div>
  )
}

export function DrawerRegionList({ regions }: { regions: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visibleRegions = expanded ? regions : regions.slice(0, 6)
  const remaining = Math.max(0, regions.length - 6)

  return (
    <section className="drawer-panel-section">
      <div className="drawer-section-heading">
        <h3>Regions</h3>
        <span className="drawer-section-count">{regions.length.toLocaleString()}</span>
      </div>
      {regions.length === 0 ? (
        <p className="muted-copy">No regions were recorded.</p>
      ) : (
        <div className="drawer-region-list">
          {visibleRegions.map((region, index) => (
            <span className="drawer-region-chip" key={`${region}-${index}`}>{region}</span>
          ))}
          {remaining > 0 && (
            <button
              className="drawer-region-chip drawer-region-toggle"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Show less' : `+${remaining} more`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

const severityItems: Array<{ key: keyof SeverityCounts; label: string }> = [
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]

export function DrawerSeverityTiles({ counts }: { counts: Partial<SeverityCounts> }) {
  return (
    <div className="drawer-severity-grid" aria-label="Findings by severity">
      {severityItems.map(({ key, label }) => (
        <div className="drawer-severity-tile" data-severity={key} key={key}>
          <span>{label}</span>
          <strong>{counts[key] ?? 0}</strong>
        </div>
      ))}
    </div>
  )
}
