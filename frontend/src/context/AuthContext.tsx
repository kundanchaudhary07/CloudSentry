import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { readAccessToken, subscribeToOperatorSession } from '../services/operatorSession'
import { AuthContext } from './auth-context'
import type { AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => ({
    isAuthReady: true,
    sessionVersion: 0,
    token: readAccessToken(),
  }))

  useEffect(() => subscribeToOperatorSession(() => {
    setAuth((current) => ({
      isAuthReady: true,
      sessionVersion: current.sessionVersion + 1,
      token: readAccessToken(),
    }))
  }), [])

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
