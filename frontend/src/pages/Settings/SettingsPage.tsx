import { useEffect, useState } from 'react'
import {
  announceAwsConnectionStatus,
  disconnectAwsConnection as disconnectAwsConnectionRequest,
  getApiErrorMessage,
  getAwsCredentials,
  saveAwsCredentials,
} from '../../services/api'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import { ScanTriggerButton } from '../../components/ui/ScanTriggerButton'
import { PageHeader } from '../../components/ui/Feedback'
import {
  readScanSettings,
  saveScanSettings,
  type ScanSettings,
} from '../../services/scanSettings'

export function SettingsPage() {
  const [settings, setSettings] = useState<ScanSettings>(() => readScanSettings())
  const [regionsText, setRegionsText] = useState(settings.regions.join(', '))
  const [requiredTagsText, setRequiredTagsText] = useState(settings.required_tags.join(', '))
  const [costTagsText, setCostTagsText] = useState(settings.required_cost_tags.join(', '))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [awsAccessKey, setAwsAccessKey] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('us-east-1')
  const [awsRoleArn, setAwsRoleArn] = useState('')
  const [hasAwsCredentials, setHasAwsCredentials] = useState(false)
  const [savingAws, setSavingAws] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [awsPreview, setAwsPreview] = useState<string | null>(null)
  const [awsMessage, setAwsMessage] = useState<string | null>(null)
  const [awsError, setAwsError] = useState<string | null>(null)

  useEffect(() => {
    getAwsCredentials()
      .then((value) => {
        setHasAwsCredentials(value.has_aws_credentials)
        setAwsPreview(value.aws_access_key_id_preview)
        setAwsRegion(value.has_aws_credentials ? value.aws_default_region : 'us-east-1')
        setAwsRoleArn(value.aws_role_arn ?? '')
      })
      .catch((requestError: unknown) => setAwsError(getApiErrorMessage(requestError)))
  }, [])

  async function disconnectAwsConnection() {
    setDisconnecting(true)
    setAwsError(null)
    setAwsMessage(null)
    try {
      const result = await disconnectAwsConnectionRequest()
      setHasAwsCredentials(result.connected)
      setAwsPreview(null)
      setAwsAccessKey('')
      setAwsSecretKey('')
      setAwsRegion('us-east-1')
      setAwsRoleArn('')
      setAwsMessage('AWS connection disconnected')
      announceAwsConnectionStatus(result.connected)
    } catch (requestError) {
      setAwsError(getApiErrorMessage(requestError))
    } finally {
      setDisconnecting(false)
    }
  }

  async function saveAwsConnection() {
    if (!awsAccessKey.trim() || !awsSecretKey.trim()) {
      setAwsError('Enter both an AWS access key ID and secret access key.')
      return
    }
    setSavingAws(true)
    try {
      const result = await saveAwsCredentials({
        aws_access_key_id: awsAccessKey.trim(),
        aws_secret_access_key: awsSecretKey,
        aws_default_region: awsRegion.trim(),
        aws_role_arn: awsRoleArn.trim() || undefined,
      })
      setHasAwsCredentials(result.has_aws_credentials)
      setAwsPreview(result.aws_access_key_id_preview)
      setAwsSecretKey('')
      setAwsMessage(`Connected · ${result.aws_access_key_id_preview ?? 'AWS key saved'}`)
      setAwsError(null)
      announceAwsConnectionStatus(result.has_aws_credentials)
    } catch (requestError) {
      setAwsError(getApiErrorMessage(requestError))
      setAwsMessage(null)
    } finally {
      setSavingAws(false)
    }
  }

  function update(patch: Partial<ScanSettings>) {
    setSettings((current) => ({ ...current, ...patch }))
    setMessage(null)
    setError(null)
  }

  function save() {
    const next = currentSettings()
    try {
      saveScanSettings(next)
      setSettings(next)
      setMessage('Saved ✓ Scan defaults stored in this browser.')
      setError(null)
    } catch (saveError) {
      setMessage(null)
      setError(getApiErrorMessage(saveError))
    }
  }

  function saveCurrentSettings() {
    const next = currentSettings()
    saveScanSettings(next)
    setSettings(next)
    setMessage('Saved ✓ Scan defaults stored in this browser.')
    setError(null)
  }

  function currentSettings(): ScanSettings {
    return {
      ...settings,
      regions: regionsText.split(',').map((item) => item.trim()).filter(Boolean),
      required_tags: requiredTagsText.split(',').map((item) => item.trim()).filter(Boolean),
      required_cost_tags: costTagsText.split(',').map((item) => item.trim()).filter(Boolean),
    }
  }

  const activeSettings = currentSettings()
  const isDirty = JSON.stringify(activeSettings) !== JSON.stringify(settings)
  const regionLabel = activeSettings.regions.length > 0
    ? `${activeSettings.regions.length} ${activeSettings.regions.length === 1 ? 'Region' : 'Regions'}`
    : 'Default Regions'

  return (
    <div>
      <PageHeader
        eyebrow="SCAN CONFIGURATION"
        title="Settings"
        description="Set browser-local defaults that are sent with the next scan request."
      />

      <div className="settings-layout">
        <div className="settings-left-column">
          <section className="surface-card settings-card">
          <div className="section-heading">
            <div>
              <p className="card-kicker">AWS Account Connection</p>
              <h2>Credentials</h2>
            </div>
            <PastelIconBadge tone="amber">aws</PastelIconBadge>
          </div>
          <div className="settings-form">
            {awsPreview && <small>Current key: {awsPreview}</small>}
            <label className="form-field">
              <span>AWS Access Key ID</span>
              <input className="input-control" value={awsAccessKey} onChange={(event) => setAwsAccessKey(event.target.value)} placeholder="AKIA..." />
            </label>
            <label className="form-field">
              <span>AWS Secret Access Key</span>
              <input className="input-control" type="password" value={awsSecretKey} onChange={(event) => setAwsSecretKey(event.target.value)} placeholder="Enter to save or rotate" />
            </label>
            <label className="form-field">
              <span>Default Region</span>
              <input className="input-control" value={awsRegion} onChange={(event) => setAwsRegion(event.target.value)} placeholder="us-east-1" />
            </label>
            <label className="form-field">
              <span>Optional Role ARN</span>
              <input className="input-control" value={awsRoleArn} onChange={(event) => setAwsRoleArn(event.target.value)} placeholder="arn:aws:iam::123456789012:role/CloudSentry" />
            </label>
            {awsError && <div className="form-feedback error" role="alert">{awsError}</div>}
            {awsMessage && <div className="form-feedback success" role="status">{awsMessage}</div>}
            <div className="aws-connected-row">
              <span className={`aws-connected-badge${hasAwsCredentials ? '' : ' is-disconnected'}`} role="status">
                {hasAwsCredentials ? `Connected · ${awsPreview ?? 'AWS credentials saved'}` : 'Not connected'}
              </span>
              {hasAwsCredentials && (
                <ScanTriggerButton
                  settings={activeSettings}
                  label="Run First Scan →"
                  onBeforeScan={saveCurrentSettings}
                />
              )}
            </div>
            <div className="settings-actions aws-connection-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void saveAwsConnection()}
                disabled={savingAws || disconnecting}
              >
                {savingAws ? 'Saving...' : 'Save AWS Connection'}
              </button>
              <button
                className="button button-secondary aws-disconnect-button"
                type="button"
                onClick={() => void disconnectAwsConnection()}
                disabled={!hasAwsCredentials || disconnecting || savingAws}
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect AWS Connection'}
              </button>
            </div>
          </div>
          </section>
          <aside className="surface-card settings-note">
            <p className="card-kicker">Privacy &amp; execution</p>
            <h2>Read-only by design</h2>
            <p>Scan preferences stay in this browser. AWS credentials are encrypted for your account and used by the read-only collectors.</p>
            <ul>
              <li>No AWS credentials are stored in the browser.</li>
              <li>Cost Explorer is opt-in and may be unavailable for an account.</li>
              <li>CPU findings are review signals, not savings estimates.</li>
            </ul>
          </aside>
        </div>

        <div className="settings-right-column">
        <section className="surface-card settings-card">
          <div className="section-heading">
            <div>
              <p className="card-kicker">Inventory collection</p>
              <h2>Scan parameters</h2>
            </div>
          </div>
          <div className="settings-form">
            <label className="form-field">
              <span>AWS regions</span>
              <input
                className="input-control"
                type="text"
                value={regionsText}
                onChange={(event) => {
                  setRegionsText(event.target.value)
                  setMessage(null)
                  setError(null)
                }}
                placeholder="Leave blank to use backend-configured regions"
              />
              <small>Comma-separated. Blank uses the regions configured for the backend.</small>
            </label>
            <div className="settings-two-column">
              <label className="form-field">
                <span>Low-usage CPU threshold (%)</span>
                <input
                  className="input-control"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={settings.cpu_threshold}
                  onChange={(event) => update({ cpu_threshold: Number(event.target.value) })}
                  required
                />
              </label>
              <label className="form-field">
                <span>Metric lookback (days)</span>
                <input
                  className="input-control"
                  type="number"
                  min="1"
                  step="1"
                  value={settings.lookback_days}
                  onChange={(event) => update({ lookback_days: Number(event.target.value) })}
                  required
                />
              </label>
            </div>
            <label className="form-field">
              <span>Required governance tags</span>
              <input
                className="input-control"
                type="text"
                value={requiredTagsText}
                onChange={(event) => {
                  setRequiredTagsText(event.target.value)
                  setMessage(null)
                  setError(null)
                }}
                placeholder="Environment, Owner"
              />
              <small>Comma-separated tag keys used by the security rule engine.</small>
            </label>
            <label className="form-field">
              <span>Required cost allocation tags</span>
              <input
                className="input-control"
                type="text"
                value={costTagsText}
                onChange={(event) => {
                  setCostTagsText(event.target.value)
                  setMessage(null)
                  setError(null)
                }}
                placeholder="CostCenter, Project"
              />
              <small>Comma-separated tag keys used by FinOps rules.</small>
            </label>
            <label className="toggle-field">
              <span>
                <strong>Include Cost Explorer</strong>
                <small>Request actual billing totals and service breakdown from AWS.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.include_cost_explorer}
                onChange={(event) => update({ include_cost_explorer: event.target.checked })}
              />
            </label>
            {error && <div className="form-feedback error" role="alert">{error}</div>}
            {message && <div className="form-feedback success" role="status">{message}</div>}
            <div className="settings-actions">
              <button className="button button-secondary" type="button" onClick={save} disabled={!isDirty}>
                {message ? 'Saved ✓' : 'Save Configuration'}
              </button>
              <ScanTriggerButton
                settings={activeSettings}
                label={`Save & Scan (${regionLabel}) →`}
                onBeforeScan={saveCurrentSettings}
              />
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}
