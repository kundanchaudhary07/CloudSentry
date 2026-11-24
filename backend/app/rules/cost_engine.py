import math
from collections.abc import Sequence

from app.integrations.aws.models import (
    CollectionError,
    EC2CpuMetric,
    InventorySnapshot,
)
from app.rules.cost_rules import DEFAULT_REQUIRED_COST_TAGS, evaluate_cost_rules
from app.rules.models import (
    CostExplorerSummary,
    CostIntelligenceReport,
)


def evaluate_cost_intelligence(
    snapshot: InventorySnapshot,
    metrics: Sequence[EC2CpuMetric] = (),
    *,
    cloudwatch_errors: Sequence[CollectionError] = (),
    cost_explorer: CostExplorerSummary | None = None,
    cpu_threshold: float = 5.0,
    lookback_days: int = 7,
    required_tag_keys: Sequence[str] = DEFAULT_REQUIRED_COST_TAGS,
) -> CostIntelligenceReport:
    if not math.isfinite(cpu_threshold) or not 0 <= cpu_threshold <= 100:
        raise ValueError("cpu_threshold must be between 0 and 100")
    if lookback_days < 1:
        raise ValueError("lookback_days must be at least 1")

    findings = evaluate_cost_rules(
        snapshot,
        metrics,
        cpu_threshold=cpu_threshold,
        lookback_days=lookback_days,
        required_tag_keys=required_tag_keys,
    )
    assumptions = [
        "An EBS volume is an unattached-storage opportunity only when its state is "
        "available and no attachments are reported; retained recovery volumes may be intentional.",
        "Low average CPU is only an investigation signal. Network, memory, scheduled, or "
        "batch workloads may still be active; review with the service owner before action.",
        "EC2 low-usage findings require CloudWatch datapoints for the requested observation "
        "window. Missing datapoints and unavailable metrics are not treated as zero CPU.",
        "Cost allocation tag findings cover EC2, EBS, RDS, and S3. Blank values count as "
        "missing; resources whose tag reads were denied are excluded from this rule.",
        "Cost Explorer compares current month-to-date with the same day-count window in "
        "the prior month. Period end dates are exclusive; percent change is omitted when "
        "prior-period spend is zero.",
        "Savings amounts are not estimated. Cost Explorer reports actual UnblendedCost "
        "only; usage signals are opportunities, not calculated savings.",
    ]
    return CostIntelligenceReport(
        total_waste_findings=len(findings),
        findings=findings,
        detection_assumptions=assumptions,
        cpu_threshold_percent=cpu_threshold,
        lookback_days=lookback_days,
        required_tag_keys=list(required_tag_keys),
        cloudwatch_errors=list(cloudwatch_errors),
        cost_explorer=cost_explorer
        or CostExplorerSummary(
            cost_explorer_available=False,
            error_note="Cost Explorer collection is disabled.",
        ),
    )
