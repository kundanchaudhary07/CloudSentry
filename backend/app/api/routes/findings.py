from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    FindingCategory,
    FindingDetailRead,
    FindingRead,
    FindingSeverity,
    FindingStatus,
    FindingUpdateRequest,
)
from app.database.models import Finding, RemediationHistory
from app.api.v1.dependencies import get_current_user
from app.database.models import User
from app.database.session import get_db

router = APIRouter(prefix="/findings", tags=["findings"])


@router.get("", response_model=list[FindingRead])
def list_findings(
    scan_id: UUID | None = None,
    category: FindingCategory | None = None,
    severity: FindingSeverity | None = None,
    status_filter: FindingStatus | None = Query(default=None, alias="status"),
    resource_type: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Finding]:
    statement = select(Finding).where(Finding.user_id == current_user.id)
    if scan_id is not None:
        statement = statement.where(Finding.scan_id == scan_id)
    if category is not None:
        statement = statement.where(Finding.category == category)
    if severity is not None:
        statement = statement.where(Finding.severity == severity)
    if status_filter is not None:
        statement = statement.where(Finding.status == status_filter)
    if resource_type is not None:
        statement = statement.where(Finding.resource_type == resource_type)
    if search:
        term = f"%{search}%"
        statement = statement.where(
            or_(
                Finding.title.ilike(term),
                Finding.description.ilike(term),
                Finding.resource_id.ilike(term),
                Finding.resource_type.ilike(term),
            )
        )
    statement = statement.order_by(Finding.created_at.desc())
    return list(db.scalars(statement).all())


@router.get("/{finding_id}", response_model=FindingDetailRead)
def get_finding(
    finding_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Finding:
    finding = db.scalar(
        select(Finding)
        .where(Finding.id == finding_id, Finding.user_id == current_user.id)
        .options(selectinload(Finding.remediation_history))
    )
    if finding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")
    return finding


@router.patch("/{finding_id}", response_model=FindingDetailRead)
def update_finding(
    finding_id: UUID,
    request: FindingUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Finding:
    finding = db.scalar(select(Finding).where(
        Finding.id == finding_id, Finding.user_id == current_user.id
    ))
    if finding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")

    supplied = request.model_fields_set
    previous_status = finding.status
    new_status = (
        request.status
        if "status" in supplied and request.status is not None
        else previous_status
    )
    if "status" in supplied:
        finding.status = new_status
    if "notes" in supplied:
        finding.notes = request.notes

    if "status" in supplied and "notes" in supplied:
        action = "STATUS_AND_NOTES_UPDATED"
    elif "status" in supplied:
        action = "STATUS_UPDATED"
    else:
        action = "NOTES_UPDATED"

    db.add(
        RemediationHistory(
            finding_id=finding.id,
            user_id=current_user.id,
            previous_status=previous_status,
            new_status=new_status,
            action=action,
            actor=request.actor,
            notes=request.notes if "notes" in supplied else None,
            created_at=datetime.now(timezone.utc),
        )
    )
    finding.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    updated = db.scalar(
        select(Finding)
        .where(Finding.id == finding_id, Finding.user_id == current_user.id)
        .options(selectinload(Finding.remediation_history))
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finding not found.")
    return updated
