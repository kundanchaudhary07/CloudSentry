import json
from pathlib import Path
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError
from moto import mock_aws

from app.integrations.aws.cloudtrail_collector import collect_cloudtrail
from app.integrations.aws.ec2_collector import collect_ec2
from app.integrations.aws.iam_collector import collect_iam
from app.integrations.aws.inventory_engine import run_inventory
from app.integrations.aws.models import InventoryResource
from app.integrations.aws.rds_collector import collect_rds
from app.integrations.aws.s3_collector import collect_s3

REGION = "us-east-1"
TRUST_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"Service": "ec2.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }
    ],
}
READ_ONLY_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"AWS": "arn:aws:iam::123456789012:root"},
            "Action": "s3:ListAllMyBuckets",
            "Resource": "*",
        }
    ],
}


@pytest.fixture
def inventory_session(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    with mock_aws():
        session = boto3.Session(region_name=REGION)
        _seed_aws_resources(session)
        yield session


def _seed_aws_resources(session: boto3.Session) -> None:
    ec2 = session.client("ec2", region_name=REGION)
    vpc_id = ec2.create_vpc(CidrBlock="10.0.0.0/16")["Vpc"]["VpcId"]
    security_group_id = ec2.create_security_group(
        GroupName="web",
        Description="Inventory fixture",
        VpcId=vpc_id,
    )["GroupId"]
    ec2.authorize_security_group_ingress(
        GroupId=security_group_id,
        IpPermissions=[
            {
                "IpProtocol": "tcp",
                "FromPort": 22,
                "ToPort": 22,
                "IpRanges": [{"CidrIp": "192.0.2.0/24"}],
            },
            {
                "IpProtocol": "tcp",
                "FromPort": 3389,
                "ToPort": 3389,
                "Ipv6Ranges": [{"CidrIpv6": "2001:db8::/32"}],
            },
        ],
    )
    instance_id = ec2.run_instances(
        ImageId="ami-12345678",
        InstanceType="t3.micro",
        MinCount=1,
        MaxCount=1,
        TagSpecifications=[
            {
                "ResourceType": "instance",
                "Tags": [{"Key": "Name", "Value": "inventory-test"}],
            }
        ],
    )["Instances"][0]["InstanceId"]
    assert instance_id
    ec2.create_volume(AvailabilityZone=f"{REGION}a", Size=8, VolumeType="gp3")

    s3 = session.client("s3", region_name=REGION)
    s3.create_bucket(Bucket="cloudsentry-inventory-test")
    s3.put_public_access_block(
        Bucket="cloudsentry-inventory-test",
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    s3.put_bucket_tagging(
        Bucket="cloudsentry-inventory-test",
        Tagging={
            "TagSet": [
                {"Key": "CostCenter", "Value": "1234"},
                {"Key": "Project", "Value": "inventory-test"},
            ]
        },
    )
    s3.put_bucket_policy(
        Bucket="cloudsentry-inventory-test",
        Policy=json.dumps(READ_ONLY_POLICY),
    )

    iam = session.client("iam", region_name=REGION)
    iam.create_user(UserName="inventory-user")
    policy_arn = iam.create_policy(
        PolicyName="InventoryTestPolicy",
        PolicyDocument=json.dumps(READ_ONLY_POLICY),
    )["Policy"]["Arn"]
    iam.attach_user_policy(UserName="inventory-user", PolicyArn=policy_arn)
    iam.create_role(
        RoleName="inventory-role",
        AssumeRolePolicyDocument=json.dumps(TRUST_POLICY),
    )
    iam.attach_role_policy(RoleName="inventory-role", PolicyArn=policy_arn)

    rds = session.client("rds", region_name=REGION)
    rds.create_db_instance(
        DBInstanceIdentifier="inventory-db",
        AllocatedStorage=20,
        DBInstanceClass="db.t3.micro",
        Engine="mysql",
        MasterUsername="inventory",
        MasterUserPassword="not-a-real-password",
        Tags=[
            {"Key": "CostCenter", "Value": "1234"},
            {"Key": "Project", "Value": "inventory-test"},
        ],
    )

    cloudtrail = session.client("cloudtrail", region_name=REGION)
    cloudtrail.create_trail(
        Name="inventory-trail",
        S3BucketName="cloudsentry-inventory-test",
        IsMultiRegionTrail=True,
    )
    cloudtrail.start_logging(Name="inventory-trail")


def test_collectors_return_normalized_inventory(inventory_session: boto3.Session) -> None:
    results = [
        collect_ec2(inventory_session, REGION),
        collect_s3(inventory_session),
        collect_iam(inventory_session),
        collect_rds(inventory_session, REGION),
        collect_cloudtrail(inventory_session, REGION),
    ]
    resources = [resource for result in results for resource in result.resources]

    assert {resource.resource_type for resource in resources} == {
        "EC2",
        "SecurityGroup",
        "EBS",
        "S3",
        "IAMUser",
        "IAMRole",
        "RDS",
        "CloudTrail",
    }
    assert all(not result.errors for result in results)
    for resource in resources:
        assert isinstance(resource, InventoryResource)
        assert set(resource.model_dump()) == {
            "resource_id",
            "resource_type",
            "region",
            "name",
            "state",
            "tags",
            "configuration",
        }
        assert resource.resource_id
        assert resource.state
        assert isinstance(resource.tags, dict)
        assert isinstance(resource.configuration, dict)
    bucket = next(item for item in resources if item.resource_type == "S3")
    assert bucket.configuration["policy_attached"]
    assert bucket.configuration["public_access_block"]["BlockPublicAcls"] is True
    assert bucket.configuration["public_access_block_status"] == "available"
    assert bucket.configuration["acl_grants"][0]["uri"] is None
    assert bucket.configuration["bucket_policy_statements"][0]["Effect"] == "Allow"
    assert bucket.configuration["bucket_policy_status"] == "available"
    assert bucket.tags == {"CostCenter": "1234", "Project": "inventory-test"}
    assert bucket.configuration["tags_status"] == "available"
    security_group = next(
        item
        for item in resources
        if item.resource_type == "SecurityGroup" and item.name == "web"
    )
    assert security_group.configuration["ingress_rules"] == [
        {
            "ip_protocol": "tcp",
            "from_port": 22,
            "to_port": 22,
            "ipv4_cidrs": ["192.0.2.0/24"],
            "ipv6_cidrs": [],
        },
        {
            "ip_protocol": "tcp",
            "from_port": 3389,
            "to_port": 3389,
            "ipv4_cidrs": [],
            "ipv6_cidrs": ["2001:db8::/32"],
        },
    ]
    assert next(item for item in resources if item.resource_type == "CloudTrail").state == "logging"
    user = next(item for item in resources if item.resource_type == "IAMUser")
    assert user.configuration["attached_policies"][0]["name"] == "InventoryTestPolicy"
    rds = next(item for item in resources if item.resource_type == "RDS")
    assert rds.tags == {"CostCenter": "1234", "Project": "inventory-test"}
    assert rds.configuration["tags_status"] == "available"


def test_cli_writes_engine_snapshot(
    inventory_session: boto3.Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.integrations.aws import cli

    monkeypatch.setattr(
        cli,
        "run_inventory",
        lambda regions=None: run_inventory(session=inventory_session, regions=regions),
    )
    output = tmp_path / "inventory.json"
    assert cli.main(["--output", str(output), "--regions", REGION]) == 0

    snapshot = json.loads(output.read_text(encoding="utf-8"))
    assert {resource["resource_type"] for resource in snapshot["resources"]} == {
        "EC2",
        "SecurityGroup",
        "EBS",
        "S3",
        "IAMUser",
        "IAMRole",
        "RDS",
        "CloudTrail",
    }
    assert snapshot["errors"] == []


def test_engine_continues_when_one_service_is_denied(
    inventory_session: boto3.Session,
) -> None:
    class Ec2RestrictedSession:
        def client(self, service: str, **kwargs: Any):
            if service == "ec2":
                return _DeniedClient()
            return inventory_session.client(service, **kwargs)

    snapshot = run_inventory(session=Ec2RestrictedSession(), regions=[REGION])

    assert any(error.service == "ec2" for error in snapshot.errors)
    assert any(resource.resource_type == "S3" for resource in snapshot.resources)
    assert any(resource.resource_type == "RDS" for resource in snapshot.resources)


class _DeniedPaginator:
    def __init__(self, operation: str) -> None:
        self.operation = operation

    def paginate(self, **_kwargs: Any) -> Any:
        raise _access_denied(self.operation)


class _DeniedClient:
    def get_paginator(self, operation: str) -> _DeniedPaginator:
        return _DeniedPaginator(operation)

    def __getattr__(self, operation: str):
        def denied(**_kwargs: Any):
            raise _access_denied(operation)

        return denied


class _DeniedSession:
    def client(self, _service: str, **_kwargs: Any) -> _DeniedClient:
        return _DeniedClient()


def _access_denied(operation: str) -> ClientError:
    return ClientError(
        {
            "Error": {
                "Code": "AccessDenied",
                "Message": "sensitive-access-denied-test-message",
            }
        },
        operation,
    )


@pytest.mark.parametrize(
    ("collector", "args"),
    [
        (collect_ec2, (REGION,)),
        (collect_s3, ()),
        (collect_iam, ()),
        (collect_rds, (REGION,)),
        (collect_cloudtrail, (REGION,)),
    ],
)
def test_collectors_report_access_denied_and_continue(
    collector: Any,
    args: tuple[str, ...],
    caplog: pytest.LogCaptureFixture,
) -> None:
    result = collector(_DeniedSession(), *args)

    assert result.resources == []
    assert result.errors
    assert all(error.code == "AccessDenied" for error in result.errors)
    assert "sensitive-access-denied-test-message" not in caplog.text
