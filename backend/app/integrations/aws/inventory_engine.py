import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config.settings import get_settings
from app.integrations.aws.cloudtrail_collector import collect_cloudtrail
from app.integrations.aws.collector_utils import record_error
from app.integrations.aws.ec2_collector import collect_ec2
from app.integrations.aws.iam_collector import collect_iam
from app.integrations.aws.models import CollectionError, CollectionResult, InventorySnapshot
from app.integrations.aws.rds_collector import collect_rds
from app.integrations.aws.s3_collector import collect_s3
from app.integrations.aws.session import create_aws_session


def _configured_regions() -> list[str]:
    settings = get_settings()
    configured = [value.strip() for value in settings.aws_regions.split(",") if value.strip()]
    return configured or [settings.aws_region]


def _resolve_regions(
    session: boto3.Session, configured: list[str] | None
) -> tuple[list[str], list[CollectionError]]:
    if configured:
        return list(dict.fromkeys(configured)), []
    if get_settings().aws_regions.strip():
        return _configured_regions(), []

    result = CollectionResult()
    client = session.client("ec2")
    try:
        response = client.describe_regions(AllRegions=False)
        regions = [item["RegionName"] for item in response.get("Regions", [])]
        if regions:
            return regions, []
        return _configured_regions(), []
    except (ClientError, BotoCoreError) as exc:
        record_error(result.errors, "ec2", "DescribeRegions", exc)
        return _configured_regions(), result.errors


def _append(target: InventorySnapshot, result: CollectionResult) -> None:
    target.resources.extend(result.resources)
    target.errors.extend(result.errors)


def run_inventory(
    session: boto3.Session | None = None,
    regions: list[str] | None = None,
) -> InventorySnapshot:
    aws_session = session or create_aws_session()
    resolved_regions, errors = _resolve_regions(aws_session, regions)
    snapshot = InventorySnapshot(resources=[], errors=errors)

    _append(snapshot, collect_s3(aws_session))
    _append(snapshot, collect_iam(aws_session))
    for region in resolved_regions:
        _append(snapshot, collect_ec2(aws_session, region))
        _append(snapshot, collect_rds(aws_session, region))
        _append(snapshot, collect_cloudtrail(aws_session, region))
    return snapshot
