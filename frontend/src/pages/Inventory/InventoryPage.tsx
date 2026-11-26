import { ArrowRight, Boxes, Database, HardDrive, MapPin, Search, Server, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getApiErrorMessage, getInventory } from '../../services/api'
import { useScanContext } from '../../context/scan-context'
import type { ResourceRead, ResourceType } from '../../types/api'
import { ResourceDrawer } from '../../components/ui/ResourceDrawer'
import { PastelIconBadge } from '../../components/ui/PastelIconBadge'
import { DomainSection, DomainSegmentedControl } from '../../components/ui/DomainSections'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoScansState,
  PageHeader,
  StatusPill,
} from '../../components/ui/Feedback'
import { getResourceDomain, groupByDomain } from '../../utils/dataDomains'
import type { DomainFilter, DomainId } from '../../utils/dataDomains'
import '../../styles/data-grid.css'

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
  const [domain, setDomain] = useState<DomainFilter>('all')
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
  const filteredResources = useMemo(() => {
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
  const visibleResources = useMemo(
    () => filteredResources.filter((resource) => domain === 'all' || getResourceDomain(resource) === domain),
    [filteredResources, domain],
  )
  const domainGroups = groupByDomain(visibleResources, getResourceDomain, domain)
  const domainCounts = filteredResources.reduce<Record<DomainId, number>>((counts, resource) => {
    counts[getResourceDomain(resource)] += 1
    return counts
  }, { compute: 0, security: 0, storage: 0, finops: 0 })
  const storageCount = resources.filter((resource) => resource.resource_type === 'S3' || resource.resource_type === 'RDS').length
  const computeCount = resources.filter((resource) => resource.resource_type === 'EC2' || resource.resource_type === 'EBS').length
  const securityCount = resources.filter((resource) => ['SecurityGroup', 'IAMUser', 'IAMRole', 'CloudTrail'].includes(resource.resource_type)).length
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
            <InventorySummaryCard label="Compute & servers" value={loading ? null : computeCount} tone="violet" icon={<Boxes size={20} />} />
            <InventorySummaryCard label="Storage & databases" value={loading ? null : storageCount} tone="mint" icon={<Database size={20} />} />
            <InventorySummaryCard label="Security & identity" value={loading ? null : securityCount} tone="amber" icon={<ShieldCheck size={20} />} />
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
          <DomainSegmentedControl value={domain} counts={domainCounts} onChange={setDomain} />

          {loading && <LoadingState label="Loading inventory…" />}
          {!loading && !error && visibleResources.length === 0 && (
            <EmptyState
              title={resources.length === 0 ? 'No resources discovered' : 'No matching resources'}
              description={resources.length === 0 ? 'The latest completed scan returned no normalized resources.' : 'Adjust the domain, type, region, or search filters to see more resources.'}
            />
          )}
          {!loading && visibleResources.length > 0 && (
            <div className="domain-section-list">
              {domainGroups.map(({ domain: section, items }) => (
                <DomainSection key={section.id} domain={section} count={items.length}>
                  <div className="data-grid-list">
                    {items.map((resource) => (
                      <article
                        key={resource.id}
                        className="data-grid-row inventory-data-row"
                        data-domain={section.id}
                        role="group"
                        tabIndex={0}
                        aria-label={`Inspect ${resource.name || resource.resource_id}`}
                        onClick={() => setSelected(resource)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelected(resource)
                          }
                        }}
                      >
                        <div className="resource-data-primary">
                          <span className="resource-type-icon"><ResourceTypeIcon type={resource.resource_type} /></span>
                          <div className="data-grid-title">
                            <strong>{resource.name || resource.resource_id}</strong>
                            <small>{resource.resource_type} · {resource.resource_id}</small>
                          </div>
                        </div>
                        <div className="resource-data-meta">
                          <code>{resource.resource_id}</code>
                          <span className="region-label"><MapPin size={13} aria-hidden="true" />{resource.region || 'global'}</span>
                        </div>
                        <div className="finding-state-cluster"><StatusPill status={resource.state} /></div>
                        <div className="resource-data-tags">
                          {Object.entries(resource.tags).slice(0, 2).map(([key, value]) => (
                            <span className="resource-tag-chip" key={key}>{key}: {value || '—'}</span>
                          ))}
                          {Object.keys(resource.tags).length === 0 && <span className="muted-copy">No tags</span>}
                          {Object.keys(resource.tags).length > 2 && <span className="tag-count">+{Object.keys(resource.tags).length - 2}</span>}
                        </div>
                        <button
                          className="data-grid-inspect"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelected(resource)
                          }}
                        >
                          Inspect <ArrowRight size={15} aria-hidden="true" />
                        </button>
                        <ArrowRight className="data-grid-row-chevron" size={16} aria-hidden="true" />
                      </article>
                    ))}
                  </div>
                </DomainSection>
              ))}
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

function ResourceTypeIcon({ type }: { type: string }) {
  if (type === 'S3' || type === 'RDS') return <Database size={17} aria-hidden="true" />
  if (type === 'EBS') return <HardDrive size={17} aria-hidden="true" />
  if (type === 'SecurityGroup' || type === 'IAMUser' || type === 'IAMRole' || type === 'CloudTrail') {
    return <ShieldCheck size={17} aria-hidden="true" />
  }
  return <Server size={17} aria-hidden="true" />
}
