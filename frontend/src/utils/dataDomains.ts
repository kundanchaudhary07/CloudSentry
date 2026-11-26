import type { FindingRead, ResourceRead } from '../types/api'

export type DomainId = 'compute' | 'security' | 'storage' | 'finops'
export type DomainFilter = DomainId | 'all'

export interface DomainDefinition {
  id: DomainId
  label: string
  title: string
  subtitle: string
}

export const domains: DomainDefinition[] = [
  {
    id: 'compute',
    label: 'Compute & Servers',
    title: 'Compute & Servers',
    subtitle: 'Instances, volumes & runtime compute',
  },
  {
    id: 'security',
    label: 'Security & Identity',
    title: 'Security & Identity',
    subtitle: 'Access, network controls & audit signals',
  },
  {
    id: 'storage',
    label: 'Storage & Databases',
    title: 'Storage & Databases',
    subtitle: 'Object storage, databases & persistence',
  },
  {
    id: 'finops',
    label: 'FinOps & Cost',
    title: 'FinOps & Cost Optimization',
    subtitle: 'Waste, allocation & utilization signals',
  },
]

export function getResourceDomain(resource: ResourceRead): DomainId {
  switch (resource.resource_type.toUpperCase()) {
    case 'EC2':
    case 'EBS':
      return 'compute'
    case 'SECURITYGROUP':
    case 'IAMUSER':
    case 'IAMROLE':
    case 'CLOUDTRAIL':
      return 'security'
    case 'S3':
    case 'RDS':
      return 'storage'
    default:
      return 'security'
  }
}

export function getFindingDomain(finding: FindingRead): DomainId {
  const ruleId = finding.rule_id.toUpperCase()
  if (finding.category === 'COST' || ruleId.startsWith('COST-')) return 'finops'
  if (/^(EC2|EBS)-/.test(ruleId)) return 'compute'
  if (/^(SG|IAM)-/.test(ruleId)) return 'security'
  if (/^(S3|RDS)-/.test(ruleId)) return 'storage'

  switch (finding.resource_type.toUpperCase()) {
    case 'EC2':
    case 'EBS':
      return 'compute'
    case 'S3':
    case 'RDS':
      return 'storage'
    default:
      return 'security'
  }
}

export function groupByDomain<T>(
  items: T[],
  getDomain: (item: T) => DomainId,
  selected: DomainFilter,
) {
  const definitions = selected === 'all'
    ? domains
    : domains.filter((domain) => domain.id === selected)

  return definitions
    .map((domain) => ({
      domain,
      items: items.filter((item) => getDomain(item) === domain.id),
    }))
    .filter((group) => group.items.length > 0 || selected === group.domain.id)
}
