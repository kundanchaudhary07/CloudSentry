import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config.settings import get_settings


class AWSConnectionError(RuntimeError):
    pass


def create_aws_session() -> boto3.Session:
    settings = get_settings()
    return boto3.Session(region_name=settings.aws_region)


def create_aws_session_with_credentials(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    role_arn: str | None = None,
) -> boto3.Session:
    session = boto3.Session(
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name=region,
    )
    if role_arn:
        sts = session.client("sts")
        assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName="CloudSentryScan")
        credentials = assumed["Credentials"]
        return boto3.Session(
            aws_access_key_id=credentials["AccessKeyId"],
            aws_secret_access_key=credentials["SecretAccessKey"],
            aws_session_token=credentials["SessionToken"],
            region_name=region,
        )
    return session


def validate_aws_connection() -> dict[str, str]:
    try:
        identity = create_aws_session().client("sts").get_caller_identity()
        return {"account": identity["Account"], "arn": identity["Arn"]}
    except (BotoCoreError, ClientError) as exc:
        raise AWSConnectionError("Unable to validate AWS credentials") from exc
