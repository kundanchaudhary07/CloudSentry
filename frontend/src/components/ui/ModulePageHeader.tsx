import type { ReactNode } from 'react'
import { PastelIconBadge, type IconTone } from './PastelIconBadge'

export function ModulePageHeader({
  eyebrow,
  title,
  description,
  icon,
  tone,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  icon: ReactNode
  tone: IconTone
  action?: ReactNode
}) {
  return (
    <header className="module-page-header">
      <PastelIconBadge tone={tone} className="module-header-icon">{icon}</PastelIconBadge>
      <div className="module-header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </header>
  )
}
