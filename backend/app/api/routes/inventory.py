from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.routes.helpers import latest_completed_scan
from app.api.schemas import ResourceRead
from app.database.models import Resource, Scan
from app.database.session import get_db
from app.api.v1.dependencies import get_current_user
from app.database.models import User

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("", response_model=list[ResourceRead])
def list_inventory(
    scan_id: UUID | None = None,
    resource_type: str | None = None,
    region: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Resource]:
    selected_scan_id = scan_id
    if selected_scan_id is None:
        latest = latest_completed_scan(db, current_user.id)
        if latest is None:
            return []
        selected_scan_id = latest.id
    elif db.scalar(select(Scan).where(Scan.id == selected_scan_id, Scan.user_id == current_user.id)) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    statement = select(Resource).where(
        Resource.scan_id == selected_scan_id,
        Resource.user_id == current_user.id,
    )
    if resource_type is not None:
        statement = statement.where(Resource.resource_type == resource_type)
    if region is not None:
        statement = statement.where(Resource.region == region)
    if search:
        term = f"%{search}%"
        statement = statement.where(
            or_(
                Resource.resource_id.ilike(term),
                Resource.name.ilike(term),
                Resource.resource_type.ilike(term),
            )
        )
    return list(db.scalars(statement.order_by(Resource.resource_type, Resource.resource_id)).all())
