from dataclasses import replace
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import ScanCreateRequest, ScanDetailRead, ScanRead
from app.api.v1.dependencies import get_current_user
from app.database.models import Scan, User, UserAwsCredential
from app.database.session import get_db
import app.database.session as database_session
from app.integrations.aws.session import create_aws_session_with_credentials
from app.services.scan_service import (
    ScanDependencies,
    get_scan_dependencies,
    run_and_persist_scan,
)
from app.services.aws_connection import aws_connection_status, decrypt_secret

router = APIRouter(prefix="/scans", tags=["scans"])


def _run_scan_background(
    scan_id: UUID,
    user_id: UUID,
    request: ScanCreateRequest,
    dependencies: ScanDependencies,
) -> None:
    with database_session.SessionLocal() as db:
        try:
            credential = db.scalar(
                select(UserAwsCredential).where(UserAwsCredential.user_id == user_id)
            )
            if credential is None:
                raise RuntimeError("AWS credentials are not configured for this user.")
            secret = decrypt_secret(credential.encrypted_secret_access_key)
            session_factory = lambda: create_aws_session_with_credentials(
                credential.aws_access_key_id,
                secret,
                credential.aws_default_region,
                credential.aws_role_arn,
            )
            isolated_dependencies = replace(dependencies, session_factory=session_factory)
            run_and_persist_scan(
                db,
                user_id=user_id,
                scan_id=scan_id,
                regions=request.regions,
                include_cost_explorer=request.include_cost_explorer,
                cpu_threshold=request.cpu_threshold,
                lookback_days=request.lookback_days,
                required_tags=request.required_tags,
                required_cost_tags=request.required_cost_tags,
                dependencies=isolated_dependencies,
            )
        except Exception:
            failed = db.get(Scan, scan_id)
            if failed is not None:
                failed.status = "FAILED"
                db.commit()


@router.post("", response_model=ScanRead, status_code=status.HTTP_202_ACCEPTED)
def create_scan(
    request: ScanCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    dependencies: ScanDependencies = Depends(get_scan_dependencies),
    current_user: User = Depends(get_current_user),
) -> Scan:
    connection = aws_connection_status(db, current_user.id)
    if not connection["connected"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AWS IAM credentials are invalid or deleted. Reconnect in Settings before running a scan.",
        )
    scan = Scan(
        user_id=current_user.id,
        status="RUNNING",
        regions=request.regions or [],
        resource_count=0,
        severity_counts={},
        cost_summary={},
        collection_errors=[],
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    background_tasks.add_task(
        _run_scan_background,
        scan.id,
        current_user.id,
        request,
        dependencies,
    )
    return scan


@router.get("", response_model=list[ScanRead])
def list_scans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Scan]:
    return list(
        db.scalars(
            select(Scan)
            .where(Scan.user_id == current_user.id)
            .order_by(Scan.started_at.desc())
        ).all()
    )


@router.get("/{scan_id}", response_model=ScanDetailRead)
def get_scan(
    scan_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Scan:
    scan = db.scalar(
        select(Scan)
        .where(Scan.id == scan_id, Scan.user_id == current_user.id)
        .options(selectinload(Scan.resources), selectinload(Scan.findings))
    )
    if scan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")
    return scan
