import { Boxes, Database, Network, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getApiErrorMessage, getInventory } from '../../services/api'
import { useScanContext } from '../../context/scan-context'
import type { ResourceRead, ResourceType } from '../../types/api'
import { ResourceDrawer } from '../../components/ui/ResourceDrawer'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoScansState,
  PageHeader,
  StatusPill,
} from '../../components/ui/Feedback'

const resourceTypes: ResourceType[] = [
  'EC2',
  'SecurityGroup',
  'EBS',
  'S3',
  'IAMUser',
  'IAMRole',
  'RDS',
  'CloudTrail',
]

export function InventoryPage() {
  const { scans, loading: scansLoading, error: scansError } = useScanContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const [resources, setResources] = useState<ResourceRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('')
  const [selected, setSelected] = useState<ResourceRead | null>(null)
  const latestCompletedId = scans.find((scan) => scan.status === 'COMPLETED')?.id
  const type = searchParams.get('type') ?? ''

  function setType(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('type', value)
    else next.delete('type')
    setSearchParams(next, { replace: true })
  }

  const loadInventory = useCallback(async () => {
    try {
      setResources(await getInventory())
      setError(null)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!latestCompletedId) return
    let active = true
    getInventory()
      .then((result) => {
        if (active) {
          setResources(result)
          setError(null)
        }
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
  }, [latestCompletedId])

  function retryInventory() {
    setLoading(true)
    void loadInventory()
  }

  const regions = useMemo(
    () => [...new Set(resources.map((resource) => resource.region))].sort(),
    [resources],
  )
  const visibleResources = useMemo(() => {
    const query = search.trim().toLowerCase()
    return resources.filter((resource) => {
      const matchesType = !type || resource.resource_type === type
      const matchesRegion = !region || resource.region === region
      const matchesSearch =
        !query ||
        [resource.resource_id, resource.name ?? '', resource.resource_type, resource.region]
          .some((value) => value.toLowerCase().includes(query))
      return matchesType && matchesRegion && matchesSearch
    })
  }, [resources, search, type, region])
  const storageCount = resources.filter((resource) => resource.resource_type === 'EBS' || resource.resource_type === 'S3').length
  const identityNetworkCount = resources.filter((resource) => ['SecurityGroup', 'IAMUser', 'IAMRole', 'RDS'].includes(resource.resource_type)).length
  const activeFilters = Boolean(search.trim() || type || region)

  function resetFilters() {
    setSearch('')
    setRegion('')
    setType('')
  }

  return (
    <div>
      <PageHeader
        eyebrow="AWS RESOURCES"
        title="Cloud inventory"
        description="Normalized resource snapshots from the latest completed read-only scan."
      />

      {scansError && <ErrorState message={scansError} />}
      {error && <ErrorState message={error} onRetry={retryInventory} />}
      {scansLoading && <LoadingState label="Checking scan history…" />}
      {!scansLoading && !scansError && scans.length === 0 && <NoScansState />}
      {!scansLoading && scans.length > 0 && !latestCompletedId && (
        <EmptyState title="No completed scan yet" description="Inventory is available after a scan completes successfully." />
      )}

      {latestCompletedId && (
        <>
          <section className="inventory-summary-grid remediation-kpi-grid" aria-label="Inventory totals">
            <InventorySummaryCard label="Total assets" value={loading ? null : resources.length} tone="blue" icon={<Boxes size={20} />} />
            <InventorySummaryCard label="Compute · EC2" value={loading ? null : resources.filter((resource) => resource.resource_type === 'EC2').length} tone="violet" icon={<Boxes size={20} />} />
            <InventorySummaryCard label="Storage · S3 & EBS" value={loading ? null : storageCount} tone="mint" icon={<Database size={20} />} />
            <InventorySummaryCard label="Network · identity · RDS" value={loading ? null : identityNetworkCount} tone="amber" icon={<Network size={20} />} />
          </section>

          <div className="toolbar surface-card inventory-toolbar">
            <div className="inventory-filter-top-row">
              <label className="search-control inventory-search-control">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search ID, name, or type…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search inventory"
                />
              </label>
              <label className="inventory-region-group" htmlFor="inventory-region">
                <span className="inventory-region-label">Region</span>
                <select
                  id="inventory-region"
                  className="input-control inventory-region-select"
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                >
                  <option value="">Global</option>
                  {regions.map((value) => (
                    <option value={value} key={value}>
                      {value} ({resources.filter((resource) => resource.region === value).length})
                    </option>
                  ))}
                </select>
              </label>
              {activeFilters && (
                <button className="button button-secondary reset-filters-button" type="button" onClick={resetFilters}>
                  Clear Filters
                </button>
              )}
              <span className="result-count">{visibleResources.length.toLocaleString()} resources</span>
            </div>
            <div className="resource-type-pills" role="group" aria-label="Filter by resource type">
              <button type="button" className={`filter-pill${!type ? ' selected' : ''}`} aria-pressed={!type} onClick={() => setType('')}>All ({resources.length})</button>
              {resourceTypes.map((resourceType) => (
                <button
                  type="button"
                  className={`filter-pill${type === resourceType ? ' selected' : ''}`}
                  aria-pressed={type === resourceType}
                  key={resourceType}
                  onClick={() => setType(resourceType)}
                >
                  {resourceType} ({resources.filter((resource) => resource.resource_type === resourceType).length})
                </button>
              ))}
            </div>
          </div>

          {loading && <LoadingState label="Loading inventory…" />}
          {!loading && !error && visibleResources.length === 0 && (
            <EmptyState
              title={resources.length === 0 ? 'No resources discovered' : 'No matching resources'}
              description={resources.length === 0 ? 'The latest completed scan returned no normalized resources.' : 'Adjust or clear the filters to see more resources.'}
            />
          )}
          {!loading && visibleResources.length > 0 && (
            <div className="table-card surface-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Region</th>
                      <th>State</th>
                      <th>Tags</th>
                      <th><span className="sr-only">Inspect</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResources.map((resource) => (
                      <tr key={resource.id}>
                        <td>
                          <div className="resource-identity">
                            <ResourceTypeBadge type={resource.resource_type} />
                            <div>
                              <button className="table-primary-link" type="button" onClick={() => setSelected(resource)}>
                                {resource.name || resource.resource_id}
                              </button>
                              <span className="table-subtext">{resource.resource_type} · {resource.resource_id}</span>
                            </div>
                          </div>
                        </td>
                        <td>{resource.region}</td>
                        <td><StatusPill status={resource.state} /></td>
                        <td>
                          <div className="resource-tag-list">
                            {Object.entries(resource.tags).slice(0, 2).map(([key, value]) => (
                              <span className="resource-tag-chip" key={key}>{key}: {value || '—'}</span>
                            ))}
                            {Object.keys(resource.tags).length === 0 && <span className="muted-copy">No tags</span>}
                            {Object.keys(resource.tags).length > 2 && <span className="tag-count">+{Object.keys(resource.tags).length - 2}</span>}
                          </div>
                        </td>
                        <td>
                          <button className="circle-arrow-button" type="button" onClick={() => setSelected(resource)} aria-label={`Inspect ${resource.resource_id}`}>
                            <span aria-hidden="true">→</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {selected && <ResourceDrawer resource={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function InventorySummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number | null
  tone: 'blue' | 'mint' | 'amber' | 'violet'
  icon: ReactNode
}) {
  return (
    <article className="surface-card inventory-summary-card remediation-kpi-card">
      <PastelIconBadge tone={tone}>{icon}</PastelIconBadge>
      <div>
        <span className="kpi-label">{label}</span>
        <strong className={value === null ? 'kpi-status-text' : 'kpi-number'}>
          {value === null ? '—' : value.toLocaleString()}
        </strong>
      </div>
    </article>
  )
}

function ResourceTypeBadge({ type }: { type: string }) {
  const icon = type === 'S3' || type === 'EBS' || type === 'RDS'
    ? <Database size={17} />
    : type === 'SecurityGroup'
      ? <ShieldCheck size={17} />
      : <Boxes size={17} />
  const tone = type === 'S3' || type === 'EBS' || type === 'RDS'
    ? 'mint'
    : type === 'SecurityGroup'
      ? 'coral'
      : 'blue'

  return <PastelIconBadge tone={tone}>{icon}</PastelIconBadge>
}
