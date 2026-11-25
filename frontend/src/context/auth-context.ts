import { createContext, useContext } from 'react'

export interface AuthState {
  isAuthReady: boolean
  sessionVersion: number
  token: string | null
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used within an AuthProvider.')
  return auth
}
