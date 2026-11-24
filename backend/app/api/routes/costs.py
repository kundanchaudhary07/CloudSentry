from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.helpers import latest_completed_scan
from app.api.schemas import CostIntelligenceRead
from app.database.models import Finding, FindingCategory, Scan
from app.database.session import get_db
from app.api.v1.dependencies import get_current_user
from app.database.models import User

router = APIRouter(prefix="/costs", tags=["costs"])


@router.get("", response_model=CostIntelligenceRead)
def get_cost_intelligence(
    scan_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CostIntelligenceRead:
    if scan_id is not None:
        scan = db.scalar(select(Scan).where(Scan.id == scan_id, Scan.user_id == current_user.id))
    else:
        scan = latest_completed_scan(db, current_user.id)
    if scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")
    findings = list(
        db.scalars(
            select(Finding)
            .where(
                Finding.scan_id == scan.id,
                Finding.category == FindingCategory.COST,
                Finding.user_id == current_user.id,
            )
            .order_by(Finding.created_at.desc())
        ).all()
    )
    return CostIntelligenceRead(
        scan_id=scan.id,
        cost_report=scan.cost_summary,
        findings=findings,
    )
