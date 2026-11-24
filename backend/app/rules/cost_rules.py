import math
from collections.abc import Sequence
from typing import Any

from app.integrations.aws.models import EC2CpuMetric, InventoryResource, InventorySnapshot
from app.rules.models import Finding, Severity

DEFAULT_REQUIRED_COST_TAGS = ("CostCenter", "Project")


def _cost_finding(
    resource: InventoryResource,
    rule_id: str,
    title: str,
    severity: Severity,
    description: str,
    recommendation: str,
    details: dict[str, Any] | None = None,
) -> Finding:
    return Finding(
        rule_id=rule_id,
        title=title,
        severity=severity,
        resource_id=resource.resource_id,
        resource_type=resource.resource_type,
        region=resource.region,
        category="COST",
        description=description,
        recommendation=recommendation,
        details=details or {},
    )


def evaluate_cost_001(resource: InventoryResource) -> Finding | None:
    if resource.resource_type != "EBS" or resource.state.lower() != "available":
        return None
    if "attached_instance_ids" in resource.configuration:
        attached = resource.configuration["attached_instance_ids"]
        if not isinstance(attached, list) or attached:
            return None

    size_gb = resource.configuration.get(
        "size_gb",
        resource.configuration.get("size_gib"),
    )
    volume_type = resource.configuration.get("volume_type")
    size_description = (
        f"{size_gb} GiB" if isinstance(size_gb, (int, float)) else "unknown size"
    )
    type_description = volume_type if isinstance(volume_type, str) else "unknown type"
    return _cost_finding(
        resource,
        "COST-001",
        "EBS volume is unattached",
        "MEDIUM",
        f"The EBS volume is available with no attached EC2 instances "
        f"(reported size: {size_description}; volume type: {type_description}). "
        "Storage may still be intentionally retained.",
        "Confirm the volume is not needed for recovery or another workflow, then review "
        "whether it can be safely removed. No savings estimate is included.",
        details={"size_gb": size_gb, "size_unit": "GiB", "volume_type": volume_type},
    )


def _cpu_finding(
    resource: InventoryResource,
    metric: EC2CpuMetric,
    cpu_threshold: float,
    lookback_days: int,
) -> Finding:
    average = metric.average_cpu_percent
    return _cost_finding(
        resource,
        "COST-002",
        "EC2 instance has low average CPU utilization",
        "MEDIUM",
        f"Average CPU utilization over the last {lookback_days} days was "
        f"{average:.2f}%, below the configured {cpu_threshold:.2f}% threshold. "
        "Low CPU alone does not establish that an instance is unused; network, memory, "
        "or batch workloads may still be active and engineering review is required.",
        "Review instance purpose and complementary utilization signals with its owner "
        "before changing capacity or lifecycle.",
        details={
            "average_cpu_percent": average,
            "maximum_cpu_percent": metric.maximum_cpu_percent,
            "lookback_days": lookback_days,
            "cpu_threshold_percent": cpu_threshold,
            "datapoint_count": metric.datapoint_count,
        },
    )


def evaluate_cost_002(
    resources: Sequence[InventoryResource],
    metrics: Sequence[EC2CpuMetric],
    cpu_threshold: float = 5.0,
    lookback_days: int = 7,
) -> list[Finding]:
    metric_by_instance = {
        (metric.resource_id, metric.region): metric for metric in metrics
    }
    findings: list[Finding] = []
    for resource in resources:
        if resource.resource_type != "EC2" or resource.state.lower() != "running":
            continue
        metric = metric_by_instance.get((resource.resource_id, resource.region))
        if (
            metric is None
            or metric.lookback_days != lookback_days
            or metric.average_cpu_percent is None
            or not math.isfinite(metric.average_cpu_percent)
            or metric.average_cpu_percent >= cpu_threshold
        ):
            continue
        findings.append(_cpu_finding(resource, metric, cpu_threshold, lookback_days))
    return findings


def evaluate_cost_003(
    resources: Sequence[InventoryResource],
    required_tag_keys: Sequence[str] = DEFAULT_REQUIRED_COST_TAGS,
) -> list[Finding]:
    billable_types = {"EC2", "EBS", "RDS", "S3"}
    findings: list[Finding] = []
    for resource in resources:
        if (
            resource.resource_type not in billable_types
            or resource.configuration.get("tags_status") == "unavailable"
        ):
            continue
        missing = [
            key
            for key in required_tag_keys
            if not isinstance(resource.tags.get(key), str)
            or not resource.tags[key].strip()
        ]
        if not missing:
            continue
        findings.append(
            _cost_finding(
                resource,
                "COST-003",
                "Resource is missing cost allocation tags",
                "LOW",
                "Required cost allocation tags are missing or blank: "
                + ", ".join(missing)
                + ".",
                "Apply the required cost allocation tags and activate the corresponding "
                "cost allocation tags in AWS billing settings.",
                details={"missing_tags": missing},
            )
        )
    return findings


def evaluate_cost_rules(
    snapshot: InventorySnapshot,
    metrics: Sequence[EC2CpuMetric],
    *,
    cpu_threshold: float = 5.0,
    lookback_days: int = 7,
    required_tag_keys: Sequence[str] = DEFAULT_REQUIRED_COST_TAGS,
) -> list[Finding]:
    if not math.isfinite(cpu_threshold) or not 0 <= cpu_threshold <= 100:
        raise ValueError("cpu_threshold must be between 0 and 100")
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1")

    findings: list[Finding] = []
    for resource in snapshot.resources:
        unattached_volume = evaluate_cost_001(resource)
        if unattached_volume is not None:
            findings.append(unattached_volume)
    findings.extend(
        evaluate_cost_002(
            snapshot.resources,
            metrics,
            cpu_threshold=cpu_threshold,
            lookback_days=lookback_days,
        )
    )
    findings.extend(evaluate_cost_003(snapshot.resources, required_tag_keys))
    return findings
