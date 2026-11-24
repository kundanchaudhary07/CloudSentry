import json
from pathlib import Path
from typing import Any

import pytest

from app.integrations.aws.models import InventoryResource, InventorySnapshot, ResourceType
from app.integrations.aws.s3_collector import collect_s3
from app.rules.engine import evaluate_inventory
from app.rules.scoring import calculate_risk_score
from app.rules.security_rules import evaluate_security_rules

REGION = "us-east-1"
PUBLIC_ACCESS_BLOCK = {
    "BlockPublicAcls": True,
    "IgnorePublicAcls": True,
    "BlockPublicPolicy": True,
    "RestrictPublicBuckets": True,
}


def _resource(
    resource_type: ResourceType,
    configuration: dict[str, Any] | None = None,
    tags: dict[str, str] | None = None,
    resource_id: str | None = None,
) -> InventoryResource:
    return InventoryResource(
        resource_id=resource_id or f"test-{resource_type.lower()}",
        resource_type=resource_type,
        region=REGION,
        state="available",
        tags=tags or {},
        configuration=configuration or {},
    )


def _security_group(
    *,
    protocol: str = "tcp",
    from_port: int = 22,
    to_port: int = 22,
    ipv4: list[str] | None = None,
    ipv6: list[str] | None = None,
) -> InventoryResource:
    return _resource(
        "SecurityGroup",
        {
            "ingress_rules": [
                {
                    "ip_protocol": protocol,
                    "from_port": from_port,
                    "to_port": to_port,
                    "ipv4_cidrs": ipv4 if ipv4 is not None else ["0.0.0.0/0"],
                    "ipv6_cidrs": ipv6 if ipv6 is not None else [],
                }
            ]
        },
    )


def _s3_bucket(configuration: dict[str, Any]) -> InventoryResource:
    return _resource(
        "S3",
        configuration,
        resource_id="example-bucket",
    )


def _rule_ids(resource: InventoryResource, required_tags: tuple[str, ...] = ("Environment", "Owner")) -> set[str]:
    return {
        finding.rule_id
        for finding in evaluate_security_rules([resource], required_tag_keys=required_tags)
    }


@pytest.mark.parametrize(
    ("resource", "expected_rules"),
    [
        (_security_group(), ("SG-001",)),
        (_security_group(from_port=20, to_port=25), ("SG-001",)),
        (_security_group(from_port=3380, to_port=3390), ("SG-002",)),
        (_security_group(ipv4=["10.2.0.0/16"]), ()),
        (_security_group(protocol="udp"), ()),
        (
            _security_group(protocol="-1", from_port=0, to_port=65535, ipv6=["::/0"]),
            ("SG-001", "SG-002"),
        ),
        (
            _security_group(protocol="6", from_port=3000, to_port=4000, ipv6=["::/0"]),
            ("SG-002",),
        ),
        (_security_group(protocol="tcp", from_port=80, to_port=80), ()),
    ],
)
def test_security_group_rules_check_protocol_range_and_source(
    resource: InventoryResource, expected_rules: tuple[str, ...]
) -> None:
    actual = _rule_ids(resource)
    assert actual == set(expected_rules)


def test_security_group_can_raise_both_ssh_and_rdp_findings() -> None:
    resource = _resource(
        "SecurityGroup",
        {
            "ingress_rules": [
                {
                    "ip_protocol": "tcp",
                    "from_port": 0,
                    "to_port": 65535,
                    "ipv4_cidrs": ["0.0.0.0/0"],
                    "ipv6_cidrs": [],
                }
            ]
        },
    )
    assert _rule_ids(resource) == {"SG-001", "SG-002"}


@pytest.mark.parametrize(
    ("configuration", "should_find"),
    [
        ({}, True),
        ({"encrypted": False}, True),
        ({"encrypted": None}, True),
        ({"encrypted": True}, False),
    ],
)
def test_ebs_encryption_rule_handles_missing_and_explicit_state(
    configuration: dict[str, Any], should_find: bool
) -> None:
    assert ("EBS-001" in _rule_ids(_resource("EBS", configuration))) is should_find


@pytest.mark.parametrize(
    ("configuration", "should_find"),
    [
        ({}, True),
        ({"public_access_block": {**PUBLIC_ACCESS_BLOCK, "BlockPublicAcls": False}}, True),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "acl_grants": [
                    {
                        "type": "Group",
                        "uri": "http://acs.amazonaws.com/groups/global/AllUsers",
                        "permission": "READ",
                    }
                ],
            },
            True,
        ),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "bucket_policy_statements": [
                    {
                        "Effect": "Allow",
                        "Principal": "*",
                        "Action": "s3:GetObject",
                        "Resource": "arn:aws:s3:::example-bucket/*",
                    }
                ],
            },
            True,
        ),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "bucket_policy_statements": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": "*"},
                        "Action": "s3:GetObject",
                        "Resource": "arn:aws:s3:::example-bucket/*",
                    }
                ],
            },
            True,
        ),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "acl_grants": [
                    {
                        "type": "Group",
                        "uri": "http://acs.amazonaws.com/groups/global/AuthenticatedUsers",
                        "permission": "READ",
                    }
                ],
            },
            True,
        ),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "bucket_policy_statements": [
                    {
                        "Effect": "Allow",
                        "Principal": "*",
                        "Action": "s3:GetObject",
                        "Resource": "arn:aws:s3:::example-bucket/*",
                        "Condition": {"StringEquals": {"aws:SourceVpc": "vpc-12345678"}},
                    }
                ],
            },
            False,
        ),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "bucket_policy_statements": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": "arn:aws:iam::123456789012:root"},
                        "Action": "s3:GetObject",
                        "Resource": "arn:aws:s3:::example-bucket/*",
                    }
                ],
            },
            False,
        ),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "bucket_policy_statements": [
                    {
                        "Effect": "Allow",
                        "Principal": "*",
                        "Action": "s3:GetObject",
                        "Resource": "arn:aws:s3:::another-bucket/*",
                    }
                ],
            },
            False,
        ),
        (
            {
                "public_access_block": PUBLIC_ACCESS_BLOCK,
                "bucket_policy_statements": [
                    {
                        "Effect": "Deny",
                        "Principal": "*",
                        "Action": "s3:GetObject",
                        "Resource": "arn:aws:s3:::example-bucket/*",
                    }
                ],
            },
            False,
        ),
    ],
)
def test_s3_rule_checks_block_flags_acl_and_policy_context(
    configuration: dict[str, Any], should_find: bool
) -> None:
    assert ("S3-001" in _rule_ids(_s3_bucket(configuration))) is should_find


def test_s3_policy_with_public_principal_and_global_source_ip_is_public() -> None:
    resource = _s3_bucket(
        {
            "public_access_block": PUBLIC_ACCESS_BLOCK,
            "bucket_policy_statements": [
                {
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": "arn:aws:s3:::example-bucket/*",
                    "Condition": {"IpAddress": {"aws:SourceIp": "0.0.0.0/0"}},
                }
            ],
        }
    )
    assert _rule_ids(resource) == {"S3-001"}


def test_s3_metadata_access_denied_is_not_misreported_as_unsafe() -> None:
    class RestrictedS3Client:
        def list_buckets(self) -> dict[str, Any]:
            return {"Buckets": [{"Name": "restricted-bucket"}]}

        def __getattr__(self, operation: str):
            def denied(**kwargs: Any) -> None:
                from botocore.exceptions import ClientError

                raise ClientError(
                    {"Error": {"Code": "AccessDenied", "Message": "denied"}},
                    operation,
                )

            return denied

    class RestrictedS3Session:
        def client(self, service: str) -> RestrictedS3Client:
            assert service == "s3"
            return RestrictedS3Client()

    result = collect_s3(RestrictedS3Session())
    configuration = result.resources[0].configuration

    assert configuration["public_access_block_status"] == "unavailable"
    assert configuration["acl_status"] == "unavailable"
    assert configuration["bucket_policy_status"] == "unavailable"
    assert "S3-001" not in _rule_ids(result.resources[0])


def test_ec2_governance_tags_use_default_and_custom_required_keys() -> None:
    instance = _resource("EC2", tags={"Environment": "prod"})
    assert _rule_ids(instance) == {"EC2-001"}
    assert _rule_ids(instance, required_tags=("Environment",)) == set()
    assert _rule_ids(
        _resource("EC2", tags={"Environment": "", "Owner": "team-a"})
    ) == {"EC2-001"}
    assert _rule_ids(
        _resource("EC2", tags={"Environment": "prod", "Owner": "team-a"})
    ) == set()


def test_risk_score_counts_severity_and_normalizes_by_evaluated_resources() -> None:
    resources = [
        _security_group(ipv4=["0.0.0.0/0"]),
        _resource("EBS", {"encrypted": False}),
        _resource("IAMUser"),
    ]
    report = evaluate_inventory(InventorySnapshot(resources=resources))

    assert report.posture_score == 81
    assert report.evaluated_resource_count == 2
    assert report.severity_counts.model_dump() == {
        "critical": 0,
        "high": 1,
        "medium": 1,
        "low": 0,
    }
    assert [finding.rule_id for finding in report.findings] == ["SG-001", "EBS-001"]
    assert all(finding.status == "OPEN" and finding.category == "SECURITY" for finding in report.findings)


def test_risk_score_is_100_for_no_findings_or_no_applicable_resources() -> None:
    compliant = [_resource("EBS", {"encrypted": True}), _resource("IAMRole")]
    assert calculate_risk_score(compliant, []).posture_score == 100
    assert calculate_risk_score([_resource("IAMRole")], []).evaluated_resource_count == 0


def test_scan_report_cli_includes_inventory_findings_and_score(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.integrations.aws import cli

    snapshot = InventorySnapshot(
        resources=[
            _security_group(ipv4=["0.0.0.0/0"]),
            _resource("EBS", {"encrypted": False}),
        ]
    )
    monkeypatch.setattr(cli, "create_aws_session", lambda: object())
    monkeypatch.setattr(
        cli,
        "run_inventory",
        lambda session=None, regions=None: snapshot,
    )
    output = tmp_path / "report.json"

    assert cli.main(
        [
            "--output",
            str(output),
            "--scan-report",
            "--required-tags",
            "Environment,Owner",
        ]
    ) == 0

    report = json.loads(output.read_text(encoding="utf-8"))
    assert len(report["inventory"]["resources"]) == 2
    assert [finding["rule_id"] for finding in report["findings"]] == ["SG-001", "EBS-001"]
    assert report["posture_score"] == 81
    assert report["severity_counts"]["high"] == 1
    assert report["cost_report"]["total_waste_findings"] >= 1
    assert report["cost_report"]["cost_explorer"]["cost_explorer_available"] is False
