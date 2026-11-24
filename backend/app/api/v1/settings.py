import base64
import hashlib

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.config.settings import get_settings as app_get_settings
from app.database.models import ScanSetting, User, UserAwsCredential
from app.database.session import get_db

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
    has_aws_credentials: bool
    aws_access_key_id_preview: str | None = None
    aws_default_region: str
    aws_role_arn: str | None = None


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
            include_cost_explorer=False,
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
    db.commit()
    db.refresh(credential)
    return _credential_read(credential)


@router.get("/aws-credentials", response_model=AwsCredentialsRead)
def get_aws_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AwsCredentialsRead:
    credential = db.scalar(
        select(UserAwsCredential).where(UserAwsCredential.user_id == current_user.id)
    )
    if credential is None:
        return AwsCredentialsRead(
            has_aws_credentials=False,
            aws_access_key_id_preview=None,
            aws_default_region=app_get_settings().aws_region,
        )
    return _credential_read(credential)


def _credential_read(credential: UserAwsCredential) -> AwsCredentialsRead:
    access_key = credential.aws_access_key_id
    preview = access_key if len(access_key) <= 8 else f"{access_key[:4]}••••{access_key[-4:]}"
    return AwsCredentialsRead(
        has_aws_credentials=True,
        aws_access_key_id_preview=preview,
        aws_default_region=credential.aws_default_region,
        aws_role_arn=credential.aws_role_arn,
    )
