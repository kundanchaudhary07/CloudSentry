import {
  Activity,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
import axios from 'axios'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
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
import './settings.css'

const awsRegions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'af-south-1',
  'ap-east-1',
  'ap-south-1',
  'ap-south-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ca-central-1',
  'ca-west-1',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'sa-east-1',
]

const suggestedTags = ['Team', 'Application', 'Stage', 'Backup']

const requiredIamPolicy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'InspectComputeAndVolumes',
      Effect: 'Allow',
      Action: [
        'ec2:DescribeInstances',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeVolumes',
        'ec2:DescribeRegions',
      ],
      Resource: '*',
    },
    {
      Sid: 'InspectS3BucketMetadata',
      Effect: 'Allow',
      Action: [
        's3:ListAllMyBuckets',
        's3:GetBucketPublicAccessBlock',
        's3:GetBucketPolicy',
        's3:GetBucketAcl',
        's3:GetBucketLocation',
        's3:GetBucketTagging',
      ],
      Resource: '*',
    },
    {
      Sid: 'InspectIamIdentitiesAndPolicies',
      Effect: 'Allow',
      Action: [
        'iam:ListUsers',
        'iam:ListRoles',
        'iam:ListAttachedUserPolicies',
        'iam:ListAttachedRolePolicies',
      ],
      Resource: '*',
    },
    {
      Sid: 'InspectRdsInstances',
      Effect: 'Allow',
      Action: ['rds:DescribeDBInstances', 'rds:ListTagsForResource'],
      Resource: '*',
    },
    {
      Sid: 'InspectCloudTrailStatus',
      Effect: 'Allow',
      Action: ['cloudtrail:DescribeTrails', 'cloudtrail:GetTrailStatus'],
      Resource: '*',
    },
    {
      Sid: 'ReadCloudWatchMetrics',
      Effect: 'Allow',
      Action: 'cloudwatch:GetMetricStatistics',
      Resource: '*',
    },
    {
      Sid: 'ReadCostExplorerUsage',
      Effect: 'Allow',
      Action: 'ce:GetCostAndUsage',
      Resource: '*',
    },
  ],
}, null, 2)

type AwsConnectionStatus = 'connected' | 'revoked' | 'disconnected' | 'unavailable'

function getAwsValidationError(error: unknown): string | null {
  if (!axios.isAxiosError<{
    detail?: string | { validation_error?: string }
    validation_error?: string
  }>(error)) {
    return null
  }
  const response = error.response?.data
  if (response?.validation_error) return response.validation_error
  if (typeof response?.detail === 'object' && response.detail !== null) {
    return response.detail.validation_error ?? null
  }
  return null
}

export function SettingsPage() {
  const [settings, setSettings] = useState<ScanSettings>(() => readScanSettings())
  const [regionMode, setRegionMode] = useState<'all' | 'custom'>(
    settings.regions.length > 0 ? 'custom' : 'all',
  )
  const [selectedRegions, setSelectedRegions] = useState(settings.regions)
  const [requiredTags, setRequiredTags] = useState(settings.required_tags)
  const [requiredCostTags, setRequiredCostTags] = useState(settings.required_cost_tags)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [awsAccessKey, setAwsAccessKey] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [showAwsSecret, setShowAwsSecret] = useState(false)
  const [awsRegion, setAwsRegion] = useState('us-east-1')
  const [awsRoleArn, setAwsRoleArn] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [hasAwsCredentials, setHasAwsCredentials] = useState(false)
  const [awsConnectionStatus, setAwsConnectionStatus] = useState<AwsConnectionStatus>('disconnected')
  const [awsStatusLoading, setAwsStatusLoading] = useState(true)
  const [savingAws, setSavingAws] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [awsPreview, setAwsPreview] = useState<string | null>(null)
  const [awsAccountId, setAwsAccountId] = useState<string | null>(null)
  const [awsArn, setAwsArn] = useState<string | null>(null)
  const [awsMessage, setAwsMessage] = useState<string | null>(null)
  const [awsError, setAwsError] = useState<string | null>(null)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [policyCopied, setPolicyCopied] = useState(false)
  const [policyCopyError, setPolicyCopyError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getAwsCredentials()
      .then((value) => {
        if (!active) return
        setHasAwsCredentials(value.has_aws_credentials)
        setAwsConnectionStatus(value.status)
        setAwsError(value.validation_error)
        setAwsPreview(value.masked_access_key ?? value.aws_access_key_id_preview)
        setAwsAccountId(value.account_id)
        setAwsArn(value.arn)
        setAwsRegion(value.region ?? value.aws_default_region ?? 'us-east-1')
        setAwsRoleArn(value.aws_role_arn ?? '')
        setAdvancedOpen(Boolean(value.aws_role_arn))
      })
      .catch((requestError: unknown) => {
        if (active) setAwsError(getApiErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setAwsStatusLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!policyOpen) return
    function closePolicyOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setPolicyOpen(false)
    }
    window.addEventListener('keydown', closePolicyOnEscape)
    return () => window.removeEventListener('keydown', closePolicyOnEscape)
  }, [policyOpen])

  async function disconnectAwsConnection() {
    setDisconnecting(true)
    setAwsError(null)
    setAwsMessage(null)
    try {
      const result = await disconnectAwsConnectionRequest()
      setHasAwsCredentials(result.connected)
      setAwsConnectionStatus(result.status)
      setAwsPreview(null)
      setAwsAccountId(null)
      setAwsArn(null)
      setAwsAccessKey('')
      setAwsSecretKey('')
      setAwsRegion('us-east-1')
      setAwsRoleArn('')
      setAdvancedOpen(false)
      setAwsMessage('AWS connection disconnected.')
      announceAwsConnectionStatus(result.connected, 'us-east-1', result.status)
    } catch (requestError: unknown) {
      setAwsError(getApiErrorMessage(requestError))
    } finally {
      setDisconnecting(false)
    }
  }

  async function saveAwsConnection() {
    if (!awsAccessKey.trim() || !awsSecretKey.trim()) {
      setAwsError('Enter both an AWS access key ID and secret access key.')
      setAwsMessage(null)
      return
    }
    setSavingAws(true)
    setAwsError(null)
    setAwsMessage(null)
    try {
      const result = await saveAwsCredentials({
        aws_access_key_id: awsAccessKey.trim(),
        aws_secret_access_key: awsSecretKey,
        aws_default_region: awsRegion.trim(),
        aws_role_arn: awsRoleArn.trim() || undefined,
      })
      setHasAwsCredentials(result.has_aws_credentials)
      setAwsConnectionStatus(result.status)
      setAwsPreview(result.masked_access_key ?? result.aws_access_key_id_preview)
      setAwsAccountId(result.account_id)
      setAwsArn(result.arn)
      setAwsSecretKey('')
      setAwsMessage(result.connected
        ? `Connected to AWS Account ${result.account_id ?? 'verified'} (${result.region ?? awsRegion})`
        : result.validation_error ?? result.reason ?? 'AWS credentials could not be verified.')
      announceAwsConnectionStatus(
        result.connected,
        result.region ?? result.aws_default_region ?? undefined,
        result.status,
      )
    } catch (requestError: unknown) {
      setAwsError(getAwsValidationError(requestError) ?? getApiErrorMessage(requestError))
    } finally {
      setSavingAws(false)
    }
  }

  function update(patch: Partial<ScanSettings>) {
    setSettings((current) => ({ ...current, ...patch }))
    setMessage(null)
    setError(null)
  }

  function currentSettings(): ScanSettings {
    return {
      ...settings,
      regions: regionMode === 'custom' ? selectedRegions : [],
      required_tags: requiredTags,
      required_cost_tags: requiredCostTags,
    }
  }

  function save() {
    const next = currentSettings()
    try {
      saveScanSettings(next)
      setSettings(next)
      setMessage('Saved ✓ Scan defaults stored in this browser.')
      setError(null)
    } catch (saveError: unknown) {
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

  async function copyRequiredPolicy() {
    try {
      await navigator.clipboard.writeText(requiredIamPolicy)
      setPolicyCopied(true)
      setPolicyCopyError(null)
      window.setTimeout(() => setPolicyCopied(false), 1800)
    } catch {
      setPolicyCopyError('Could not access the clipboard. Select and copy the policy JSON below.')
    }
  }

  const activeSettings = currentSettings()
  const isDirty = JSON.stringify(activeSettings) !== JSON.stringify(settings)
  const regionLabel = activeSettings.regions.length > 0
    ? `${activeSettings.regions.length} ${activeSettings.regions.length === 1 ? 'Region' : 'Regions'}`
    : 'Default Regions'

  function toggleRegion(region: string) {
    setSelectedRegions((current) => current.includes(region)
      ? current.filter((value) => value !== region)
      : [...current, region])
    setMessage(null)
  }

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="SCAN CONFIGURATION"
        title="Settings"
        description="Configure secure AWS access and the scan defaults for your environment."
      />

      <div className="settings-layout">
        <div className="settings-left-column">
          <section className="surface-card settings-card settings-credentials-card">
            <div className="section-heading">
              <div>
                <p className="card-kicker">AWS ACCOUNT CONNECTION</p>
                <h2>Credentials</h2>
              </div>
              <PastelIconBadge tone="amber">aws</PastelIconBadge>
            </div>

            <ConnectionStatusBanner
              loading={awsStatusLoading}
              status={awsConnectionStatus}
              keyPreview={awsPreview}
              accountId={awsAccountId}
              arn={awsArn}
              region={awsRegion}
              validationError={awsError}
            />

            <div className="settings-form settings-credentials-form">
              <label className="form-field">
                <span>AWS Access Key ID</span>
                <input
                  className="input-control"
                  autoComplete="off"
                  value={awsAccessKey}
                  onChange={(event) => {
                    setAwsAccessKey(event.target.value)
                    setAwsError(null)
                  }}
                  placeholder="AKIA..."
                />
              </label>

              <label className="form-field">
                <span>AWS Secret Access Key</span>
                <span className="settings-secret-control">
                  <input
                    className="input-control"
                    type={showAwsSecret ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={awsSecretKey}
                    onChange={(event) => {
                      setAwsSecretKey(event.target.value)
                      setAwsError(null)
                    }}
                    placeholder="Enter secret access key"
                  />
                  <button
                    type="button"
                    className="settings-secret-toggle"
                    aria-label={showAwsSecret ? 'Hide secret access key' : 'Show secret access key'}
                    aria-pressed={showAwsSecret}
                    onClick={() => setShowAwsSecret((visible) => !visible)}
                  >
                    {showAwsSecret
                      ? <EyeOff size={17} aria-hidden="true" />
                      : <Eye size={17} aria-hidden="true" />}
                  </button>
                </span>
              </label>

              <label className="form-field">
                <span>Default AWS region</span>
                <span className="settings-select-control">
                  <select
                    className="input-control"
                    value={awsRegion}
                    onChange={(event) => setAwsRegion(event.target.value)}
                  >
                    {!awsRegions.includes(awsRegion) && <option value={awsRegion}>{awsRegion}</option>}
                    {awsRegions.map((region) => <option value={region} key={region}>{region}</option>)}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </label>

              <div className="settings-advanced">
                <button
                  className="settings-advanced-toggle"
                  type="button"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  <span>{advancedOpen ? 'Hide' : 'Advanced'}: IAM Role Assumption (Optional)</span>
                  <ChevronDown className={advancedOpen ? 'is-open' : ''} size={16} aria-hidden="true" />
                </button>
                {advancedOpen && (
                  <label className="form-field settings-role-field">
                    <span>Optional Role ARN</span>
                    <input
                      className="input-control"
                      value={awsRoleArn}
                      onChange={(event) => setAwsRoleArn(event.target.value)}
                      placeholder="arn:aws:iam::123456789012:role/CloudSentry"
                    />
                    <small>Assume a role in another AWS account after validating these credentials.</small>
                  </label>
                )}
              </div>

              {awsError && <div className="form-feedback error" role="alert">{awsError}</div>}
              {awsMessage && <div className="form-feedback success" role="status">{awsMessage}</div>}

              <div className="settings-connection-actions">
                <button
                  className="settings-primary-button"
                  type="button"
                  onClick={() => void saveAwsConnection()}
                  disabled={savingAws || disconnecting}
                >
                  {savingAws
                    ? <><LoaderCircle className="settings-spinner" size={16} aria-hidden="true" /> Verifying with AWS STS...</>
                    : 'Save & Verify Connection'}
                </button>
                {(awsConnectionStatus === 'connected' || hasAwsCredentials) && (
                  <button
                    className="settings-destructive-button"
                    type="button"
                    onClick={() => void disconnectAwsConnection()}
                    disabled={disconnecting || savingAws}
                  >
                    {disconnecting
                      ? <><LoaderCircle className="settings-spinner" size={16} aria-hidden="true" /> Disconnecting...</>
                      : 'Disconnect'}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="surface-card settings-note settings-security-card">
            <div className="settings-security-heading">
              <p className="card-kicker">SECURITY &amp; EXECUTION</p>
              <h2>Read-only by design</h2>
            </div>
            <ul className="settings-security-list">
              <li><ShieldCheck size={18} aria-hidden="true" /><span>Zero-write IAM read-only collectors</span></li>
              <li><Lock size={18} aria-hidden="true" /><span>Credentials encrypted at rest in PostgreSQL and never stored in localStorage</span></li>
              <li><Activity size={18} aria-hidden="true" /><span>Live AWS STS verification on every session</span></li>
            </ul>
            <button
              className="settings-policy-link"
              type="button"
              onClick={() => {
                setPolicyCopyError(null)
                setPolicyOpen(true)
              }}
            >
              View Required IAM Policy JSON <span aria-hidden="true">→</span>
            </button>
          </section>
        </div>

        <div className="settings-right-column">
          <section className="surface-card settings-card settings-scan-card">
            <div className="section-heading">
              <div>
                <p className="card-kicker">INVENTORY COLLECTION</p>
                <h2>Scan parameters</h2>
              </div>
            </div>

            <div className="settings-form">
              <fieldset className="settings-region-fieldset">
                <legend>AWS regions</legend>
                <div className="settings-segmented-control" role="group" aria-label="Region selection mode">
                  <button
                    type="button"
                    aria-pressed={regionMode === 'all'}
                    className={regionMode === 'all' ? 'is-selected' : ''}
                    onClick={() => {
                      setRegionMode('all')
                      setMessage(null)
                    }}
                  >
                    All Active Regions (Default)
                  </button>
                  <button
                    type="button"
                    aria-pressed={regionMode === 'custom'}
                    className={regionMode === 'custom' ? 'is-selected' : ''}
                    onClick={() => {
                      setRegionMode('custom')
                      setMessage(null)
                    }}
                  >
                    Custom Regions
                  </button>
                </div>
                {regionMode === 'all'
                  ? <p className="settings-help-text">Use the regions configured for your CloudSentry environment.</p>
                  : (
                    <div className="settings-region-picker">
                      <div className="settings-picker-actions">
                        <span>{selectedRegions.length} selected</span>
                        <button type="button" onClick={() => setSelectedRegions([...awsRegions])}>Select All</button>
                        <button type="button" onClick={() => setSelectedRegions([])}>Clear</button>
                      </div>
                      <div className="settings-region-chips">
                        {awsRegions.map((region) => {
                          const selected = selectedRegions.includes(region)
                          return (
                            <button
                              className={`settings-region-chip${selected ? ' is-selected' : ''}`}
                              type="button"
                              key={region}
                              aria-pressed={selected}
                              onClick={() => toggleRegion(region)}
                            >
                              {selected && <Check size={13} aria-hidden="true" />}
                              {region}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
              </fieldset>

              <div className="settings-metrics-grid">
                <label className="form-field settings-threshold-field">
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
                  <span className="settings-presets" aria-label="CPU threshold presets">
                    {[5, 10, 15, 20].map((threshold) => (
                      <button
                        key={threshold}
                        type="button"
                        aria-pressed={settings.cpu_threshold === threshold}
                        className={settings.cpu_threshold === threshold ? 'is-selected' : ''}
                        onClick={() => update({ cpu_threshold: threshold })}
                      >
                        {threshold}%
                      </button>
                    ))}
                  </span>
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

              <TagPillBuilder
                label="Required governance tags"
                tags={requiredTags}
                onChange={setRequiredTags}
                onEdit={() => setMessage(null)}
              />
              <TagPillBuilder
                label="Required cost allocation tags"
                tags={requiredCostTags}
                onChange={setRequiredCostTags}
                onEdit={() => setMessage(null)}
              />

              <label className="settings-feature-row">
                <span className="settings-feature-copy">
                  <strong>Include Cost Explorer</strong>
                  <small>Request actual billing totals and service breakdown from AWS.</small>
                </span>
                <span className="settings-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Include Cost Explorer"
                    checked={settings.include_cost_explorer}
                    onChange={(event) => update({ include_cost_explorer: event.target.checked })}
                  />
                  <span className="settings-switch-track" aria-hidden="true"><span /></span>
                </span>
              </label>

              {error && <div className="form-feedback error" role="alert">{error}</div>}
              {message && <div className="form-feedback success" role="status">{message}</div>}
              <div className="settings-footer-actions">
                <button
                  className="settings-save-button"
                  type="button"
                  onClick={save}
                  disabled={!isDirty}
                >
                  Save Configuration
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

      {policyOpen && (
        <div
          className="settings-policy-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPolicyOpen(false)
          }}
        >
          <section
            className="settings-policy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-policy-title"
          >
            <header>
              <div>
                <p className="card-kicker">AWS IAM PERMISSIONS</p>
                <h2 id="settings-policy-title">Required read-only policy</h2>
                <p>These are the read-only actions used by CloudSentry inventory and scan collectors.</p>
              </div>
              <button
                className="settings-policy-close"
                type="button"
                aria-label="Close policy viewer"
                onClick={() => setPolicyOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <pre><code>{requiredIamPolicy}</code></pre>
            {policyCopyError && <div className="form-feedback error" role="alert">{policyCopyError}</div>}
            <footer>
              <span>No create, update, or delete permissions are included.</span>
              <button className="settings-primary-button" type="button" onClick={() => void copyRequiredPolicy()}>
                {policyCopied
                  ? <><Check size={16} aria-hidden="true" /> Copied</>
                  : <><Copy size={16} aria-hidden="true" /> Copy policy JSON</>}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

function ConnectionStatusBanner({
  loading,
  status,
  keyPreview,
  accountId,
  arn,
  region,
  validationError,
}: {
  loading: boolean
  status: AwsConnectionStatus
  keyPreview: string | null
  accountId: string | null
  arn: string | null
  region: string
  validationError: string | null
}) {
  if (loading) {
    return (
      <div className="settings-connection-banner is-loading" role="status">
        <span className="settings-connection-dot" />
        <div><strong>Verifying connection</strong><p>Checking live AWS credentials with STS…</p></div>
      </div>
    )
  }

  if (status === 'connected') {
    return (
      <div className="settings-connection-banner is-connected" role="status">
        <span className="settings-connection-dot" />
        <div className="settings-connection-content">
          <div className="settings-connection-title"><strong>Connected</strong><span>{region}</span></div>
          <span className="settings-connection-key">{keyPreview ?? 'AWS credentials verified'}</span>
          {accountId && <span className="settings-connection-account">Account ID · {accountId}</span>}
          {arn && <span className="settings-connection-arn" title={arn}>Identity · {arn}</span>}
        </div>
      </div>
    )
  }

  if (status === 'revoked') {
    return (
      <div className="settings-connection-banner is-revoked" role="status">
        <span className="settings-connection-dot" />
        <div>
          <strong>Key Revoked in AWS</strong>
          <p>Your IAM access key is no longer valid in AWS. Enter new credentials to reconnect.</p>
          {keyPreview && <span className="settings-connection-key">{keyPreview}</span>}
        </div>
      </div>
    )
  }

  if (status === 'unavailable') {
    return (
      <div className="settings-connection-banner is-unavailable" role="status">
        <span className="settings-connection-dot" />
        <div>
          <strong>AWS STS verification unavailable</strong>
          <p>{validationError ?? 'AWS credentials are retained. Retry verification when network access is restored.'}</p>
          {keyPreview && <span className="settings-connection-key">{keyPreview}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-connection-banner is-disconnected" role="status">
      <span className="settings-connection-dot" />
      <div><strong>Not Connected</strong><p>Add read-only IAM credentials to unlock environment scans.</p></div>
    </div>
  )
}

function TagPillBuilder({
  label,
  tags,
  onChange,
  onEdit,
}: {
  label: string
  tags: string[]
  onChange: (tags: string[]) => void
  onEdit: () => void
}) {
  const [newTag, setNewTag] = useState('')

  function addTag(value = newTag) {
    const tag = value.trim().replace(/,+$/, '').trim()
    if (!tag || tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setNewTag('')
      return
    }
    onChange([...tags, tag])
    onEdit()
    setNewTag('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag()
    } else if (event.key === 'Backspace' && !newTag && tags.length > 0) {
      onChange(tags.slice(0, -1))
      onEdit()
    }
  }

  return (
    <div className="settings-tag-builder">
      <span className="settings-field-label">{label}</span>
      <div className="settings-tag-box">
        {tags.map((tag) => (
          <span className="settings-tag-pill" key={tag}>
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag} tag`}
              onClick={() => {
                onChange(tags.filter((value) => value !== tag))
                onEdit()
              }}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          aria-label={`Add ${label.toLowerCase()}`}
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Press Enter to add tag..."
        />
        {newTag.trim() && (
          <button className="settings-tag-add" type="button" onClick={() => addTag()}>
            <Plus size={14} aria-hidden="true" /> Add
          </button>
        )}
      </div>
      <div className="settings-tag-suggestions" aria-label="Suggested tags">
        <span>Suggestions</span>
        {suggestedTags.map((tag) => (
          <button
            key={tag}
            type="button"
            disabled={tags.some((value) => value.toLowerCase() === tag.toLowerCase())}
            onClick={() => addTag(tag)}
          >
            + {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
