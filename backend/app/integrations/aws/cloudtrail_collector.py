import boto3

from app.integrations.aws.collector_utils import safe_call
from app.integrations.aws.models import CollectionResult, InventoryResource


def collect_cloudtrail(session: boto3.Session, region: str) -> CollectionResult:
    client = session.client("cloudtrail", region_name=region)
    result = CollectionResult()
    response = safe_call(
        lambda: client.describe_trails(includeShadowTrails=False),
        result.errors,
        "cloudtrail",
        "DescribeTrails",
    )
    if response is None:
        return result

    for trail in response.get("trailList", []):
        trail_arn = trail.get("TrailARN") or trail["Name"]
        status = safe_call(
            lambda trail=trail: client.get_trail_status(
                Name=trail.get("Name") or trail_arn
            ),
            result.errors,
            "cloudtrail",
            "GetTrailStatus",
        )
        result.resources.append(
            InventoryResource(
                resource_id=trail_arn,
                resource_type="CloudTrail",
                region=trail.get("HomeRegion") or region,
                name=trail.get("Name"),
                state=(
                    "unknown"
                    if status is None
                    else "logging"
                    if status.get("IsLogging")
                    else "stopped"
                ),
                configuration={
                    "is_multi_region": trail.get("IsMultiRegionTrail"),
                    "includes_global_service_events": trail.get("IncludeGlobalServiceEvents"),
                    "log_file_validation_enabled": trail.get("LogFileValidationEnabled"),
                    "s3_bucket_name": trail.get("S3BucketName"),
                },
            )
        )
    return result
