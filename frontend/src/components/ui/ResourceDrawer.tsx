import { Boxes, Database, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getApiErrorMessage, getInventory } from '../../services/api'
import type { ResourceRead } from '../../types/api'
import { Drawer } from './Drawer'
import { ErrorState, LoadingState } from './Feedback'
import { DrawerMetric, DrawerMetricGrid } from './DrawerElements'
import { formatDate } from '../../utils/format'

export function ResourceDrawer({
  resource,
  discoveredAt,
  onClose,
}: {
  resource: ResourceRead
  discoveredAt: string | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ResourceRead | null>(resource)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isStorage = ['S3', 'EBS', 'RDS'].includes(resource.resource_type)
  const isSecurityGroup = resource.resource_type === 'SecurityGroup'
  const drawerIcon = isStorage ? <Database size={20} /> : isSecurityGroup ? <ShieldCheck size={20} /> : <Boxes size={20} />
  const drawerTone: 'mint' | 'coral' | 'blue' = isStorage ? 'mint' : isSecurityGroup ? 'coral' : 'blue'
  const configuration = detail?.configuration ?? resource.configuration
  const accountOrArn = getConfigurationIdentity(configuration, detail?.resource_id ?? resource.resource_id)

  useEffect(() => {
    let active = true
    getInventory({ scan_id: resource.scan_id, resource_type: resource.resource_type })
      .then((resources) => {
        if (active) setDetail(resources.find((item) => item.id === resource.id) ?? resource)
      })
      .catch((requestError: unknown) => {
        if (active) setError(getApiErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [resource])

  return (
    <Drawer
      title="Resource details"
      subtitle={detail?.name || resource.name || resource.resource_type}
      copyableId={detail?.resource_id ?? resource.resource_id}
      status={detail?.state ?? resource.state}
      icon={drawerIcon}
      tone={drawerTone}
      onClose={onClose}
      solidDetail
      footer={<button className="button button-secondary" type="button" onClick={onClose}>Close</button>}
    >
      {loading && <LoadingState label="Refreshing resource details…" />}
      {error && <ErrorState message={error} />}
      {detail && (
        <div className="inspector-stack">
          <DrawerMetricGrid>
            <DrawerMetric label="Resource type" value={detail.resource_type} />
            <DrawerMetric label="AWS Region" value={detail.region || 'global'} />
            <DrawerMetric label="Account / ARN" value={accountOrArn} />
            <DrawerMetric label="Discovery time" value={formatDate(discoveredAt)} />
          </DrawerMetricGrid>
          <section className="drawer-panel-section">
            <h3>Resource state</h3>
            <div className="drawer-resource-summary">
              <span>Name</span><strong>{detail.name || '—'}</strong>
              <span>Current state</span><strong>{detail.state || '—'}</strong>
            </div>
          </section>
          <section className="drawer-panel-section">
            <h3>Tags</h3>
            {Object.keys(detail.tags).length === 0 ? (
              <p className="muted-copy">No tags were reported for this resource.</p>
            ) : (
              <div className="drawer-resource-tags">
                {Object.entries(detail.tags).map(([key, value]) => (
                  <span key={key}><strong>{key}</strong>{value || '—'}</span>
                ))}
              </div>
            )}
          </section>
          <section className="drawer-panel-section">
            <h3>Normalized configuration</h3>
            <details className="drawer-configuration-details">
              <summary>View normalized AWS configuration</summary>
              <pre className="json-view">{JSON.stringify(detail.configuration, null, 2)}</pre>
            </details>
          </section>
        </div>
      )}
    </Drawer>
  )
}

function getConfigurationIdentity(configuration: Record<string, unknown>, resourceId: string): string {
  const arn = configuration.arn
  if (typeof arn === 'string' && arn) return arn
  if (resourceId.startsWith('arn:')) return resourceId
  const account = configuration.account_id ?? configuration.account
  return typeof account === 'string' && account ? account : 'Not available'
}
