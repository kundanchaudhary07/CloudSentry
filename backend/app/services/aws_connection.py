import base64
import hashlib
import logging
from typing import Any
from uuid import UUID

import boto3
from botocore.config import Config
from botocore.exceptions import (
    ClientError,
    ConnectTimeoutError,
    EndpointConnectionError,
    NoCredentialsError,
    ReadTimeoutError,
    SSLError,
)
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.settings import get_settings
from app.database.models import UserAwsCredential

logger = logging.getLogger(__name__)

INVALID_CREDENTIAL_ERROR_CODES = {
    "InvalidClientTokenId",
    "SignatureDoesNotMatch",
    "UnrecognizedClientException",
    "ExpiredToken",
    "ExpiredTokenException",
    "AuthFailure",
    "AccessDenied",
}
INVALID_CREDENTIAL_REASON = "AWS IAM access key is invalid or deleted in AWS."
STS_NETWORK_ERROR = (
    "Unable to reach AWS STS endpoint (check network/TLS). Saved credentials retained."
)
_STS_NETWORK_EXCEPTIONS = (
    EndpointConnectionError,
    ConnectTimeoutError,
    ReadTimeoutError,
    SSLError,
)


class AWSStsNetworkError(RuntimeError):
    pass


def _fernet() -> Fernet:
    key = hashlib.sha256(get_settings().app_secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(secret_access_key: str) -> str:
    clean_secret = secret_access_key.strip()
    encrypted = _fernet().encrypt(clean_secret.encode("utf-8")).decode("ascii")
    if decrypt_secret(encrypted) != clean_secret:
        raise RuntimeError("AWS secret access key encryption round-trip failed.")
    return encrypted


def decrypt_secret(encrypted_secret_access_key: str) -> str:
    return _fernet().decrypt(encrypted_secret_access_key.encode("ascii")).decode("utf-8")


def masked_access_key(access_key_id: str) -> str:
    clean_key_id = access_key_id.strip()
    return clean_key_id if len(clean_key_id) <= 8 else f"{clean_key_id[:4]}••••{clean_key_id[-4:]}"


def verify_aws_credentials(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    role_arn: str | None = None,
) -> dict[str, str]:
    clean_key_id = access_key_id.strip()
    clean_secret = secret_access_key.strip()
    clean_region = region.strip() or "us-east-1"
    clean_role_arn = (role_arn or "").strip() or None
    if not clean_key_id or not clean_secret:
        raise ValueError("AWS access key ID and secret access key are required.")

    try:
        sts = boto3.client(
            "sts",
            aws_access_key_id=clean_key_id,
            aws_secret_access_key=clean_secret,
            region_name=clean_region,
            config=Config(
                connect_timeout=4,
                read_timeout=4,
                retries={"max_attempts": 1},
            ),
        )
        identity = sts.get_caller_identity()
        if clean_role_arn:
            sts.assume_role(
                RoleArn=clean_role_arn,
                RoleSessionName="CloudSentryVerify",
            )
    except _STS_NETWORK_EXCEPTIONS as exc:
        logger.exception("AWS STS verification could not reach the AWS endpoint.")
        raise AWSStsNetworkError(STS_NETWORK_ERROR) from exc

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
            "validation_error": None,
            "account_id": None,
            "arn": None,
            "masked_access_key": None,
            "region": None,
            "has_aws_credentials": False,
            "aws_access_key_id_preview": None,
            "aws_default_region": get_settings().aws_region,
            "aws_role_arn": None,
        }

    secret = decrypt_secret(credential.encrypted_secret_access_key)
    region = credential.aws_default_region.strip() or "us-east-1"
    try:
        identity = verify_aws_credentials(
            credential.aws_access_key_id,
            secret,
            region,
            credential.aws_role_arn,
        )
    except AWSStsNetworkError as exc:
        return _unavailable_status(credential, str(exc), region)
    except NoCredentialsError as exc:
        logger.exception("AWS STS verification did not receive configured credentials.")
        return _unavailable_status(
            credential,
            f"NoCredentialsError: {exc}",
            region,
        )
    except ClientError as exc:
        error = exc.response.get("Error", {})
        error_code = str(error.get("Code", "ClientError"))
        error_message = str(error.get("Message", str(exc)))
        validation_error = f"{error_code}: {error_message}"
        if error_code not in INVALID_CREDENTIAL_ERROR_CODES:
            logger.warning("AWS STS returned %s: %s", error_code, error_message)
            return _unavailable_status(credential, validation_error, region)
        credential.is_valid = False
        db.commit()
        return _revoked_status(credential, validation_error, region)

    if not credential.is_valid:
        credential.is_valid = True
        db.commit()
    preview = masked_access_key(credential.aws_access_key_id)
    return {
        "connected": True,
        "status": "connected",
        "reason": None,
        "validation_error": None,
        "account_id": identity["account_id"],
        "arn": identity["arn"],
        "masked_access_key": preview,
        "region": region,
        "has_aws_credentials": True,
        "aws_access_key_id_preview": preview,
        "aws_default_region": region,
        "aws_role_arn": credential.aws_role_arn,
    }


def _unavailable_status(
    credential: UserAwsCredential,
    validation_error: str,
    region: str,
) -> dict[str, Any]:
    preview = masked_access_key(credential.aws_access_key_id)
    return {
        "connected": False,
        "status": "unavailable",
        "reason": validation_error,
        "validation_error": validation_error,
        "account_id": None,
        "arn": None,
        "masked_access_key": preview,
        "region": region,
        "has_aws_credentials": True,
        "aws_access_key_id_preview": preview,
        "aws_default_region": region,
        "aws_role_arn": credential.aws_role_arn,
    }


def _revoked_status(
    credential: UserAwsCredential,
    validation_error: str,
    region: str,
) -> dict[str, Any]:
    preview = masked_access_key(credential.aws_access_key_id)
    return {
        "connected": False,
        "status": "revoked",
        "reason": INVALID_CREDENTIAL_REASON,
        "validation_error": validation_error,
        "account_id": None,
        "arn": None,
        "masked_access_key": preview,
        "region": region,
        "has_aws_credentials": True,
        "aws_access_key_id_preview": preview,
        "aws_default_region": region,
        "aws_role_arn": credential.aws_role_arn,
    }
