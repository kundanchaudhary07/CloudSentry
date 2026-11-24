from collections.abc import Sequence

from app.integrations.aws.models import InventoryResource
from app.rules.models import Finding, RiskScore, SeverityCounts

SEVERITY_PENALTIES = {
    "CRITICAL": 40,
    "HIGH": 25,
    "MEDIUM": 12,
    "LOW": 5,
}
EVALUATED_RESOURCE_TYPES = {"EC2", "SecurityGroup", "EBS", "S3"}
MAX_PENALTY_PER_RESOURCE = 100


def calculate_risk_score(
    resources: Sequence[InventoryResource],
    findings: Sequence[Finding],
) -> RiskScore:
    counts = SeverityCounts(
        critical=sum(finding.severity == "CRITICAL" for finding in findings),
        high=sum(finding.severity == "HIGH" for finding in findings),
        medium=sum(finding.severity == "MEDIUM" for finding in findings),
        low=sum(finding.severity == "LOW" for finding in findings),
    )
    evaluated_count = sum(
        resource.resource_type in EVALUATED_RESOURCE_TYPES for resource in resources
    )
    penalty = sum(SEVERITY_PENALTIES[finding.severity] for finding in findings)
    average_penalty = (
        (penalty + evaluated_count // 2) // evaluated_count
        if evaluated_count
        else 0
    )
    score = max(0, MAX_PENALTY_PER_RESOURCE - min(MAX_PENALTY_PER_RESOURCE, average_penalty))

    return RiskScore(
        posture_score=score,
        severity_counts=counts,
        evaluated_resource_count=evaluated_count,
    )
