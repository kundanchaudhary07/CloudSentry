const SESSION_KEY = 'cloudsentry.operator-session'
const TOKEN_KEY = 'cloudsentry.access-token'
const SESSION_CHANGE_EVENT = 'cloudsentry:operator-session-change'

export function readAccessToken(): string | null {
  const localToken = window.localStorage.getItem(TOKEN_KEY)
  if (localToken) return localToken

  const legacyToken = window.sessionStorage.getItem(TOKEN_KEY)
  if (legacyToken) {
    window.localStorage.setItem(TOKEN_KEY, legacyToken)
  }
  window.sessionStorage.removeItem(TOKEN_KEY)
  return legacyToken
}

export function persistAccessToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token)
  window.sessionStorage.removeItem(TOKEN_KEY)
}

export function clearStoredCredentials() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(SESSION_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

export interface OperatorSession {
  displayName: string
  initials: string
  userId?: string
}

function formatName(identifier: string) {
  const name = identifier.trim().split('@')[0].replace(/[._-]+/g, ' ')
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function readOperatorSession(): OperatorSession | null {
  let serialized = window.localStorage.getItem(SESSION_KEY)
  if (!serialized) {
    serialized = window.sessionStorage.getItem(SESSION_KEY)
    if (serialized) window.localStorage.setItem(SESSION_KEY, serialized)
  }
  window.sessionStorage.removeItem(SESSION_KEY)
  if (!serialized) return null

  try {
    const value: unknown = JSON.parse(serialized)
    if (
      typeof value === 'object'
      && value !== null
      && 'displayName' in value
      && typeof value.displayName === 'string'
      && 'initials' in value
      && typeof value.initials === 'string'
    ) {
      return {
        displayName: value.displayName,
        initials: value.initials,
        ...('userId' in value && typeof value.userId === 'string'
          ? { userId: value.userId }
          : {}),
      }
    }
  } catch {
    window.localStorage.removeItem(SESSION_KEY)
    return null
  }

  window.localStorage.removeItem(SESSION_KEY)
  return null
}

export function saveOperatorSession(identifier: string) {
  const displayName = formatName(identifier)
  const session: OperatorSession = {
    displayName,
    initials: getInitials(displayName),
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

export function saveAuthenticatedSession(fullName: string, token: string, userId: string) {
  const session: OperatorSession = {
    displayName: fullName,
    initials: getInitials(fullName),
    userId,
  }
  persistAccessToken(token)
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

export function signOut() {
  clearStoredCredentials()
}

export function subscribeToOperatorSession(callback: () => void) {
  window.addEventListener(SESSION_CHANGE_EVENT, callback)
  return () => window.removeEventListener(SESSION_CHANGE_EVENT, callback)
}
