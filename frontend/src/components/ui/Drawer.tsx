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
  solidDetail = false,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  tone?: IconTone
  onClose: () => void
  children: ReactNode
  solidDetail?: boolean
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="drawer-backdrop" style={solidDetail ? {
      background: 'rgba(15, 23, 42, 0.35)',
      zIndex: 1200,
    } : undefined} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside
        className={`drawer-panel${solidDetail ? ' solid-detail-drawer' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={solidDetail ? {
          background: '#ffffff',
          backgroundColor: '#ffffff',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          opacity: 1,
          width: 'min(500px, 92vw)',
          maxWidth: '500px',
          zIndex: 1300,
        } : undefined}
      >
        <header className="drawer-header" style={solidDetail ? {
          background: '#ffffff',
          backgroundColor: '#ffffff',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          opacity: 1,
        } : undefined}>
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
        <div className="drawer-content" style={solidDetail ? {
          background: '#ffffff',
          backgroundColor: '#ffffff',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          opacity: 1,
        } : undefined}>{children}</div>
      </aside>
    </div>
  )
}
