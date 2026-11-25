import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './auth-context'
import { getApiErrorMessage, getScans } from '../services/api'
import type { ScanRead } from '../types/api'
import { ScanContext } from './scan-context'

interface ScanState {
  authKey: string
  scans: ScanRead[]
  loading: boolean
  error: string | null
  apiConnection: 'checking' | 'connected' | 'offline'
}

const EMPTY_SCANS: ScanRead[] = []

export function ScanProvider({ children }: { children: ReactNode }) {
  const { isAuthReady, sessionVersion, token } = useAuth()
  const [scanState, setScanState] = useState<ScanState | null>(null)
  const authKey = `${sessionVersion}:${token ?? ''}`
  const currentScanState = isAuthReady && token && scanState?.authKey === authKey
    ? scanState
    : null
  const scans = currentScanState?.scans ?? EMPTY_SCANS
  const loading = isAuthReady && !token
    ? false
    : currentScanState?.loading ?? true
  const error = currentScanState?.error ?? null
  const apiConnection = currentScanState?.apiConnection ?? 'checking'

  const refresh = useCallback(async () => {
    if (!isAuthReady || !token) return
    setScanState((current) => ({
      authKey,
      scans: current?.authKey === authKey ? current.scans : [],
      loading: true,
      error: null,
      apiConnection: current?.authKey === authKey ? current.apiConnection : 'checking',
    }))
    try {
      const result = await getScans()
      setScanState({
        authKey,
        scans: result,
        loading: false,
        error: null,
        apiConnection: 'connected',
      })
    } catch (requestError) {
      setScanState({
        authKey,
        scans: [],
        loading: false,
        error: getApiErrorMessage(requestError),
        apiConnection: 'offline',
      })
    }
  }, [authKey, isAuthReady, token])

  useEffect(() => {
    if (!isAuthReady || !token) return
    let active = true
    getScans()
      .then((result) => {
        if (!active) return
        setScanState({
          authKey,
          scans: result,
          loading: false,
          error: null,
          apiConnection: 'connected',
        })
      })
      .catch((requestError: unknown) => {
        if (!active) return
        setScanState({
          authKey,
          scans: [],
          loading: false,
          error: getApiErrorMessage(requestError),
          apiConnection: 'offline',
        })
      })
    return () => {
      active = false
    }
  }, [authKey, isAuthReady, token])

  useEffect(() => {
    if (!isAuthReady || !token || !currentScanState || !scans.some((scan) => scan.status === 'RUNNING')) return
    const interval = window.setInterval(async () => {
      try {
        const latest = await getScans()
        setScanState((current) => current?.authKey === authKey
          ? {
              ...current,
              scans: latest,
              apiConnection: latest.some((scan, index) => scan.status !== scans[index]?.status)
                ? 'connected'
                : current.apiConnection,
            }
          : current)
      } catch {
        // Existing refresh error handling remains the source of API status.
      }
    }, 2000)
    return () => window.clearInterval(interval)
  }, [authKey, currentScanState, isAuthReady, scans, token])

  const value = useMemo(
    () => ({ scans, loading, error, apiConnection, refresh }),
    [scans, loading, error, apiConnection, refresh],
  )

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>
}
