import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getApiErrorMessage, getScans } from '../services/api'
import type { ScanRead } from '../types/api'
import { ScanContext } from './scan-context'

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scans, setScans] = useState<ScanRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiConnection, setApiConnection] = useState<'checking' | 'connected' | 'offline'>('checking')

  const refresh = useCallback(async () => {
    try {
      setScans(await getScans())
      setError(null)
      setApiConnection('connected')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
      setApiConnection('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    getScans()
      .then((result) => {
        if (!active) return
        setScans(result)
        setError(null)
        setApiConnection('connected')
      })
      .catch((requestError: unknown) => {
        if (!active) return
        setError(getApiErrorMessage(requestError))
        setApiConnection('offline')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (!scans.some((scan) => scan.status === 'RUNNING')) return
      try {
        const latest = await getScans()
        setScans(latest)
        if (latest.some((scan, index) => scan.status !== scans[index]?.status)) {
          setApiConnection('connected')
        }
      } catch {
        // Existing refresh error handling remains the source of API status.
      }
    }, 2000)
    return () => window.clearInterval(interval)
  }, [scans])

  const value = useMemo(
    () => ({ scans, loading, error, apiConnection, refresh }),
    [scans, loading, error, apiConnection, refresh],
  )

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>
}
