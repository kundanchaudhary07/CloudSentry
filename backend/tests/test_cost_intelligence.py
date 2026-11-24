import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.stub import Stubber
from moto import mock_aws

from app.integrations.aws.cloudwatch_collector import collect_ec2_cpu_metrics
from app.integrations.aws.cost_explorer_collector import collect_cost_explorer
from app.integrations.aws.models import (
    EC2CpuMetric,
    InventoryResource,
    InventorySnapshot,
    MetricCollectionResult,
    ResourceType,
)
from app.rules.cost_engine import evaluate_cost_intelligence
from app.rules.cost_rules import evaluate_cost_rules
from app.rules.models import CostExplorerSummary

REGION = "us-east-1"
NOW = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)
TRUSTED_BUCKET_CONFIG = {
    "public_access_block": {
        "BlockPublicAcls": True,
        "IgnorePublicAcls": True,
        "BlockPublicPolicy": True,
        "RestrictPublicBuckets": True,
    }
}


def _resource(
    resource_type: ResourceType,
    resource_id: str,
    *,
    state: str = "available",
    configuration: dict[str, Any] | None = None,
    tags: dict[str, str] | None = None,
) -> InventoryResource:
    return InventoryResource(
        resource_id=resource_id,
        resource_type=resource_type,
        region=REGION,
        state=state,
        configuration=configuration or {},
        tags=tags or {},
    )


def _cpu_metric(
    instance_id: str,
    average: float | None,
    *,
    maximum: float | None = None,
    days: int = 7,
) -> EC2CpuMetric:
    return EC2CpuMetric(
        resource_id=instance_id,
        region=REGION,
        lookback_days=days,
        start_time=NOW - timedelta(days=days),
        end_time=NOW,
        average_cpu_percent=average,
        maximum_cpu_percent=maximum,
        datapoint_count=0 if average is None else 2,
    )


def test_cost_001_flags_unattached_volume_and_includes_context() -> None:
    snapshot = InventorySnapshot(
        resources=[
            _resource(
                "EBS",
                "vol-unattached",
                configuration={"size_gib": 40, "volume_type": "gp3"},
            ),
            _resource(
                "EBS",
                "vol-attached",
                configuration={
                    "size_gib": 20,
                    "volume_type": "gp2",
                    "attached_instance_ids": ["i-in-use"],
                },
            ),
            _resource(
                "EBS",
                "vol-in-use",
                state="in-use",
                configuration={"size_gib": 10, "volume_type": "gp3"},
            ),
        ]
    )

    findings = evaluate_cost_rules(snapshot, [])

    assert [finding.rule_id for finding in findings] == ["COST-001", "COST-003", "COST-003", "COST-003"]
    unattached = findings[0]
    assert unattached.resource_id == "vol-unattached"
    assert unattached.category == "COST"
    assert unattached.details == {
        "size_gb": 40,
        "size_unit": "GiB",
        "volume_type": "gp3",
    }
    assert "40 GiB" in unattached.description
    assert "$" not in unattached.description


def test_cost_002_uses_running_instances_and_only_observed_cpu_metrics() -> None:
    snapshot = InventorySnapshot(
        resources=[
            _resource("EC2", "i-idle", state="running"),
            _resource("EC2", "i-active", state="running"),
            _resource("EC2", "i-stopped", state="stopped"),
            _resource("EC2", "i-no-data", state="running"),
        ]
    )
    metrics = [
        _cpu_metric("i-idle", 2.5, maximum=8.0),
        _cpu_metric("i-active", 12.0, maximum=70.0),
        _cpu_metric("i-stopped", 0.1),
        _cpu_metric("i-no-data", None),
    ]

    findings = evaluate_cost_rules(snapshot, metrics)
    idle_findings = [finding for finding in findings if finding.rule_id == "COST-002"]

    assert len(idle_findings) == 1
    assert idle_findings[0].resource_id == "i-idle"
    assert idle_findings[0].details["average_cpu_percent"] == 2.5
    assert "network, memory, or batch workloads" in idle_findings[0].description
    assert "engineering review is required" in idle_findings[0].description


def test_cost_002_respects_threshold_and_observation_window() -> None:
    resource = _resource("EC2", "i-boundary", state="running")
    snapshot = InventorySnapshot(resources=[resource])

    assert not [
        finding
        for finding in evaluate_cost_rules(snapshot, [_cpu_metric("i-boundary", 5.0)])
        if finding.rule_id == "COST-002"
    ]
    assert not [
        finding
        for finding in evaluate_cost_rules(
            snapshot,
            [_cpu_metric("i-boundary", 1.0, days=14)],
            lookback_days=7,
        )
        if finding.rule_id == "COST-002"
    ]


@pytest.mark.parametrize("resource_type", ["EC2", "EBS", "RDS", "S3"])
def test_cost_003_finds_missing_and_blank_tags_on_billable_resources(
    resource_type: ResourceType,
) -> None:
    missing = _resource(resource_type, f"missing-{resource_type}")
    blank = _resource(
        resource_type,
        f"blank-{resource_type}",
        tags={"CostCenter": " ", "Project": "analytics"},
    )
    compliant = _resource(
        resource_type,
        f"compliant-{resource_type}",
        tags={"CostCenter": "42", "Project": "analytics"},
    )
    snapshot = InventorySnapshot(resources=[missing, blank, compliant])

    findings = [
        finding
        for finding in evaluate_cost_rules(snapshot, [])
        if finding.rule_id == "COST-003"
    ]

    assert {finding.resource_id for finding in findings} == {
        missing.resource_id,
        blank.resource_id,
    }
    assert all(finding.category == "COST" for finding in findings)


def test_cost_003_supports_custom_keys_and_skips_unavailable_tag_reads() -> None:
    snapshot = InventorySnapshot(
        resources=[
            _resource(
                "S3",
                "s3-tag-access-denied",
                configuration={"tags_status": "unavailable"},
            ),
            _resource(
                "RDS",
                "db-custom-tags",
                tags={"Environment": "prod"},
            ),
        ]
    )

    findings = evaluate_cost_rules(snapshot, [], required_tag_keys=("Team",))

    assert len(findings) == 1
    assert findings[0].resource_id == "db-custom-tags"
    assert findings[0].details["missing_tags"] == ["Team"]


@mock_aws
def test_cloudwatch_collector_aggregates_cpu_and_leaves_missing_datapoints_unknown() -> None:
    session = boto3.Session(
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
        region_name=REGION,
    )
    cloudwatch = session.client("cloudwatch", region_name=REGION)
    cloudwatch.put_metric_data(
        Namespace="AWS/EC2",
        MetricData=[
            {
                "MetricName": "CPUUtilization",
                "Dimensions": [{"Name": "InstanceId", "Value": "i-with-metrics"}],
                "Timestamp": NOW - timedelta(hours=3),
                "Value": 2.0,
                "Unit": "Percent",
            },
            {
                "MetricName": "CPUUtilization",
                "Dimensions": [{"Name": "InstanceId", "Value": "i-with-metrics"}],
                "Timestamp": NOW - timedelta(hours=2),
                "Value": 6.0,
                "Unit": "Percent",
            },
        ],
    )
    snapshot = InventorySnapshot(
        resources=[
            _resource("EC2", "i-with-metrics", state="running"),
            _resource("EC2", "i-no-datapoints", state="running"),
            _resource("EC2", "i-stopped", state="stopped"),
        ]
    )

    result = collect_ec2_cpu_metrics(session, snapshot, end_time=NOW)

    assert len(result.metrics) == 2
    with_data = next(item for item in result.metrics if item.resource_id == "i-with-metrics")
    without_data = next(item for item in result.metrics if item.resource_id == "i-no-datapoints")
    assert with_data.average_cpu_percent == pytest.approx(4.0)
    assert with_data.maximum_cpu_percent == pytest.approx(6.0)
    assert with_data.datapoint_count == 2
    assert without_data.average_cpu_percent is None
    assert without_data.maximum_cpu_percent is None
    assert without_data.datapoint_count == 0
    assert not result.errors


def test_cloudwatch_access_denied_is_sanitized_and_non_fatal() -> None:
    class DeniedCloudWatchClient:
        def get_metric_statistics(self, **kwargs: Any) -> None:
            raise ClientError(
                {
                    "Error": {
                        "Code": "AccessDenied",
                        "Message": "sensitive-cloudwatch-response",
                    }
                },
                "GetMetricStatistics",
            )

    class DeniedSession:
        def client(self, service: str, **kwargs: Any) -> DeniedCloudWatchClient:
            assert service == "cloudwatch"
            return DeniedCloudWatchClient()

    result = collect_ec2_cpu_metrics(
        DeniedSession(),
        InventorySnapshot(resources=[_resource("EC2", "i-denied", state="running")]),
        end_time=NOW,
    )

    assert result.metrics[0].average_cpu_percent is None
    assert result.errors[0].code == "AccessDenied"
    assert "sensitive-cloudwatch-response" not in result.errors[0].message


def _cost_explorer_response(
    start: str,
    end: str,
    total: str,
    groups: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "TimePeriod": {"Start": start, "End": end},
        "Total": {"UnblendedCost": {"Amount": total, "Unit": "USD"}},
        "Estimated": True,
    }
    if groups is not None:
        result["Groups"] = groups
    return {"ResultsByTime": [result]}


class _CostExplorerSession:
    def __init__(self, client: Any) -> None:
        self._client = client

    def client(self, service: str, **kwargs: Any) -> Any:
        assert service == "ce"
        return self._client


def test_cost_explorer_parses_month_to_date_service_spend_and_trend() -> None:
    session = boto3.Session(
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
        region_name=REGION,
    )
    client = session.client("ce", region_name=REGION)
    current_params = {
        "TimePeriod": {"Start": "2026-11-01", "End": "2026-11-24"},
        "Granularity": "MONTHLY",
        "Metrics": ["UnblendedCost"],
        "GroupBy": [{"Type": "DIMENSION", "Key": "SERVICE"}],
    }
    prior_params = {
        "TimePeriod": {"Start": "2026-10-01", "End": "2026-10-24"},
        "Granularity": "MONTHLY",
        "Metrics": ["UnblendedCost"],
    }
    current = _cost_explorer_response(
        "2026-11-01",
        "2026-11-24",
        "123.45",
        [
            {
                "Keys": ["Amazon EC2"],
                "Metrics": {"UnblendedCost": {"Amount": "100.00", "Unit": "USD"}},
            },
            {
                "Keys": ["Amazon S3"],
                "Metrics": {"UnblendedCost": {"Amount": "23.45", "Unit": "USD"}},
            },
        ],
    )
    prior = _cost_explorer_response("2026-10-01", "2026-10-24", "100.00")
    with Stubber(client) as stubber:
        stubber.add_response("get_cost_and_usage", current, current_params)
        stubber.add_response("get_cost_and_usage", prior, prior_params)
        summary = collect_cost_explorer(
            _CostExplorerSession(client),
            enabled=True,
            today=date(2026, 11, 23),
        )

    assert summary.cost_explorer_available
    assert summary.current_period_total == Decimal("123.45")
    assert summary.prior_period_total == Decimal("100.00")
    assert summary.trend_percent_change == Decimal("23.45")
    assert [(item.service, item.amount) for item in summary.service_breakdown] == [
        ("Amazon EC2", Decimal("100.00")),
        ("Amazon S3", Decimal("23.45")),
    ]
    assert summary.error_note is None


def test_cost_explorer_disabled_does_not_call_aws() -> None:
    class NoCallsSession:
        def client(self, *args: Any, **kwargs: Any) -> None:
            raise AssertionError("disabled Cost Explorer must not create a client")

    summary = collect_cost_explorer(NoCallsSession(), enabled=False)

    assert not summary.cost_explorer_available
    assert summary.current_period_total is None
    assert summary.error_note == "Cost Explorer collection is disabled."


@pytest.mark.parametrize(
    "error_code",
    ["AccessDeniedException", "DataUnavailableException", "OptInRequiredException"],
)
def test_cost_explorer_unavailable_or_denied_returns_sanitized_summary(
    error_code: str,
) -> None:
    session = boto3.Session(
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
        region_name=REGION,
    )
    client = session.client("ce", region_name=REGION)
    params = {
        "TimePeriod": {"Start": "2026-11-01", "End": "2026-11-24"},
        "Granularity": "MONTHLY",
        "Metrics": ["UnblendedCost"],
        "GroupBy": [{"Type": "DIMENSION", "Key": "SERVICE"}],
    }
    with Stubber(client) as stubber:
        stubber.add_client_error(
            "get_cost_and_usage",
            service_error_code=error_code,
            service_message="sensitive-cost-explorer-response",
            expected_params=params,
        )
        summary = collect_cost_explorer(
            _CostExplorerSession(client),
            enabled=True,
            today=date(2026, 11, 23),
        )

    assert not summary.cost_explorer_available
    assert summary.current_period_total is None
    assert summary.error_note == "Cost Explorer is not enabled or read access is unavailable."
    assert "sensitive-cost-explorer-response" not in summary.error_note


def test_cost_report_summarizes_assumptions_and_no_estimated_savings() -> None:
    snapshot = InventorySnapshot(
        resources=[
            _resource(
                "EBS",
                "vol-unattached",
                configuration={"size_gib": 12, "volume_type": "gp3"},
            )
        ]
    )
    report = evaluate_cost_intelligence(snapshot)

    assert report.total_waste_findings == len(report.findings)
    assert report.findings[0].category == "COST"
    assert report.required_tag_keys == ["CostCenter", "Project"]
    assert any(
        "network, memory, scheduled, or batch workloads" in item.lower()
        for item in report.detection_assumptions
    )
    assert not report.cost_explorer.cost_explorer_available
    assert all("$" not in finding.description for finding in report.findings)


def test_scan_report_cli_includes_cost_findings_and_cost_explorer_summary(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from app.integrations.aws import cli

    snapshot = InventorySnapshot(
        resources=[
            _resource(
                "EBS",
                "vol-cli",
                configuration={"size_gib": 25, "volume_type": "gp3"},
                tags={"CostCenter": "42", "Project": "demo"},
            ),
            _resource(
                "EC2",
                "i-cli",
                state="running",
                tags={
                    "Environment": "prod",
                    "Owner": "platform",
                    "CostCenter": "42",
                    "Project": "demo",
                },
            ),
        ]
    )
    metric = _cpu_metric("i-cli", 2.0, maximum=9.0, days=14)
    summary = CostExplorerSummary(
        cost_explorer_available=True,
        current_period_total=Decimal("125.00"),
        prior_period_total=Decimal("100.00"),
        currency="USD",
        trend_percent_change=Decimal("25.00"),
    )
    monkeypatch.setattr(cli, "create_aws_session", lambda: object())
    monkeypatch.setattr(
        cli,
        "run_inventory",
        lambda session=None, regions=None: snapshot,
    )
    monkeypatch.setattr(
        cli,
        "collect_ec2_cpu_metrics",
        lambda session, snapshot, lookback_days: MetricCollectionResult(metrics=[metric]),
    )
    monkeypatch.setattr(
        cli,
        "collect_cost_explorer",
        lambda session, enabled: summary,
    )
    output = tmp_path / "cost-report.json"

    assert cli.main(
        [
            "--output",
            str(output),
            "--scan-report",
            "--cpu-threshold",
            "7.5",
            "--lookback-days",
            "14",
            "--include-cost-explorer",
        ]
    ) == 0

    report = json.loads(output.read_text(encoding="utf-8"))
    cost_report = report["cost_report"]
    assert [finding["rule_id"] for finding in cost_report["findings"]] == [
        "COST-001",
        "COST-002",
    ]
    assert cost_report["findings"][0]["details"]["size_gb"] == 25
    assert cost_report["findings"][0]["details"]["size_unit"] == "GiB"
    assert cost_report["findings"][1]["details"]["lookback_days"] == 14
    assert cost_report["cpu_threshold_percent"] == 7.5
    assert cost_report["cost_explorer"]["current_period_total"] == "125.00"
