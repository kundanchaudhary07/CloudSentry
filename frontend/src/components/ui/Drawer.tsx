import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { PastelIconBadge, type IconTone } from './PastelIconBadge'

export function Drawer({
  title,
  subtitle,
  icon,
  tone = 'blue',
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  tone?: IconTone
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-header">
          <div className="drawer-title-group">
            {icon && <PastelIconBadge tone={tone} className="drawer-title-icon">{icon}</PastelIconBadge>}
            <div className="drawer-title-copy">
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`} title={`Close ${title}`}>
            <X size={18} />
          </button>
        </header>
        <div className="drawer-content">{children}</div>
      </aside>
    </div>
  )
}
