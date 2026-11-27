import logging

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
    AWSStsNetworkError,
    aws_connection_status,
    encrypt_secret,
    masked_access_key,
    verify_aws_credentials,
)

router = APIRouter(prefix="/settings", tags=["settings"])
logger = logging.getLogger(__name__)


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
    aws_default_region: str = Field(default="us-east-1", max_length=64)
    aws_role_arn: str | None = Field(default=None, max_length=512)


class AwsCredentialsRead(BaseModel):
    connected: bool
    status: str
    reason: str | None = None
    validation_error: str | None = None
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


@router.post("/aws", response_model=AwsCredentialsRead)
@router.put("/aws", response_model=AwsCredentialsRead)
@router.put("/aws-credentials", response_model=AwsCredentialsRead)
def put_aws_credentials(
    request: AwsCredentialsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AwsCredentialsRead:
    access_key_id = request.aws_access_key_id.strip()
    secret_access_key = request.aws_secret_access_key.strip()
    region = request.aws_default_region.strip() or "us-east-1"
    role_arn = (request.aws_role_arn or "").strip() or None
    if not access_key_id or not secret_access_key:
        raise HTTPException(
            status_code=400,
            detail={
                "validation_error": (
                    "Enter both an AWS access key ID and secret access key."
                )
            },
        )

    try:
        identity = verify_aws_credentials(
            access_key_id,
            secret_access_key,
            region,
            role_arn,
        )
    except AWSStsNetworkError as exc:
        raise HTTPException(
            status_code=503,
            detail={"validation_error": str(exc)},
        ) from exc
    except NoCredentialsError as exc:
        logger.exception("AWS STS validation did not receive configured credentials.")
        raise HTTPException(
            status_code=503,
            detail={"validation_error": f"NoCredentialsError: {exc}"},
        ) from exc
    except ClientError as exc:
        error = exc.response.get("Error", {})
        error_code = str(error.get("Code", "ClientError"))
        error_message = str(error.get("Message", str(exc)))
        logger.warning("AWS STS credential verification returned %s: %s", error_code, error_message)
        raise HTTPException(
            status_code=400 if error_code in INVALID_CREDENTIAL_ERROR_CODES else 502,
            detail={"validation_error": f"{error_code}: {error_message}"},
        ) from exc

    encrypted_secret = encrypt_secret(secret_access_key)
    credential = db.scalar(
        select(UserAwsCredential).where(UserAwsCredential.user_id == current_user.id)
    )
    if credential is None:
        credential = UserAwsCredential(user_id=current_user.id)
        db.add(credential)
    credential.aws_access_key_id = access_key_id
    credential.encrypted_secret_access_key = encrypted_secret
    credential.aws_default_region = region
    credential.aws_role_arn = role_arn
    credential.is_valid = True
    db.commit()
    preview = masked_access_key(access_key_id)
    return AwsCredentialsRead(
        connected=True,
        status="connected",
        reason=None,
        validation_error=None,
        account_id=identity["account_id"],
        arn=identity["arn"],
        masked_access_key=preview,
        region=region,
        has_aws_credentials=True,
        aws_access_key_id_preview=preview,
        aws_default_region=region,
        aws_role_arn=role_arn,
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
