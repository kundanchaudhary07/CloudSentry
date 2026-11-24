import {
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useScanContext } from '../../context/scan-context'
import {
  getApiErrorMessage,
  getDashboard,
} from '../../services/api'
import {
  readOperatorSession,
  subscribeToOperatorSession,
  signOut,
} from '../../services/operatorSession'
import { readScanSettings } from '../../services/scanSettings'
import type { DashboardRead } from '../../types/api'
import { CloudSentryLogo } from '../ui/CloudSentryLogo'
import { ScanTriggerButton } from '../ui/ScanTriggerButton'

const navigation = [
  { path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { path: '/inventory', label: 'Resource Inventory', icon: Boxes },
  { path: '/inventory?type=RDS', label: 'Databases & Storage', icon: Database, query: 'RDS' },
  { path: '/costs', label: 'Cost Intelligence', icon: BarChart3 },
  { path: '/findings', label: 'Security Findings', icon: ShieldAlert },
  { path: '/remediation', label: 'Remediation', icon: Wrench },
  { path: '/scans', label: 'Scan Reports', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const [search, setSearch] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardRead | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [operator, setOperator] = useState(readOperatorSession)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { apiConnection, scans } = useScanContext()
  const settings = readScanSettings()
  const latestCompleted = scans.find((scan) => scan.status === 'COMPLETED')
  const activeResourceType = new URLSearchParams(location.search).get('type')

  useEffect(() => {
    let active = true
    getDashboard()
      .then((result) => {
        if (active) {
          setDashboard(result)
          setDashboardError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (active) setDashboardError(getApiErrorMessage(requestError))
      })
    return () => {
      active = false
    }
  }, [scans])

  useEffect(() => {
    function closeNavigationOnHistoryChange() {
      setMobileNavOpen(false)
    }
    window.addEventListener('popstate', closeNavigationOnHistoryChange)
    return () => window.removeEventListener('popstate', closeNavigationOnHistoryChange)
  }, [])

  useEffect(() => subscribeToOperatorSession(() => {
    setOperator(readOperatorSession())
  }), [])

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        profileMenuRef.current
        && !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false)
      }
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  function closeProfileAfterPointerLeave() {
    window.setTimeout(() => {
      if (
        profileMenuRef.current
        && !profileMenuRef.current.matches(':hover')
      ) {
        setProfileMenuOpen(false)
      }
    }, 120)
  }

  async function openProfile() {
    setProfileMenuOpen(false)
    navigate('/profile')
  }

  function logout() {
    setProfileMenuOpen(false)
    signOut()
    navigate('/login', { replace: true })
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = search.trim()
    if (query) {
      setMobileNavOpen(false)
      navigate(`/findings?search=${encodeURIComponent(query)}`)
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setSearch('')
      event.currentTarget.blur()
    }
  }

  function navIsActive(item: (typeof navigation)[number]) {
    const itemPath = item.path.split('?')[0]
    if (location.pathname !== itemPath) return false
    if (item.query) return activeResourceType === item.query
    return itemPath !== '/inventory' || activeResourceType !== 'RDS'
  }

  const highCriticalCount = dashboard?.high_critical_count ?? 0

  return (
    <div className={`app-shell${mobileNavOpen ? ' mobile-navigation-open' : ''}`}>
      {mobileNavOpen && (
        <button
          className="mobile-nav-backdrop"
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar app-sidebar${mobileNavOpen ? ' is-open' : ''}`}>
        <Link
          to="/dashboard"
          className="sidebar-brand"
          aria-label="CloudSentry overview"
          title="CloudSentry"
        >
          <CloudSentryLogo />
        </Link>

        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-label={item.label}
                title={item.label}
                aria-current={navIsActive(item) ? 'page' : undefined}
                className={`nav-item${navIsActive(item) ? ' active' : ''}`}
                onClick={(event) => {
                  setMobileNavOpen(false)
                  event.currentTarget.blur()
                }}
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div
            className="sidebar-profile-wrapper sidebar-profile-menu profile-menu-wrap"
            ref={profileMenuRef}
            onMouseLeave={closeProfileAfterPointerLeave}
          >
            <button
              className="sidebar-operator"
              type="button"
              aria-label={operator ? `${operator.displayName}, operator menu` : 'Sign in'}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => {
                setProfileMenuOpen((open) => !open)
              }}
            >
              <span className="operator-avatar" aria-hidden="true">
                {operator?.initials ?? <UserRound size={16} />}
              </span>
              <span className="operator-details">
                <strong>{operator?.displayName ?? 'Not signed in'}</strong>
                <small>{operator ? 'Cloud Operator' : 'Operator access'}</small>
              </span>
            </button>
            {profileMenuOpen && (
              <div className="profile-dropdown sidebar-profile-dropup" role="menu" aria-label="Profile menu">
                <button type="button" role="menuitem" onClick={(event) => {
                  event.stopPropagation()
                  void openProfile()
                }}>
                  <UserRound size={17} aria-hidden="true" />
                  <span>View Profile</span>
                </button>
                <button className="profile-menu-danger" type="button" role="menuitem" onClick={(event) => {
                  event.stopPropagation()
                  logout()
                }}>
                  <LogOut size={17} aria-hidden="true" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="app-main app-main-column">
        <header className="topbar app-floating-header">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <form className="global-search" role="search" onSubmit={submitSearch}>
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchRef}
              aria-label="Search findings"
              placeholder="Search resources, services, findings..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <kbd>Ctrl K</kbd>
          </form>

          <div className={`api-indicator ${apiConnection}`} role="status" title={dashboardError ?? undefined}>
            <span className="status-dot" />
            <span>
              {apiConnection === 'checking'
                ? 'Connecting'
                : apiConnection === 'connected'
                  ? 'Connected'
                  : 'API unavailable'}
            </span>
          </div>
          <ScanTriggerButton settings={settings} />
          <div className="environment-pill" title="Region from the latest completed scan">
            <span className="aws-mark" aria-hidden="true">aws</span>
            <span>{latestCompleted?.regions[0] ?? 'AWS region'}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </div>
          <Link
            to="/findings?status=OPEN"
            className="notification-link"
            aria-label={dashboardError ? 'Finding count unavailable' : `${highCriticalCount} open high or critical findings`}
            title={dashboardError ?? `${highCriticalCount} open high or critical findings`}
          >
            <Bell size={19} aria-hidden="true" />
            {highCriticalCount > 0 && <span className="notification-count">{highCriticalCount}</span>}
          </Link>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
