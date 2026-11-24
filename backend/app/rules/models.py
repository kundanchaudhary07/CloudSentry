from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.integrations.aws.models import CollectionError, ResourceType

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class SeverityCounts(BaseModel):
    critical: int = Field(default=0, ge=0)
    high: int = Field(default=0, ge=0)
    medium: int = Field(default=0, ge=0)
    low: int = Field(default=0, ge=0)


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule_id: str
    title: str
    severity: Severity
    resource_id: str
    resource_type: ResourceType
    region: str
    status: Literal["OPEN"] = "OPEN"
    description: str
    recommendation: str
    category: Literal["SECURITY", "COST"] = "SECURITY"
    details: dict[str, Any] = Field(default_factory=dict)


class RiskScore(BaseModel):
    posture_score: int = Field(ge=0, le=100)
    severity_counts: SeverityCounts
    evaluated_resource_count: int = Field(ge=0)


class SecurityEvaluationReport(RiskScore):
    findings: list[Finding] = Field(default_factory=list)


class ServiceCost(BaseModel):
    service: str
    amount: Decimal
    unit: str | None = None


class CostExplorerSummary(BaseModel):
    cost_explorer_available: bool
    error_note: str | None = None
    current_period_start: date | None = None
    current_period_end: date | None = None
    prior_period_start: date | None = None
    prior_period_end: date | None = None
    current_period_total: Decimal | None = None
    prior_period_total: Decimal | None = None
    currency: str | None = None
    trend_percent_change: Decimal | None = None
    service_breakdown: list[ServiceCost] = Field(default_factory=list)


class CostIntelligenceReport(BaseModel):
    total_waste_findings: int = Field(ge=0)
    findings: list[Finding] = Field(default_factory=list)
    detection_assumptions: list[str] = Field(default_factory=list)
    cpu_threshold_percent: float = Field(ge=0, le=100)
    lookback_days: int = Field(ge=1)
    required_tag_keys: list[str] = Field(default_factory=list)
    cloudwatch_errors: list[CollectionError] = Field(default_factory=list)
    cost_explorer: CostExplorerSummary
