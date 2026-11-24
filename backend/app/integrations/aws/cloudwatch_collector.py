from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.integrations.aws.collector_utils import record_error
from app.integrations.aws.models import (
    EC2CpuMetric,
    InventorySnapshot,
    MetricCollectionResult,
)


def collect_ec2_cpu_metrics(
    session: boto3.Session,
    snapshot: InventorySnapshot,
    lookback_days: int = 7,
    *,
    end_time: datetime | None = None,
    period_seconds: int = 3600,
) -> MetricCollectionResult:
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1")
    if period_seconds < 60 or period_seconds % 60:
        raise ValueError("period_seconds must be a positive multiple of 60")

    end = end_time or datetime.now(timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    start = end - timedelta(days=lookback_days)
    result = MetricCollectionResult()
    clients: dict[str, Any] = {}

    for resource in snapshot.resources:
        if resource.resource_type != "EC2" or resource.state.lower() != "running":
            continue
        if resource.region not in clients:
            clients[resource.region] = session.client(
                "cloudwatch",
                region_name=resource.region,
            )
        client = clients[resource.region]
        try:
            response = client.get_metric_statistics(
                Namespace="AWS/EC2",
                MetricName="CPUUtilization",
                Dimensions=[{"Name": "InstanceId", "Value": resource.resource_id}],
                StartTime=start,
                EndTime=end,
                Period=period_seconds,
                Statistics=["Average", "Maximum"],
            )
        except (ClientError, BotoCoreError) as exc:
            record_error(result.errors, "cloudwatch", "GetMetricStatistics", exc)
            response = {}

        datapoints = response.get("Datapoints", [])
        valid_averages = [
            float(point["Average"])
            for point in datapoints
            if isinstance(point.get("Average"), (int, float))
        ]
        maxima = [
            float(point["Maximum"])
            for point in datapoints
            if isinstance(point.get("Maximum"), (int, float))
        ]
        result.metrics.append(
            EC2CpuMetric(
                resource_id=resource.resource_id,
                region=resource.region,
                lookback_days=lookback_days,
                start_time=start,
                end_time=end,
                average_cpu_percent=(
                    sum(valid_averages) / len(valid_averages) if valid_averages else None
                ),
                maximum_cpu_percent=max(maxima) if maxima else None,
                datapoint_count=len(valid_averages),
            )
        )
    return result
