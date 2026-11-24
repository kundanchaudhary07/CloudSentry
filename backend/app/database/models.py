import uuid
from datetime import datetime
from enum import Enum
from typing import Any
from sqlalchemy import Boolean

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Float,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    auth_provider: Mapped[str] = mapped_column(String(32), nullable=False, default="local")
    provider_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    scans: Mapped[list["Scan"]] = relationship(back_populates="user")
    aws_credentials: Mapped["UserAwsCredential | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    scan_settings: Mapped["ScanSetting | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserAwsCredential(Base):
    __tablename__ = "user_aws_credentials"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, index=True, nullable=False,
    )
    aws_access_key_id: Mapped[str] = mapped_column(String(128), nullable=False)
    encrypted_secret_access_key: Mapped[str] = mapped_column(Text, nullable=False)
    aws_default_region: Mapped[str] = mapped_column(String(64), nullable=False, default="us-east-1")
    aws_role_arn: Mapped[str | None] = mapped_column(String(512))
    user: Mapped[User] = relationship(back_populates="aws_credentials")


class ScanSetting(Base):
    __tablename__ = "scan_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, index=True, nullable=False,
    )
    regions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    include_cost_explorer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cpu_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    lookback_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    required_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    required_cost_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    user: Mapped[User] = relationship(back_populates="scan_settings")


class CostSnapshot(Base):
    __tablename__ = "cost_snapshots"
    __table_args__ = (
        Index("ix_cost_snapshots_user_scan", "user_id", "scan_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
    )
    report: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ScanStatus(str, Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class FindingCategory(str, Enum):
    SECURITY = "SECURITY"
    COST = "COST"


class FindingSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class FindingStatus(str, Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


def _enum_values(enum_class: type[Enum]) -> list[str]:
    return [member.value for member in enum_class]


scan_status_enum = SqlEnum(
    ScanStatus,
    name="scan_status",
    native_enum=False,
    create_constraint=True,
    values_callable=_enum_values,
)
finding_category_enum = SqlEnum(
    FindingCategory,
    name="finding_category",
    native_enum=False,
    create_constraint=True,
    values_callable=_enum_values,
)
finding_severity_enum = SqlEnum(
    FindingSeverity,
    name="finding_severity",
    native_enum=False,
    create_constraint=True,
    values_callable=_enum_values,
)
finding_status_enum = SqlEnum(
    FindingStatus,
    name="finding_status",
    native_enum=False,
    create_constraint=True,
    values_callable=_enum_values,
)
remediation_previous_status_enum = SqlEnum(
    FindingStatus,
    name="remediation_previous_status",
    native_enum=False,
    create_constraint=True,
    values_callable=_enum_values,
)
remediation_new_status_enum = SqlEnum(
    FindingStatus,
    name="remediation_new_status",
    native_enum=False,
    create_constraint=True,
    values_callable=_enum_values,
)


class Scan(Base):
    __tablename__ = "scans"
    __table_args__ = (
        CheckConstraint("resource_count >= 0", name="resource_count_nonnegative"),
        CheckConstraint(
            "posture_score IS NULL OR (posture_score >= 0 AND posture_score <= 100)",
            name="posture_score_bounds",
        ),
        Index("ix_scans_started_at", "started_at"),
        Index("ix_scans_status_started_at", "status", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[ScanStatus] = mapped_column(
        scan_status_enum, nullable=False, default=ScanStatus.RUNNING
    )
    regions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    resource_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    posture_score: Mapped[int | None] = mapped_column(Integer)
    severity_counts: Mapped[dict[str, int]] = mapped_column(JSON, nullable=False, default=dict)
    cost_summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    collection_errors: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )

    resources: Mapped[list["Resource"]] = relationship(
        back_populates="scan",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    findings: Mapped[list["Finding"]] = relationship(
        back_populates="scan",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    user: Mapped[User] = relationship(back_populates="scans")


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (
        UniqueConstraint(
            "scan_id",
            "resource_id",
            "resource_type",
            "region",
            name="uq_resources_scan_resource_region",
        ),
        Index("ix_resources_scan_type", "scan_id", "resource_type"),
        Index("ix_resources_scan_region", "scan_id", "region"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource_id: Mapped[str] = mapped_column(String(512), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str | None] = mapped_column(String(512))
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    tags: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    scan: Mapped[Scan] = relationship(back_populates="resources")


class Finding(Base):
    __tablename__ = "findings"
    __table_args__ = (
        UniqueConstraint(
            "scan_id",
            "rule_id",
            "resource_id",
            "region",
            name="uq_findings_scan_rule_resource_region",
        ),
        Index("ix_findings_scan_category_status", "scan_id", "category", "status"),
        Index("ix_findings_scan_severity", "scan_id", "severity"),
        Index("ix_findings_resource_type", "resource_type"),
        Index("ix_findings_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
    )
    rule_id: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[FindingCategory] = mapped_column(finding_category_enum, nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[FindingSeverity] = mapped_column(finding_severity_enum, nullable=False)
    resource_id: Mapped[str] = mapped_column(String(512), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[FindingStatus] = mapped_column(
        finding_status_enum,
        nullable=False,
        default=FindingStatus.OPEN,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    scan: Mapped[Scan] = relationship(back_populates="findings")
    remediation_history: Mapped[list["RemediationHistory"]] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RemediationHistory.created_at",
    )


class RemediationHistory(Base):
    __tablename__ = "remediation_history"
    __table_args__ = (
        Index("ix_remediation_history_finding_created_at", "finding_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    finding_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("findings.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_status: Mapped[FindingStatus] = mapped_column(
        remediation_previous_status_enum,
        nullable=False,
    )
    new_status: Mapped[FindingStatus] = mapped_column(
        remediation_new_status_enum,
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    finding: Mapped[Finding] = relationship(back_populates="remediation_history")
