import base64
import hashlib

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from botocore.exceptions import ClientError, NoCredentialsError

from app.api.v1.dependencies import get_current_user
from app.config.settings import get_settings as app_get_settings
from app.database.models import ScanSetting, User, UserAwsCredential
from app.database.session import get_db

from app.services.aws_connection import (
    INVALID_CREDENTIAL_ERROR_CODES,
    aws_connection_status,
    verify_aws_credentials,
)

router = APIRouter(prefix="/settings", tags=["settings"])


class ScanSettingsRead(BaseModel):
    regions: list[str]
    include_cost_explorer: bool
    cpu_threshold: float
    lookback_days: int
    required_tags: list[str]
    required_cost_tags: list[str]


class AwsCredentialsRequest(BaseModel):
    aws_access_key_id: str = Field(min_length=1, max_length=128)
    aws_secret_access_key: str = Field(min_length=1, max_length=512)
    aws_default_region: str = Field(default="us-east-1", min_length=1, max_length=64)
    aws_role_arn: str | None = Field(default=None, max_length=512)


class AwsCredentialsRead(BaseModel):
    connected: bool
    status: str
    reason: str | None = None
    account_id: str | None = None
    arn: str | None = None
    masked_access_key: str | None = None
    region: str | None = None
    has_aws_credentials: bool
    aws_access_key_id_preview: str | None = None
    aws_default_region: str | None = None
    aws_role_arn: str | None = None


class AwsConnectionDisconnectRead(BaseModel):
    connected: bool
    status: str


def _fernet() -> Fernet:
    key = hashlib.sha256(app_get_settings().app_secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


@router.get("", response_model=ScanSettingsRead)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanSettingsRead:
    setting = db.scalar(select(ScanSetting).where(ScanSetting.user_id == current_user.id))
    if setting is None:
        setting = ScanSetting(
            user_id=current_user.id,
            regions=[],
            include_cost_explorer=True,
            cpu_threshold=5.0,
            lookback_days=7,
            required_tags=["Environment", "Owner"],
            required_cost_tags=["CostCenter", "Project"],
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return ScanSettingsRead.model_validate(setting, from_attributes=True)


@router.put("", response_model=ScanSettingsRead)
def update_settings(
    request: ScanSettingsRead,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScanSettingsRead:
    setting = db.scalar(select(ScanSetting).where(ScanSetting.user_id == current_user.id))
    if setting is None:
        setting = ScanSetting(user_id=current_user.id)
        db.add(setting)
    for field, value in request.model_dump().items():
        setattr(setting, field, value)
    db.commit()
    db.refresh(setting)
    return ScanSettingsRead.model_validate(setting, from_attributes=True)


@router.put("/aws-credentials", response_model=AwsCredentialsRead)
def put_aws_credentials(
    request: AwsCredentialsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AwsCredentialsRead:
    try:
        verify_aws_credentials(
            request.aws_access_key_id,
            request.aws_secret_access_key,
            request.aws_default_region,
        )
    except NoCredentialsError as exc:
        raise HTTPException(
            status_code=400,
            detail="AWS IAM credentials are invalid or deleted in AWS.",
        ) from exc
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") not in INVALID_CREDENTIAL_ERROR_CODES:
            raise
        raise HTTPException(
            status_code=400,
            detail="AWS IAM credentials are invalid or deleted in AWS.",
        ) from exc

    credential = db.scalar(
        select(UserAwsCredential).where(UserAwsCredential.user_id == current_user.id)
    )
    encrypted_secret = _fernet().encrypt(request.aws_secret_access_key.encode()).decode()
    if credential is None:
        credential = UserAwsCredential(user_id=current_user.id)
        db.add(credential)
    credential.aws_access_key_id = request.aws_access_key_id
    credential.encrypted_secret_access_key = encrypted_secret
    credential.aws_default_region = request.aws_default_region
    credential.aws_role_arn = request.aws_role_arn
    credential.is_valid = True
    db.commit()
    db.refresh(credential)
    return AwsCredentialsRead.model_validate(
        aws_connection_status(db, current_user.id)
    )


@router.get("/aws", response_model=AwsCredentialsRead)
@router.get("/aws-credentials", response_model=AwsCredentialsRead)
def get_aws_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AwsCredentialsRead:
    return AwsCredentialsRead.model_validate(
        aws_connection_status(db, current_user.id)
    )


@router.delete("/aws", response_model=AwsConnectionDisconnectRead)
@router.delete("/aws-credentials", response_model=AwsConnectionDisconnectRead)
def delete_aws_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AwsConnectionDisconnectRead:
    credential = db.scalar(
        select(UserAwsCredential).where(UserAwsCredential.user_id == current_user.id)
    )
    if credential is not None:
        db.delete(credential)
        db.commit()
    return AwsConnectionDisconnectRead(
        connected=False,
        status="disconnected",
    )
