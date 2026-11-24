import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import boto3
from sqlalchemy.orm import Session

from app.config.settings import get_settings
from app.database.models import (
    CostSnapshot,
    Finding as FindingRecord,
    FindingCategory,
    FindingSeverity,
    FindingStatus,
    Resource as ResourceRecord,
    Scan,
    ScanStatus,
)
from app.integrations.aws.cloudwatch_collector import collect_ec2_cpu_metrics
from app.integrations.aws.cost_explorer_collector import collect_cost_explorer
from app.integrations.aws.inventory_engine import run_inventory
from app.integrations.aws.models import (
    InventorySnapshot,
    MetricCollectionResult,
)
from app.integrations.aws.session import create_aws_session
from app.rules.cost_engine import evaluate_cost_intelligence
from app.rules.engine import evaluate_inventory
from app.rules.models import CostExplorerSummary, CostIntelligenceReport, Finding, SecurityEvaluationReport

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScanDependencies:
    session_factory: Callable[[], boto3.Session] = create_aws_session
    inventory_collector: Callable[..., InventorySnapshot] = run_inventory
    cloudwatch_collector: Callable[..., MetricCollectionResult] = collect_ec2_cpu_metrics
    cost_explorer_collector: Callable[..., CostExplorerSummary] = collect_cost_explorer
    security_evaluator: Callable[..., SecurityEvaluationReport] = evaluate_inventory
    cost_evaluator: Callable[..., CostIntelligenceReport] = evaluate_cost_intelligence


DEFAULT_SCAN_DEPENDENCIES = ScanDependencies()


def get_scan_dependencies() -> ScanDependencies:
    return DEFAULT_SCAN_DEPENDENCIES


def _resolved_regions(
    requested_regions: list[str] | None,
    snapshot: InventorySnapshot,
) -> list[str]:
    if requested_regions:
        return list(dict.fromkeys(requested_regions))

    discovered = sorted(
        {
            resource.region
            for resource in snapshot.resources
            if resource.region.lower() not in {"global", "unknown"}
        }
    )
    if discovered:
        return discovered

    settings = get_settings()
    configured = [region.strip() for region in settings.aws_regions.split(",") if region.strip()]
    return configured or [settings.aws_region]


def _finding_record(scan_id: UUID, user_id: UUID, finding: Finding) -> FindingRecord:
    return FindingRecord(
        scan_id=scan_id,
        user_id=user_id,
        rule_id=finding.rule_id,
        category=FindingCategory(finding.category),
        title=finding.title,
        severity=FindingSeverity(finding.severity),
        resource_id=finding.resource_id,
        resource_type=finding.resource_type,
        region=finding.region,
        status=FindingStatus.OPEN,
        description=finding.description,
        recommendation=finding.recommendation,
        details=finding.details,
    )


def run_and_persist_scan(
    db: Session,
    *,
    user_id: UUID,
    scan_id: UUID | None = None,
    regions: list[str] | None = None,
    include_cost_explorer: bool = True,
    cpu_threshold: float = 5.0,
    lookback_days: int = 7,
    required_tags: Sequence[str] = ("Environment", "Owner"),
    required_cost_tags: Sequence[str] = ("CostCenter", "Project"),
    dependencies: ScanDependencies = DEFAULT_SCAN_DEPENDENCIES,
) -> Scan:
    if scan_id is None:
        scan = Scan(
            user_id=user_id,
            started_at=datetime.now(timezone.utc),
            status=ScanStatus.RUNNING,
            regions=regions or [],
            resource_count=0,
            severity_counts={},
            cost_summary={},
            collection_errors=[],
        )
        db.add(scan)
        db.flush()
        scan_id = scan.id
        db.commit()
    else:
        scan = db.get(Scan, scan_id)
        if scan is None or scan.user_id != user_id:
            raise RuntimeError("Scan not found for user.")

    try:
        aws_session = dependencies.session_factory()
        snapshot = dependencies.inventory_collector(session=aws_session, regions=regions)
        metrics = dependencies.cloudwatch_collector(
            aws_session,
            snapshot,
            lookback_days=lookback_days,
        )
        cost_explorer_enabled = include_cost_explorer and get_settings().aws_enable_cost_explorer
        cost_explorer = dependencies.cost_explorer_collector(
            aws_session,
            enabled=cost_explorer_enabled,
        )
        security_report = dependencies.security_evaluator(snapshot, required_tags)
        cost_report = dependencies.cost_evaluator(
            snapshot,
            metrics.metrics,
            cloudwatch_errors=metrics.errors,
            cost_explorer=cost_explorer,
            cpu_threshold=cpu_threshold,
            lookback_days=lookback_days,
            required_tag_keys=required_cost_tags,
        )
        collection_errors: list[dict[str, Any]] = [
            error.model_dump(mode="json") for error in [*snapshot.errors, *metrics.errors]
        ]
        if cost_explorer_enabled and not cost_explorer.cost_explorer_available:
            collection_errors.append(
                {
                    "service": "ce",
                    "operation": "GetCostAndUsage",
                    "code": "Unavailable",
                    "message": cost_explorer.error_note
                    or "Cost Explorer data is unavailable.",
                }
            )

        findings = [*security_report.findings, *cost_report.findings]
        resources = []
        for resource in snapshot.resources:
            normalized_resource = resource.model_dump(mode="json")
            resources.append(
                ResourceRecord(
                    scan_id=scan_id,
                    user_id=user_id,
                    resource_id=resource.resource_id,
                    resource_type=resource.resource_type,
                    region=resource.region,
                    name=resource.name,
                    state=resource.state,
                    tags=normalized_resource["tags"],
                    configuration=normalized_resource["configuration"],
                )
            )

        finding_records = [_finding_record(scan_id, user_id, finding) for finding in findings]

        completed_scan = db.get(Scan, scan_id)
        if completed_scan is None:
            raise RuntimeError("The scan record disappeared before completion.")
        completed_scan.status = ScanStatus.COMPLETED
        completed_scan.completed_at = datetime.now(timezone.utc)
        completed_scan.regions = _resolved_regions(regions, snapshot)
        completed_scan.resource_count = len(snapshot.resources)
        completed_scan.posture_score = security_report.posture_score
        completed_scan.severity_counts = security_report.severity_counts.model_dump(
            mode="json"
        )
        completed_scan.cost_summary = cost_report.model_dump(mode="json")
        completed_scan.collection_errors = collection_errors
        db.add_all([*resources, *finding_records])
        db.add(CostSnapshot(
            user_id=user_id,
            scan_id=scan_id,
            report=completed_scan.cost_summary,
        ))
        db.commit()
        return completed_scan
    except Exception as exc:
        db.rollback()
        logger.error(
            "Scan execution failed (%s)",
            type(exc).__name__,
            extra={"scan_id": str(scan_id)},
        )
        try:
            failed_scan = db.get(Scan, scan_id)
            if failed_scan is not None:
                failed_scan.status = ScanStatus.FAILED
                failed_scan.completed_at = datetime.now(timezone.utc)
                failed_scan.collection_errors = [
                    {
                        "service": "scan",
                        "operation": "run",
                        "code": type(exc).__name__,
                        "message": "Scan failed; consult server logs for details.",
                    }
                ]
                db.commit()
        except Exception:
            db.rollback()
            logger.error(
                "Failed to persist scan failure status",
                extra={"scan_id": str(scan_id)},
            )
        raise
