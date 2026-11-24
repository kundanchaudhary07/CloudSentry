export type ScanStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'
export type FindingCategory = 'SECURITY' | 'COST'
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type FindingStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
export type ResourceType =
  | 'EC2'
  | 'SecurityGroup'
  | 'EBS'
  | 'S3'
  | 'IAMUser'
  | 'IAMRole'
  | 'RDS'
  | 'CloudTrail'

export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
}

export interface CollectionError {
  service: string
  operation: string
  code: string
  message: string
}

export interface ResourceRead {
  id: string
  scan_id: string
  resource_id: string
  resource_type: ResourceType | string
  region: string
  name: string | null
  state: string
  tags: Record<string, string>
  configuration: Record<string, unknown>
}

export interface RemediationHistoryRead {
  id: string
  finding_id: string
  previous_status: FindingStatus
  new_status: FindingStatus
  action: string
  actor: string
  notes: string | null
  created_at: string
}

export interface FindingRead {
  id: string
  scan_id: string
  rule_id: string
  category: FindingCategory
  title: string
  severity: FindingSeverity
  resource_id: string
  resource_type: string
  region: string
  status: FindingStatus
  description: string
  recommendation: string
  details: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FindingDetailRead extends FindingRead {
  remediation_history: RemediationHistoryRead[]
}

export interface ScanRead {
  id: string
  started_at: string
  completed_at: string | null
  status: ScanStatus
  regions: string[]
  resource_count: number
  posture_score: number | null
  severity_counts: Partial<SeverityCounts>
  cost_summary: CostReportSnapshot
}

export interface ScanDetailRead extends ScanRead {
  collection_errors: CollectionError[]
  resources: ResourceRead[]
  findings: FindingRead[]
}

export interface ServiceCost {
  service: string
  amount: string
  unit: string | null
}

export interface CostExplorerSummary {
  cost_explorer_available: boolean
  error_note: string | null
  current_period_start: string | null
  current_period_end: string | null
  prior_period_start: string | null
  prior_period_end: string | null
  current_period_total: string | null
  prior_period_total: string | null
  currency: string | null
  trend_percent_change: string | null
  service_breakdown: ServiceCost[]
}

export interface CostIntelligenceReport {
  total_waste_findings: number
  findings: FindingRead[]
  detection_assumptions: string[]
  cpu_threshold_percent: number
  lookback_days: number
  required_tag_keys: string[]
  cloudwatch_errors: CollectionError[]
  cost_explorer: CostExplorerSummary
}

export type CostReportSnapshot = Partial<CostIntelligenceReport>

export interface CostResponse {
  scan_id: string
  cost_report: CostIntelligenceReport
  findings: FindingRead[]
}

export interface ScanTrendPoint {
  scan_id: string
  started_at: string
  posture_score: number | null
}

export interface DashboardRead {
  posture_score: number | null
  total_resources: number
  high_critical_count: number
  open_findings_count: number
  waste_findings_count: number
  cost_summary: CostReportSnapshot
  recent_scan_trend: ScanTrendPoint[]
  top_findings: FindingRead[]
}

export interface ScanCreateRequest {
  regions?: string[]
  include_cost_explorer: boolean
  cpu_threshold: number
  lookback_days: number
  required_tags: string[]
  required_cost_tags: string[]
}

export interface FindingFilters {
  scan_id?: string
  category?: FindingCategory
  severity?: FindingSeverity
  status?: FindingStatus
  resource_type?: string
  search?: string
}

export interface InventoryFilters {
  scan_id?: string
  resource_type?: string
  region?: string
  search?: string
}

export interface FindingUpdateRequest {
  status?: FindingStatus
  notes?: string | null
  actor?: string
}
