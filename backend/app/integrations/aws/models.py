from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ResourceType = Literal[
    "EC2",
    "SecurityGroup",
    "EBS",
    "S3",
    "IAMUser",
    "IAMRole",
    "RDS",
    "CloudTrail",
]


class InventoryResource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_id: str
    resource_type: ResourceType
    region: str
    name: str | None = None
    state: str
    tags: dict[str, str] = Field(default_factory=dict)
    configuration: dict[str, Any] = Field(default_factory=dict)


class CollectionError(BaseModel):
    service: str
    operation: str
    code: str
    message: str


class CollectionResult(BaseModel):
    resources: list[InventoryResource] = Field(default_factory=list)
    errors: list[CollectionError] = Field(default_factory=list)


class InventorySnapshot(BaseModel):
    resources: list[InventoryResource]
    errors: list[CollectionError] = Field(default_factory=list)


class EC2CpuMetric(BaseModel):
    resource_id: str
    region: str
    lookback_days: int = Field(ge=1)
    start_time: datetime
    end_time: datetime
    average_cpu_percent: float | None = Field(default=None, ge=0, le=100)
    maximum_cpu_percent: float | None = Field(default=None, ge=0, le=100)
    datapoint_count: int = Field(default=0, ge=0)


class MetricCollectionResult(BaseModel):
    metrics: list[EC2CpuMetric] = Field(default_factory=list)
    errors: list[CollectionError] = Field(default_factory=list)
