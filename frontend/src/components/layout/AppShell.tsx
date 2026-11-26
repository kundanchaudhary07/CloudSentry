import {
  ArrowRight,
  BarChart3,
  Activity,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { AwsConnectionContext } from '../../context/aws-connection-context'
import { useScanContext } from '../../context/scan-context'
import {
  AWS_CONNECTION_STATUS_EVENT,
  getCurrentUser,
  getFindings,
  getAwsCredentials,
  getApiErrorMessage,
  getDashboard,
  type AuthUser,
  type AwsCredentialsRead,
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
  { path: '/scans', label: 'Scan History', icon: Activity },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
]

function notificationStorageKey(userId: string) {
  return `cloudsentry_read_notifications_${userId}`
}

function readStoredNotificationIds(userId: string): string[] {
  const stored = window.localStorage.getItem(notificationStorageKey(userId))
  if (!stored) return []

  try {
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string')
    }
  } catch {
    window.localStorage.removeItem(notificationStorageKey(userId))
  }
  return []
}

function getProfileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length > 1) return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return parts[0]?.slice(0, 2).toUpperCase() ?? ''
}

function formatMemberSince(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date)
}

function formatMaskedAwsKey(value: string | null) {
  if (!value) return null
  if (value.includes('••••')) return value
  return `••••${value.slice(-4)}`
}

export function AppShell() {
  const [search, setSearch] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dashboardRequest, setDashboardRequest] = useState<{
    authKey: string
    data: DashboardRead
    error: null
  } | {
    authKey: string
    data: null
    error: string
  } | null>(null)
  const [operator, setOperator] = useState(readOperatorSession)
  const [notificationUserId, setNotificationUserId] = useState(
    () => readOperatorSession()?.userId ?? null,
  )
  const [notificationReadState, setNotificationReadState] = useState(() => {
    const userId = readOperatorSession()?.userId ?? null
    return {
      userId,
      ids: userId ? readStoredNotificationIds(userId) : [],
    }
  })
  const [notificationData, setNotificationData] = useState<{
    scanId: string
    ids: string[]
  } | null>(null)
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileData, setProfileData] = useState<{
    user: AuthUser
    aws: AwsCredentialsRead
  } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [awsConnectionPromptOpen, setAwsConnectionPromptOpen] = useState(false)
  const [awsConnected, setAwsConnected] = useState<boolean | null>(null)
  const [awsDefaultRegion, setAwsDefaultRegion] = useState('us-east-1')
  const [awsConnectionRevision, setAwsConnectionRevision] = useState(0)
  const [awsConnectionError, setAwsConnectionError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthReady, sessionVersion, token } = useAuth()
  const { apiConnection, scans } = useScanContext()
  const authKey = `${sessionVersion}:${token ?? ''}`
  const currentDashboardRequest = isAuthReady && token && dashboardRequest?.authKey === authKey
    ? dashboardRequest
    : null
  const dashboard = currentDashboardRequest?.data ?? null
  const dashboardError = currentDashboardRequest?.error ?? null
  const settings = readScanSettings()
  const latestCompleted = scans.find((scan) => scan.status === 'COMPLETED')
  const activeResourceType = new URLSearchParams(location.search).get('type')

  useEffect(() => {
    if (!isAuthReady || !token) return
    let active = true
    getDashboard()
      .then((result) => {
        if (active) {
          setDashboardRequest({ authKey, data: result, error: null })
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setDashboardRequest({
            authKey,
            data: null,
            error: getApiErrorMessage(requestError),
          })
        }
      })
    return () => {
      active = false
    }
  }, [authKey, isAuthReady, scans, token])

  useEffect(() => {
    if (!isAuthReady || !token || notificationUserId) return
    let active = true
    getCurrentUser()
      .then((user) => {
        if (active) {
          setNotificationUserId(user.id)
          setNotificationError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (active) setNotificationError(getApiErrorMessage(requestError))
      })
    return () => {
      active = false
    }
  }, [isAuthReady, notificationUserId, token])

  useEffect(() => {
    if (
      notificationUserId
      && notificationReadState.userId === null
      && notificationReadState.ids.length > 0
    ) {
      const currentIds = readStoredNotificationIds(notificationUserId)
      window.localStorage.setItem(
        notificationStorageKey(notificationUserId),
        JSON.stringify([...new Set([...currentIds, ...notificationReadState.ids])]),
      )
    }
  }, [notificationReadState, notificationUserId])

  useEffect(() => {
    const scanId = latestCompleted?.id
    if (!isAuthReady || !token || !scanId) return
    let active = true
    getFindings({ scan_id: scanId, status: 'OPEN' })
      .then((findings) => {
        if (active) {
          setNotificationData({
            scanId,
            ids: findings
              .filter((finding) => finding.severity === 'CRITICAL' || finding.severity === 'HIGH')
              .map((finding) => finding.id),
          })
          setNotificationError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (active) setNotificationError(getApiErrorMessage(requestError))
      })
    return () => {
      active = false
    }
  }, [isAuthReady, latestCompleted?.id, token])

  useEffect(() => {
    function closeNavigationOnHistoryChange() {
      setMobileNavOpen(false)
    }
    window.addEventListener('popstate', closeNavigationOnHistoryChange)
    return () => window.removeEventListener('popstate', closeNavigationOnHistoryChange)
  }, [])

  useEffect(() => subscribeToOperatorSession(() => {
    const session = readOperatorSession()
    setOperator(session)
    setNotificationUserId(session?.userId ?? null)
  }), [])

  useEffect(() => {
    if (!isAuthReady || !token) return
    let active = true
    let hasStatusChange = false
    function updateAwsStatus(connected: boolean, region?: string) {
      setAwsConnected(connected)
      if (region) setAwsDefaultRegion(region)
      setAwsConnectionError(null)
      setAwsConnectionRevision((revision) => revision + 1)
    }
    function handleAwsStatusChange(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail === 'boolean') {
        hasStatusChange = true
        updateAwsStatus(event.detail)
      } else if (
        event instanceof CustomEvent
        && typeof event.detail === 'object'
        && event.detail !== null
        && typeof event.detail.connected === 'boolean'
      ) {
        hasStatusChange = true
        updateAwsStatus(event.detail.connected, event.detail.region)
      }
    }
    getAwsCredentials()
      .then((result) => {
        if (active && !hasStatusChange) {
          updateAwsStatus(result.has_aws_credentials, result.aws_default_region)
        }
      })
      .catch((requestError: unknown) => {
        if (active && !hasStatusChange) {
          setAwsConnected(null)
          setAwsConnectionError(getApiErrorMessage(requestError))
          setAwsConnectionRevision((revision) => revision + 1)
        }
      })
    window.addEventListener(AWS_CONNECTION_STATUS_EVENT, handleAwsStatusChange)
    return () => {
      active = false
      window.removeEventListener(AWS_CONNECTION_STATUS_EVENT, handleAwsStatusChange)
    }
  }, [isAuthReady, token])

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

  useEffect(() => {
    if (!awsConnectionPromptOpen) return
    function closePromptOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setAwsConnectionPromptOpen(false)
    }
    window.addEventListener('keydown', closePromptOnEscape)
    return () => window.removeEventListener('keydown', closePromptOnEscape)
  }, [awsConnectionPromptOpen])

  useEffect(() => {
    if (!profileModalOpen) return
    function closeProfileOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setProfileModalOpen(false)
    }
    window.addEventListener('keydown', closeProfileOnEscape)
    return () => window.removeEventListener('keydown', closeProfileOnEscape)
  }, [profileModalOpen])

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
    setProfileModalOpen(true)
    setProfileData(null)
    setProfileError(null)
    setProfileLoading(true)
    try {
      const [user, aws] = await Promise.all([getCurrentUser(), getAwsCredentials()])
      setProfileData({ user, aws })
    } catch (requestError: unknown) {
      setProfileError(getApiErrorMessage(requestError))
    } finally {
      setProfileLoading(false)
    }
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

  const notificationIds = latestCompleted
    ? notificationData?.scanId === latestCompleted.id
      ? notificationData.ids
      : (dashboard?.top_findings ?? [])
        .filter((finding) => (
          finding.scan_id === latestCompleted.id
          && finding.status === 'OPEN'
          && (finding.severity === 'CRITICAL' || finding.severity === 'HIGH')
        ))
        .map((finding) => finding.id)
    : []
  const readNotificationIds = useMemo(() => {
    if (notificationReadState.userId === notificationUserId) {
      return notificationReadState.ids
    }
    if (notificationReadState.userId === null && notificationReadState.ids.length > 0) {
      return notificationReadState.ids
    }
    return notificationUserId ? readStoredNotificationIds(notificationUserId) : []
  }, [notificationReadState, notificationUserId])
  const unreadCount = notificationIds.filter((id) => !readNotificationIds.includes(id)).length
  const profileUser = profileData?.user
  const profileAws = profileData?.aws
  const profileProvider = profileUser?.auth_provider === 'google'
    ? 'Google OAuth'
    : profileUser?.auth_provider === 'aws'
      ? 'Legacy federated account'
      : 'Email and password'
  const profileAwsKey = formatMaskedAwsKey(profileAws?.aws_access_key_id_preview ?? null)
  const awsConnectionContextValue = {
    awsConnected: awsConnected === true,
    connectionRevision: awsConnectionRevision,
    openAwsConnectionPrompt: () => setAwsConnectionPromptOpen(true),
  }

  return (
    <AwsConnectionContext.Provider value={awsConnectionContextValue}>
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
              className="sidebar-operator sidebar-profile-trigger"
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
              <span className="operator-details sidebar-profile-info">
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

          <div className="app-header-controls">
            <div
              className={`api-indicator ${apiConnection}${apiConnection === 'connected' && awsConnected === false ? ' aws-disconnected' : ''}${apiConnection === 'connected' && awsConnectionError ? ' aws-status-unavailable' : ''}`}
              role="status"
              title={awsConnectionError ?? (awsConnected === false ? 'API connected · AWS not connected' : dashboardError ?? undefined)}
            >
              <span className="status-dot" />
              <span>
                {apiConnection === 'checking'
                  ? 'Connecting'
                  : apiConnection === 'connected'
                    ? awsConnected === false
                      ? 'Not connected'
                      : awsConnectionError
                        ? 'AWS status unavailable'
                        : 'Connected'
                    : 'API unavailable'}
              </span>
            </div>
            <ScanTriggerButton settings={settings} showError={false} />
            <div className="environment-pill" title="Region from the latest completed scan">
              <span className="aws-mark" aria-hidden="true">aws</span>
              <span>{latestCompleted?.regions[0] ?? awsDefaultRegion}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
            <button
              className="notification-link"
              type="button"
              aria-label={notificationError ? 'Finding count unavailable' : `${unreadCount} unread high or critical findings`}
              title={notificationError ?? `${unreadCount} unread high or critical findings`}
              onClick={() => {
                const nextReadIds = [...new Set([...readNotificationIds, ...notificationIds])]
                if (notificationUserId) {
                  window.localStorage.setItem(
                    notificationStorageKey(notificationUserId),
                    JSON.stringify(nextReadIds),
                  )
                }
                setNotificationReadState({ userId: notificationUserId, ids: nextReadIds })
                navigate('/findings?status=OPEN')
              }}
            >
              <Bell size={19} aria-hidden="true" />
              {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
      </div>
      {awsConnectionPromptOpen && (
        <div
          className="aws-connect-prompt-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAwsConnectionPromptOpen(false)
          }}
        >
          <section
            className="aws-connect-prompt"
            style={{ background: '#ffffff', backgroundColor: '#ffffff', backdropFilter: 'none', WebkitBackdropFilter: 'none', zIndex: 1300 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aws-connect-prompt-title"
          >
            <div className="aws-connect-prompt-message">
              <span className="aws-connect-prompt-icon" aria-hidden="true">
                <Lock size={19} />
              </span>
              <p id="aws-connect-prompt-title">
                Connect your AWS account in Settings before running a scan.
              </p>
            </div>
            <div className="aws-connect-prompt-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setAwsConnectionPromptOpen(false)
                  navigate('/settings')
                }}
              >
                Go to Settings →
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setAwsConnectionPromptOpen(false)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
      {profileModalOpen && (
        <div
          className="profile-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileModalOpen(false)
          }}
        >
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
            style={{
              width: 'min(500px, 92vw)',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: '#ffffff',
              backgroundColor: '#ffffff',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }}
          >
            <header className="profile-modal-header">
              <div>
                <span className="profile-modal-eyebrow">WORKSPACE ACCOUNT</span>
                <h2 id="profile-modal-title">Your profile</h2>
                <p>Identity, authentication method, and connected AWS environment.</p>
              </div>
              <button
                className="profile-modal-close"
                type="button"
                aria-label="Close profile"
                onClick={() => setProfileModalOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {profileError && <div className="form-feedback error profile-modal-feedback" role="alert">{profileError}</div>}
            {profileLoading && <div className="profile-loading" role="status">Loading profile…</div>}
            {profileUser && profileAws && (
              <>
                <section className="profile-identity-card" aria-label="Account identity">
                  <span className="profile-modal-avatar-initials" aria-hidden="true">
                    {getProfileInitials(profileUser.full_name)}
                  </span>
                  <div className="profile-identity-main">
                    <div className="profile-identity-heading">
                      <strong>{profileUser.full_name}</strong>
                      <span className="profile-role-badge">Cloud Operator</span>
                    </div>
                    <div className="profile-email-row">
                      <span>{profileUser.email}</span>
                      {profileUser.auth_provider === 'google' && (
                        <span className="profile-verified-badge">
                          <Check size={13} aria-hidden="true" /> Verified
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                <div className="profile-modal-metadata">
                  <div className="profile-modal-metadata-grid">
                    <section className="profile-metadata-card">
                      <span className="profile-metadata-label">Sign-in provider</span>
                      <strong className="profile-metadata-value">
                        {profileUser.auth_provider === 'google' && (
                          <span className="profile-google-mark" aria-hidden="true">G</span>
                        )}
                        {profileProvider}
                      </strong>
                    </section>
                    <section className="profile-metadata-card">
                      <span className="profile-metadata-label">Member since</span>
                      <strong className="profile-metadata-value">
                        <CalendarDays size={16} aria-hidden="true" />
                        {formatMemberSince(profileUser.created_at)}
                      </strong>
                    </section>
                  </div>

                  <section className="profile-aws-card">
                    <div className="profile-aws-details">
                      <span className="profile-metadata-label">AWS Environment</span>
                      <div className="profile-aws-meta">
                        <span className="profile-aws-key">
                          {profileAws.has_aws_credentials ? profileAwsKey ?? 'Key saved' : 'No key saved'}
                        </span>
                        <span className="profile-aws-region">
                          {profileAws.aws_default_region || awsDefaultRegion}
                        </span>
                      </div>
                    </div>
                    <span className={`profile-aws-status${profileAws.has_aws_credentials ? ' is-connected' : ''}`}>
                      {profileAws.has_aws_credentials && <span className="profile-aws-status-dot" aria-hidden="true" />}
                      {profileAws.has_aws_credentials ? 'Connected' : 'Not connected'}
                    </span>
                  </section>
                </div>

              </>
            )}
            <footer className="profile-modal-footer">
              <button
                className="profile-modal-signout"
                type="button"
                onClick={() => {
                  setProfileModalOpen(false)
                  logout()
                }}
              >
                <LogOut size={16} aria-hidden="true" />
                Sign Out
              </button>
              <button
                className="profile-modal-settings"
                type="button"
                onClick={() => {
                  setProfileModalOpen(false)
                  navigate('/settings')
                }}
              >
                Manage AWS Settings <ArrowRight size={16} aria-hidden="true" />
              </button>
            </footer>
          </section>
        </div>
      )}
    </AwsConnectionContext.Provider>
  )
}
