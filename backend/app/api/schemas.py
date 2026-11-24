from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.database.models import (
    FindingCategory,
    FindingSeverity,
    FindingStatus,
    ScanStatus,
)


class ScanCreateRequest(BaseModel):
    regions: list[str] | None = None
    include_cost_explorer: bool = False
    cpu_threshold: float = Field(default=5.0, ge=0, le=100)
    lookback_days: int = Field(default=7, ge=1)
    required_tags: list[str] = Field(default_factory=lambda: ["Environment", "Owner"])
    required_cost_tags: list[str] = Field(default_factory=lambda: ["CostCenter", "Project"])


class ScanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    started_at: datetime
    completed_at: datetime | None
    status: ScanStatus
    regions: list[str]
    resource_count: int
    posture_score: int | None
    severity_counts: dict[str, int]
    cost_summary: dict[str, Any]


class ResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scan_id: UUID
    resource_id: str
    resource_type: str
    region: str
    name: str | None
    state: str
    tags: dict[str, str]
    configuration: dict[str, Any]


class RemediationHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    finding_id: UUID
    previous_status: FindingStatus
    new_status: FindingStatus
    action: str
    actor: str
    notes: str | None
    created_at: datetime


class FindingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scan_id: UUID
    rule_id: str
    category: FindingCategory
    title: str
    severity: FindingSeverity
    resource_id: str
    resource_type: str
    region: str
    status: FindingStatus
    description: str
    recommendation: str
    details: dict[str, Any]
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ScanDetailRead(ScanRead):
    collection_errors: list[dict[str, Any]]
    resources: list[ResourceRead] = Field(default_factory=list)
    findings: list[FindingRead] = Field(default_factory=list)


class FindingDetailRead(FindingRead):
    remediation_history: list[RemediationHistoryRead] = Field(default_factory=list)


class FindingUpdateRequest(BaseModel):
    status: FindingStatus | None = None
    notes: str | None = None
    actor: str = Field(default="unknown", min_length=1, max_length=255)

    @model_validator(mode="after")
    def require_update_fields(self) -> "FindingUpdateRequest":
        supplied = self.model_fields_set
        if not supplied.intersection({"status", "notes"}):
            raise ValueError("Provide status and/or notes.")
        if "status" in supplied and self.status is None:
            raise ValueError("status cannot be null.")
        return self


class CostIntelligenceRead(BaseModel):
    scan_id: UUID
    cost_report: dict[str, Any]
    findings: list[FindingRead]


class ScanTrendPoint(BaseModel):
    scan_id: UUID
    started_at: datetime
    posture_score: int | None


class DashboardRead(BaseModel):
    posture_score: int | None
    total_resources: int
    high_critical_count: int
    open_findings_count: int
    waste_findings_count: int
    cost_summary: dict[str, Any]
    recent_scan_trend: list[ScanTrendPoint]
    top_findings: list[FindingRead]
