import { ArrowRight, Database, HardDrive, MapPin, Server, Shield } from 'lucide-react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import type { FindingRead } from '../../types/api'
import { formatDate } from '../../utils/format'
import { getFindingDomain } from '../../utils/dataDomains'
import { StatusPill } from './Feedback'

function openOnKeyboard(event: KeyboardEvent<HTMLElement>, onOpen: () => void) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen()
  }
}

function stopRowClick(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation()
}

function ResourceIcon({ type }: { type: string }) {
  const normalized = type.toUpperCase()
  if (normalized === 'EC2') return <Server size={15} aria-hidden="true" />
  if (normalized === 'EBS') return <HardDrive size={15} aria-hidden="true" />
  if (['S3', 'RDS'].includes(normalized)) return <Database size={15} aria-hidden="true" />
  return <Shield size={15} aria-hidden="true" />
}

export function FindingDataCard({
  finding,
  onOpen,
  actions,
}: {
  finding: FindingRead
  onOpen: () => void
  actions?: ReactNode
}) {
  const domain = getFindingDomain(finding)
  return (
    <article
      className="data-grid-row finding-data-row"
      data-domain={domain}
      data-severity={finding.severity.toLowerCase()}
      role="group"
      tabIndex={0}
      aria-label={`Open ${finding.title}`}
      onClick={onOpen}
      onKeyDown={(event) => openOnKeyboard(event, onOpen)}
    >
      <div className="finding-primary-cluster">
        <span className={`severity-text severity-text-${finding.severity.toLowerCase()}`}>{finding.severity}</span>
        <div className="data-grid-title">
          <strong>{finding.title}</strong>
          <small>{finding.rule_id} · {finding.category}</small>
        </div>
      </div>
      <div className="finding-resource-cluster">
        <span className="resource-icon-label"><ResourceIcon type={finding.resource_type} />{finding.resource_type}</span>
        <code>{finding.resource_id}</code>
        <span className="region-label"><MapPin size={13} aria-hidden="true" />{finding.region || 'global'}</span>
      </div>
      <div className="finding-state-cluster">
        <StatusPill status={finding.status} />
        <time dateTime={finding.updated_at}>{formatDate(finding.updated_at)}</time>
      </div>
      {actions ? (
        <div className="data-grid-actions" onClick={(event) => event.stopPropagation()}>
          {actions}
        </div>
      ) : (
        <button
          className="data-grid-inspect"
          type="button"
          onClick={(event) => {
            stopRowClick(event)
            onOpen()
          }}
          aria-label={`Inspect ${finding.title}`}
        >
          Inspect <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
      <ArrowRight className="data-grid-row-chevron" size={16} aria-hidden="true" />
    </article>
  )
}
