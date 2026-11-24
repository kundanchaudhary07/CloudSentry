import { createContext, useContext } from 'react'
import type { ScanRead } from '../types/api'

export type ApiConnection = 'checking' | 'connected' | 'offline'

export interface ScanContextValue {
  scans: ScanRead[]
  loading: boolean
  error: string | null
  apiConnection: ApiConnection
  refresh: () => Promise<void>
}

export const ScanContext = createContext<ScanContextValue | null>(null)

export function useScanContext(): ScanContextValue {
  const context = useContext(ScanContext)
  if (!context) throw new Error('useScanContext must be used within a ScanProvider.')
  return context
}
