import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useScanContext } from '../../context/scan-context'
import { getApiErrorMessage, triggerScan } from '../../services/api'
import { toScanRequest, type ScanSettings } from '../../services/scanSettings'
import type { ScanRead } from '../../types/api'

export function ScanTriggerButton({
  settings,
  label,
  onBeforeScan,
  onSuccess,
}: {
  settings: ScanSettings
  label?: string
  onBeforeScan?: () => void | Promise<void>
  onSuccess?: (scan: ScanRead) => void
}) {
  const { refresh, scans } = useScanContext()
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const idleLabel = label ?? `${scans.length === 0 ? 'Run Initial Scan' : 'Run New Scan'} →`

  useEffect(() => {
    if (!completed) return
    const timer = window.setTimeout(() => {
      setCompleted(false)
      setSuccess(null)
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [completed])

  async function runScan() {
    setLoading(true)
    setCompleted(false)
    setError(null)
    setSuccess(null)
    try {
      await onBeforeScan?.()
      const scan = await triggerScan(toScanRequest(settings))
      await refresh()
      if (scan.status === 'COMPLETED') {
        setCompleted(true)
        setSuccess(`Scan completed · ${scan.resource_count.toLocaleString()} resources`)
      } else {
        setSuccess(`Scan ended with status ${scan.status.toLowerCase()}.`)
      }
      onSuccess?.(scan)
    } catch (requestError) {
      await refresh()
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="scan-trigger">
      <button
        className="button button-primary"
        type="button"
        onClick={() => void runScan()}
        disabled={loading}
        aria-label={loading ? 'Scanning AWS' : completed ? 'Scan complete' : idleLabel}
      >
        {loading
          ? <span className="button-spinner" aria-hidden="true" />
          : completed
            ? <Check size={16} aria-hidden="true" />
            : null}
        <span>{loading ? 'Scanning AWS…' : completed ? 'Scan Complete ✓' : idleLabel}</span>
      </button>
      {error && <span className="inline-feedback error" role="alert">{error}</span>}
      {success && <span className="inline-feedback success" role="status">{success}</span>}
    </div>
  )
}
