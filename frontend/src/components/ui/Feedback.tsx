import {
  BarChart3,
  Boxes,
  FileText,
  Settings,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ModulePageHeader } from './ModulePageHeader'
import type { IconTone } from './PastelIconBadge'

const pageIcons = {
  'Cloud inventory': { icon: Boxes, tone: 'blue' as const },
  Findings: { icon: ShieldAlert, tone: 'coral' as const },
  'Cost intelligence': { icon: BarChart3, tone: 'mint' as const },
  'Remediation workflow': { icon: Wrench, tone: 'amber' as const },
  'Scan history': { icon: FileText, tone: 'violet' as const },
  Settings: { icon: Settings, tone: 'blue' as const },
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  icon,
  tone,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  tone?: IconTone
}) {
  const defaults = pageIcons[title as keyof typeof pageIcons] ?? pageIcons.Findings
  const Icon = defaults.icon

  return (
    <ModulePageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      tone={tone ?? defaults.tone}
      icon={icon ?? <Icon size={20} strokeWidth={1.9} />}
      action={action}
    />
  )
}

export function LoadingState({ label = 'Loading live data…' }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <span className="loading-mark" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="state-panel state-error" role="alert">
      <strong>Could not load live data</strong>
      <span>{message}</span>
      {onRetry && (
        <button className="button button-secondary" type="button" onClick={onRetry} aria-label="Retry loading data">
          Retry loading data
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="state-panel empty-state">
      <span className="empty-mark" aria-hidden="true">
        —
      </span>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  )
}

export function NoScansState() {
  return (
    <EmptyState
      title="No scans recorded yet"
      description="Run your first read-only AWS inventory scan to populate this view."
      action={
        <Link className="button button-primary" to="/settings" aria-label="Configure and run an initial scan">
          Configure &amp; Run Scan →
        </Link>
      }
    />
  )
}

export function SeverityPill({ severity }: { severity: string }) {
  return <span className={`severity-pill severity-${severity.toLowerCase()}`}>{severity}</span>
}

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  return <span className={`status-pill status-${status.toLowerCase()}${className ? ` ${className}` : ''}`}>{status}</span>
}

