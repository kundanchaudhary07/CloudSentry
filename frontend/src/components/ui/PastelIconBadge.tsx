import type { ReactNode } from 'react'

export type IconTone = 'blue' | 'mint' | 'coral' | 'amber' | 'violet'

export function PastelIconBadge({
  tone,
  children,
  className = '',
}: {
  tone: IconTone
  children: ReactNode
  className?: string
}) {
  return (
    <span className={`pastel-icon-badge tone-${tone}${className ? ` ${className}` : ''}`} aria-hidden="true">
      {children}
    </span>
  )
}
