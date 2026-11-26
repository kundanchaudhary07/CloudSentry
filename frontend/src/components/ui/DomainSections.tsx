import { ChevronDown, ChevronRight, CircleDollarSign, Database, Server, Shield } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { DomainDefinition, DomainFilter, DomainId } from '../../utils/dataDomains'
import { domains } from '../../utils/dataDomains'

const domainIcons = {
  compute: Server,
  security: Shield,
  storage: Database,
  finops: CircleDollarSign,
}

export function DomainSegmentedControl({
  value,
  counts,
  onChange,
  label = 'Filter by domain',
}: {
  value: DomainFilter
  counts: Record<DomainId, number>
  onChange: (value: DomainFilter) => void
  label?: string
}) {
  const options: Array<{ id: DomainFilter; label: string; count: number }> = [
    { id: 'all', label: 'All Domains', count: Object.values(counts).reduce((sum, count) => sum + count, 0) },
    ...domains.map((domain) => ({ id: domain.id, label: domain.label, count: counts[domain.id] })),
  ]

  return (
    <div className="domain-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`domain-segment${value === option.id ? ' selected' : ''}`}
          data-domain={option.id}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          <span>{option.label}</span>
          <span className="domain-segment-count">{option.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  )
}

export function DomainSection({
  domain,
  count,
  children,
  id,
  defaultCollapsed = false,
  className = '',
}: {
  domain: DomainDefinition
  count: number
  children: ReactNode
  id?: string
  defaultCollapsed?: boolean
  className?: string
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const Icon = domainIcons[domain.id]
  const contentId = `domain-content-${id ?? domain.id}`

  return (
    <section className={`domain-section${className ? ` ${className}` : ''}`} data-domain={domain.id}>
      <button
        className="domain-section-heading domain-group-header"
        type="button"
        aria-expanded={!collapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span className="domain-icon" aria-hidden="true"><Icon size={19} /></span>
        <span className="domain-section-copy">
          <strong>{domain.title}</strong>
          <small>{domain.subtitle}</small>
        </span>
        <span className="domain-section-count">{count.toLocaleString()}</span>
        {collapsed ? <ChevronRight className="domain-chevron" size={18} /> : <ChevronDown className="domain-chevron" size={18} />}
      </button>
      {!collapsed && <div className="domain-section-content" id={contentId}>{children}</div>}
    </section>
  )
}
