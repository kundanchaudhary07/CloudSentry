from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Scan, ScanStatus
from uuid import UUID


def latest_completed_scan(db: Session, user_id: UUID) -> Scan | None:
    return db.scalar(
        select(Scan)
        .where(Scan.status == ScanStatus.COMPLETED, Scan.user_id == user_id)
        .order_by(Scan.started_at.desc())
        .limit(1)
    )
