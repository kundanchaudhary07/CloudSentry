import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { PastelIconBadge, type IconTone } from './PastelIconBadge'
import { StatusPill } from './Feedback'
import { CopyableIdChip } from './DrawerElements'
import '../../styles/drawer-panels.css'

export function Drawer({
  title,
  subtitle,
  copyableId,
  status,
  headerBadge,
  icon,
  tone = 'blue',
  onClose,
  children,
  footer,
  solidDetail = false,
}: {
  title: string
  subtitle?: string
  copyableId?: string
  status?: string
  headerBadge?: ReactNode
  icon?: ReactNode
  tone?: IconTone
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
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
      background: 'rgba(15, 23, 42, 0.4)',
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
          width: 'min(520px, 94vw)',
          maxWidth: '520px',
          zIndex: 1300,
        } : undefined}
      >
        <header className="drawer-header" style={solidDetail ? {
          background: '#f8fafc',
          backgroundColor: '#f8fafc',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          opacity: 1,
        } : undefined}>
          <div className="drawer-header-main">
            <div className="drawer-title-group">
              {icon && <PastelIconBadge tone={tone} className="drawer-title-icon">{icon}</PastelIconBadge>}
              <div className="drawer-title-copy">
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
                {copyableId && <CopyableIdChip value={copyableId} />}
              </div>
            </div>
            <div className="drawer-header-actions">
              {headerBadge}
              {status && <StatusPill status={status} />}
              <button className="icon-button drawer-close-button" type="button" onClick={onClose} aria-label={`Close ${title}`} title={`Close ${title}`}>
                <X size={18} />
              </button>
            </div>
          </div>
        </header>
        <div className="drawer-content" style={solidDetail ? {
          background: '#ffffff',
          backgroundColor: '#ffffff',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          opacity: 1,
        } : undefined}>{children}</div>
        {footer && <footer className="drawer-footer">{footer}</footer>}
      </aside>
    </div>
  )
}
