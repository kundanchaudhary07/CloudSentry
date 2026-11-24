import { Boxes, Database, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getApiErrorMessage, getInventory } from '../../services/api'
import type { ResourceRead } from '../../types/api'
import { Drawer } from './Drawer'
import { ErrorState, LoadingState } from './Feedback'

export function ResourceDrawer({
  resource,
  onClose,
}: {
  resource: ResourceRead
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ResourceRead | null>(resource)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isStorage = ['S3', 'EBS', 'RDS'].includes(resource.resource_type)
  const isSecurityGroup = resource.resource_type === 'SecurityGroup'
  const drawerIcon = isStorage ? <Database size={20} /> : isSecurityGroup ? <ShieldCheck size={20} /> : <Boxes size={20} />
  const drawerTone: 'mint' | 'coral' | 'blue' = isStorage ? 'mint' : isSecurityGroup ? 'coral' : 'blue'

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
      title={detail?.name || resource.resource_id}
      subtitle={`${resource.resource_type} · ${resource.region}`}
      icon={drawerIcon}
      tone={drawerTone}
      onClose={onClose}
    >
      {loading && <LoadingState label="Refreshing resource details…" />}
      {error && <ErrorState message={error} />}
      {detail && (
        <div className="inspector-stack">
          <section className="inspector-section">
            <h3>Resource summary</h3>
            <dl className="definition-list">
              <div><dt>Resource ID</dt><dd>{detail.resource_id}</dd></div>
              <div><dt>Type</dt><dd>{detail.resource_type}</dd></div>
              <div><dt>Region</dt><dd>{detail.region}</dd></div>
              <div><dt>State</dt><dd>{detail.state}</dd></div>
              <div><dt>Name</dt><dd>{detail.name || '—'}</dd></div>
            </dl>
          </section>
          <section className="inspector-section">
            <h3>Tags</h3>
            {Object.keys(detail.tags).length === 0 ? (
              <p className="muted-copy">No tags were reported for this resource.</p>
            ) : (
              <dl className="definition-list">
                {Object.entries(detail.tags).map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>
                ))}
              </dl>
            )}
          </section>
          <section className="inspector-section">
            <h3>Normalized configuration</h3>
            <pre className="json-view">{JSON.stringify(detail.configuration, null, 2)}</pre>
          </section>
        </div>
      )}
    </Drawer>
  )
}
