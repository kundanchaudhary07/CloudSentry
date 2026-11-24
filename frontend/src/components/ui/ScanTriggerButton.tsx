import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useAwsConnection } from '../../context/aws-connection-context'
import { useScanContext } from '../../context/scan-context'
import { getApiErrorMessage, getScanDetail, triggerScan } from '../../services/api'
import { toScanRequest, type ScanSettings } from '../../services/scanSettings'
import type { ScanRead } from '../../types/api'

export function ScanTriggerButton({
  settings,
  label,
  onBeforeScan,
  onSuccess,
  showError = true,
}: {
  settings: ScanSettings
  label?: string
  onBeforeScan?: () => void | Promise<void>
  onSuccess?: (scan: ScanRead) => void
  showError?: boolean
}) {
  const { refresh } = useScanContext()
  const { awsConnected, connectionRevision, openAwsConnectionPrompt } = useAwsConnection()
  const [loading, setLoading] = useState(false)
  const [scanState, setScanState] = useState<{
    revision: number
    label: string
    error: string | null
  } | null>(null)
  const initialButtonLabel = label ?? 'Run New Scan →'
  const locked = !awsConnected
  const buttonLabel = scanState?.revision === connectionRevision
    ? scanState.label
    : initialButtonLabel
  const visibleLabel = locked
    ? initialButtonLabel.replace(/\s*→$/, '')
    : buttonLabel

  async function runScan() {
    if (locked) {
      openAwsConnectionPrompt()
      return
    }
    if (loading) return
    setLoading(true)
    setScanState({
      revision: connectionRevision,
      label: 'Scanning...',
      error: null,
    })
    try {
      await onBeforeScan?.()
      const scan = await triggerScan(toScanRequest(settings))
      await refresh()
      let latest = scan
      while (latest.status === 'RUNNING') {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
        latest = await getScanDetail(scan.id)
        await refresh()
      }
      setScanState({
        revision: connectionRevision,
        label: 'Scan Ended',
        error: null,
      })
      onSuccess?.(latest)
    } catch (requestError) {
      await refresh()
      setScanState({
        revision: connectionRevision,
        label: 'Scan Ended',
        error: getApiErrorMessage(requestError),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="scan-trigger">
      <button
        className={`button button-primary${locked ? ' aws-scan-locked' : ''}`}
        type="button"
        onClick={() => void runScan()}
        disabled={loading && !locked}
        aria-disabled={locked ? 'true' : undefined}
        aria-label={locked ? `AWS connection required. ${visibleLabel}` : buttonLabel}
      >
        {locked
          ? <Lock size={14} aria-hidden="true" />
          : loading && <span className="button-spinner" aria-hidden="true" />}
        <span>{visibleLabel}</span>
      </button>
      {showError && scanState?.revision === connectionRevision && scanState.error && (
        <span className="inline-feedback error" role="alert">{scanState.error}</span>
      )}
    </div>
  )
}
