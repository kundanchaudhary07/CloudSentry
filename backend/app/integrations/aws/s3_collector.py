import json
from collections.abc import Callable
from typing import Any

import boto3

from app.integrations.aws.collector_utils import safe_call
from app.integrations.aws.models import CollectionResult, InventoryResource


def _metadata_call(
    call: Callable[[], Any],
    result: CollectionResult,
    operation: str,
    ignored_codes: set[str] | None = None,
) -> tuple[Any | None, str]:
    previous_error_count = len(result.errors)
    response = safe_call(
        call,
        result.errors,
        "s3",
        operation,
        ignored_codes=ignored_codes,
    )
    if response is not None:
        return response, "available"
    if len(result.errors) > previous_error_count:
        return None, "unavailable"
    return None, "not_configured"


def _policy_statements(policy: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not policy:
        return []
    document = policy.get("Policy")
    if isinstance(document, str):
        try:
            document = json.loads(document)
        except json.JSONDecodeError:
            return []
    if not isinstance(document, dict):
        return []
    statements = document.get("Statement", [])
    if isinstance(statements, dict):
        statements = [statements]
    if not isinstance(statements, list):
        return []
    relevant_fields = (
        "Effect",
        "Principal",
        "NotPrincipal",
        "Action",
        "Resource",
        "Condition",
    )
    return [
        {key: statement[key] for key in relevant_fields if key in statement}
        for statement in statements
        if isinstance(statement, dict)
    ]


def collect_s3(session: boto3.Session) -> CollectionResult:
    client = session.client("s3")
    result = CollectionResult()
    response = safe_call(client.list_buckets, result.errors, "s3", "ListAllMyBuckets")
    if response is None:
        return result

    for bucket in response.get("Buckets", []):
        name = bucket["Name"]
        public_access, public_access_status = _metadata_call(
            lambda: client.get_public_access_block(Bucket=name),
            result,
            "GetBucketPublicAccessBlock",
            ignored_codes={"NoSuchPublicAccessBlockConfiguration"},
        )
        acl, acl_status = _metadata_call(
            lambda: client.get_bucket_acl(Bucket=name),
            result,
            "GetBucketAcl",
        )
        policy, policy_status = _metadata_call(
            lambda: client.get_bucket_policy(Bucket=name),
            result,
            "GetBucketPolicy",
            ignored_codes={"NoSuchBucketPolicy"},
        )
        tag_response, tags_status = _metadata_call(
            lambda: client.get_bucket_tagging(Bucket=name),
            result,
            "GetBucketTagging",
            ignored_codes={"NoSuchTagSet"},
        )
        location = safe_call(
            lambda: client.get_bucket_location(Bucket=name),
            result.errors,
            "s3",
            "GetBucketLocation",
        )

        block_configuration: dict[str, bool] | None = None
        if public_access:
            block_configuration = public_access.get("PublicAccessBlockConfiguration")
        acl_grants = acl.get("Grants", []) if acl else []
        bucket_tags = {
            item["Key"]: item.get("Value", "")
            for item in (tag_response or {}).get("TagSet", [])
            if "Key" in item
        }
        normalized_acl_grants = [
            {
                "type": grant.get("Grantee", {}).get("Type"),
                "uri": grant.get("Grantee", {}).get("URI"),
                "permission": grant.get("Permission"),
            }
            for grant in acl_grants
        ]
        bucket_region = (
            (location or {}).get("LocationConstraint") or "us-east-1"
            if location is not None
            else None
        )
        result.resources.append(
            InventoryResource(
                resource_id=name,
                resource_type="S3",
                region=bucket_region or "unknown",
                name=name,
                state="available",
                tags=bucket_tags,
                configuration={
                    "bucket_region": bucket_region,
                    "public_access_block": block_configuration,
                    "public_access_block_status": public_access_status,
                    "acl_grant_count": len(acl_grants),
                    "acl_grants": normalized_acl_grants,
                    "acl_status": acl_status,
                    "policy_attached": bool(policy and policy.get("Policy")),
                    "bucket_policy_statements": _policy_statements(policy),
                    "bucket_policy_status": policy_status,
                    "tags_status": tags_status,
                },
            )
        )
    return result
