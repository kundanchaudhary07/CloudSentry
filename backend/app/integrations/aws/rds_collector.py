from typing import Any

import boto3

from app.integrations.aws.collector_utils import safe_call, safe_pages
from app.integrations.aws.models import CollectionResult, InventoryResource


def _tags(items: list[dict[str, Any]] | None) -> dict[str, str]:
    return {item["Key"]: item.get("Value", "") for item in (items or []) if "Key" in item}


def collect_rds(session: boto3.Session, region: str) -> CollectionResult:
    client = session.client("rds", region_name=region)
    result = CollectionResult()
    for page in safe_pages(client, "describe_db_instances", result.errors, "rds"):
        for item in page.get("DBInstances", []):
            arn = item["DBInstanceArn"]
            if item.get("TagList") is not None:
                tags = _tags(item["TagList"])
                tags_status = "available"
            else:
                previous_error_count = len(result.errors)
                tags_response = safe_call(
                    lambda arn=arn: client.list_tags_for_resource(ResourceName=arn),
                    result.errors,
                    "rds",
                    "ListTagsForResource",
                )
                tags = _tags((tags_response or {}).get("TagList"))
                tags_status = (
                    "available"
                    if tags_response is not None
                    else "unavailable"
                    if len(result.errors) > previous_error_count
                    else "not_configured"
                )
            result.resources.append(
                InventoryResource(
                    resource_id=item["DBInstanceIdentifier"],
                    resource_type="RDS",
                    region=region,
                    name=item.get("DBName") or item["DBInstanceIdentifier"],
                    state=item.get("DBInstanceStatus", "unknown"),
                    tags=tags,
                    configuration={
                        "arn": arn,
                        "engine": item.get("Engine"),
                        "engine_version": item.get("EngineVersion"),
                        "instance_class": item.get("DBInstanceClass"),
                        "allocated_storage_gib": item.get("AllocatedStorage"),
                        "multi_az": item.get("MultiAZ"),
                        "publicly_accessible": item.get("PubliclyAccessible"),
                        "storage_encrypted": item.get("StorageEncrypted"),
                        "tags_status": tags_status,
                    },
                )
            )
    return result
