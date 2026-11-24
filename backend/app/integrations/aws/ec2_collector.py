from typing import Any

import boto3

from app.integrations.aws.collector_utils import safe_pages
from app.integrations.aws.models import CollectionResult, InventoryResource


def _tags(items: list[dict[str, Any]] | None) -> dict[str, str]:
    return {item["Key"]: item.get("Value", "") for item in (items or []) if "Key" in item}


def _ingress_rules(permissions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "ip_protocol": permission.get("IpProtocol"),
            "from_port": permission.get("FromPort"),
            "to_port": permission.get("ToPort"),
            "ipv4_cidrs": [
                item["CidrIp"]
                for item in permission.get("IpRanges", [])
                if item.get("CidrIp")
            ],
            "ipv6_cidrs": [
                item["CidrIpv6"]
                for item in permission.get("Ipv6Ranges", [])
                if item.get("CidrIpv6")
            ],
        }
        for permission in permissions
    ]


def collect_ec2(session: boto3.Session, region: str) -> CollectionResult:
    client = session.client("ec2", region_name=region)
    result = CollectionResult()

    for page in safe_pages(client, "describe_instances", result.errors, "ec2"):
        for reservation in page.get("Reservations", []):
            for item in reservation.get("Instances", []):
                result.resources.append(
                    InventoryResource(
                        resource_id=item["InstanceId"],
                        resource_type="EC2",
                        region=region,
                        name=_tags(item.get("Tags")).get("Name"),
                        state=item.get("State", {}).get("Name", "unknown"),
                        tags=_tags(item.get("Tags")),
                        configuration={
                            "instance_type": item.get("InstanceType"),
                            "vpc_id": item.get("VpcId"),
                            "subnet_id": item.get("SubnetId"),
                            "availability_zone": item.get("Placement", {}).get("AvailabilityZone"),
                            "private_ip": item.get("PrivateIpAddress"),
                            "public_ip": item.get("PublicIpAddress"),
                        },
                    )
                )

    for page in safe_pages(client, "describe_security_groups", result.errors, "ec2"):
        for item in page.get("SecurityGroups", []):
            result.resources.append(
                InventoryResource(
                    resource_id=item["GroupId"],
                    resource_type="SecurityGroup",
                    region=region,
                    name=item.get("GroupName"),
                    state="available",
                    tags=_tags(item.get("Tags")),
                    configuration={
                        "description": item.get("Description"),
                        "vpc_id": item.get("VpcId"),
                        "ingress_rule_count": len(item.get("IpPermissions", [])),
                        "egress_rule_count": len(item.get("IpPermissionsEgress", [])),
                        "ingress_rules": _ingress_rules(item.get("IpPermissions", [])),
                    },
                )
            )

    for page in safe_pages(client, "describe_volumes", result.errors, "ec2"):
        for item in page.get("Volumes", []):
            result.resources.append(
                InventoryResource(
                    resource_id=item["VolumeId"],
                    resource_type="EBS",
                    region=region,
                    name=_tags(item.get("Tags")).get("Name"),
                    state=item.get("State", "unknown"),
                    tags=_tags(item.get("Tags")),
                    configuration={
                        "size_gib": item.get("Size"),
                        "volume_type": item.get("VolumeType"),
                        "encrypted": item.get("Encrypted"),
                        "availability_zone": item.get("AvailabilityZone"),
                        "snapshot_id": item.get("SnapshotId"),
                        "attached_instance_ids": [
                            attachment.get("InstanceId")
                            for attachment in item.get("Attachments", [])
                        ],
                    },
                )
            )
    return result
