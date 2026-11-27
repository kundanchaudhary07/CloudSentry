import base64
import hashlib
from typing import Any
from uuid import UUID

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.settings import get_settings
from app.database.models import UserAwsCredential

INVALID_CREDENTIAL_ERROR_CODES = {
    "InvalidClientTokenId",
    "SignatureDoesNotMatch",
    "UnrecognizedClientException",
    "AccessDenied",
}
INVALID_CREDENTIAL_REASON = "AWS IAM access key is invalid or deleted in AWS."


def _fernet() -> Fernet:
    key = hashlib.sha256(get_settings().app_secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def masked_access_key(access_key_id: str) -> str:
    return access_key_id if len(access_key_id) <= 8 else f"{access_key_id[:4]}••••{access_key_id[-4:]}"


def verify_aws_credentials(
    access_key_id: str,
    secret_access_key: str,
    region: str,
) -> dict[str, str]:
    sts = boto3.client(
        "sts",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=region,
        config=Config(
            connect_timeout=4,
            read_timeout=4,
            retries={"max_attempts": 1},
        ),
    )
    identity = sts.get_caller_identity()
    return {"account_id": identity["Account"], "arn": identity["Arn"]}


def aws_connection_status(
    db: Session,
    user_id: UUID,
) -> dict[str, Any]:
    credential = db.scalar(
        select(UserAwsCredential).where(UserAwsCredential.user_id == user_id)
    )
    if credential is None:
        return {
            "connected": False,
            "status": "disconnected",
            "reason": None,
            "account_id": None,
            "arn": None,
            "masked_access_key": None,
            "region": None,
            "has_aws_credentials": False,
            "aws_access_key_id_preview": None,
            "aws_default_region": get_settings().aws_region,
            "aws_role_arn": None,
        }

    secret = _fernet().decrypt(credential.encrypted_secret_access_key.encode()).decode()
    try:
        identity = verify_aws_credentials(
            credential.aws_access_key_id,
            secret,
            credential.aws_default_region,
        )
    except NoCredentialsError:
        credential.is_valid = False
        db.commit()
        return _revoked_status(credential)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") not in INVALID_CREDENTIAL_ERROR_CODES:
            raise
        credential.is_valid = False
        db.commit()
        return _revoked_status(credential)

    if not credential.is_valid:
        credential.is_valid = True
        db.commit()
    return {
        "connected": True,
        "status": "connected",
        "reason": None,
        "account_id": identity["account_id"],
        "arn": identity["arn"],
        "masked_access_key": masked_access_key(credential.aws_access_key_id),
        "region": credential.aws_default_region,
        "has_aws_credentials": True,
        "aws_access_key_id_preview": masked_access_key(credential.aws_access_key_id),
        "aws_default_region": credential.aws_default_region,
        "aws_role_arn": credential.aws_role_arn,
    }


def _revoked_status(credential: UserAwsCredential) -> dict[str, Any]:
    preview = masked_access_key(credential.aws_access_key_id)
    return {
        "connected": False,
        "status": "revoked",
        "reason": INVALID_CREDENTIAL_REASON,
        "account_id": None,
        "arn": None,
        "masked_access_key": preview,
        "region": credential.aws_default_region,
        "has_aws_credentials": True,
        "aws_access_key_id_preview": preview,
        "aws_default_region": credential.aws_default_region,
        "aws_role_arn": credential.aws_role_arn,
    }
