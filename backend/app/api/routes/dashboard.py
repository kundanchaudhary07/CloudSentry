from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.routes.helpers import latest_completed_scan
from app.api.schemas import DashboardRead, ScanTrendPoint
from app.database.models import (
    Finding,
    FindingCategory,
    FindingSeverity,
    FindingStatus,
    Scan,
    ScanStatus,
)
from app.database.session import get_db
from app.api.v1.dependencies import get_current_user
from app.database.models import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardRead)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardRead:
    latest = latest_completed_scan(db, current_user.id)
    recent_scans = list(
        db.scalars(
            select(Scan)
            .where(
                Scan.status == ScanStatus.COMPLETED,
                Scan.user_id == current_user.id,
            )
            .order_by(Scan.started_at.desc())
            .limit(10)
        ).all()
    )
    trend = [
        ScanTrendPoint(
            scan_id=scan.id,
            started_at=scan.started_at,
            posture_score=scan.posture_score,
        )
        for scan in reversed(recent_scans)
    ]

    if latest is None:
        return DashboardRead(
            posture_score=None,
            total_resources=0,
            high_critical_count=0,
            open_findings_count=0,
            waste_findings_count=0,
            cost_summary={},
            recent_scan_trend=trend,
            top_findings=[],
        )

    open_filter = (
        Finding.scan_id == latest.id,
        Finding.status == FindingStatus.OPEN,
        Finding.user_id == current_user.id,
    )
    findings_count = db.scalar(select(func.count(Finding.id)).where(*open_filter)) or 0
    high_critical_count = db.scalar(
        select(func.count(Finding.id)).where(
            *open_filter,
            Finding.severity.in_([FindingSeverity.CRITICAL, FindingSeverity.HIGH]),
        )
    ) or 0
    waste_findings_count = db.scalar(
        select(func.count(Finding.id)).where(
            *open_filter,
            Finding.category == FindingCategory.COST,
        )
    ) or 0
    severity_order = case(
        (Finding.severity == FindingSeverity.CRITICAL, 0),
        (Finding.severity == FindingSeverity.HIGH, 1),
        (Finding.severity == FindingSeverity.MEDIUM, 2),
        else_=3,
    )
    top_findings = list(
        db.scalars(
            select(Finding)
            .where(*open_filter)
            .order_by(severity_order, Finding.created_at.desc())
            .limit(5)
        ).all()
    )
    return DashboardRead(
        posture_score=latest.posture_score,
        total_resources=latest.resource_count,
        high_critical_count=high_critical_count,
        open_findings_count=findings_count,
        waste_findings_count=waste_findings_count,
        cost_summary=latest.cost_summary,
        recent_scan_trend=trend,
        top_findings=top_findings,
    )
