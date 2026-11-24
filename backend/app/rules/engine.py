from collections.abc import Sequence

from app.integrations.aws.models import InventorySnapshot
from app.rules.models import SecurityEvaluationReport
from app.rules.scoring import calculate_risk_score
from app.rules.security_rules import DEFAULT_REQUIRED_TAG_KEYS, evaluate_security_rules


def evaluate_inventory(
    snapshot: InventorySnapshot,
    required_tag_keys: Sequence[str] = DEFAULT_REQUIRED_TAG_KEYS,
) -> SecurityEvaluationReport:
    findings = evaluate_security_rules(snapshot.resources, required_tag_keys)
    score = calculate_risk_score(snapshot.resources, findings)
    return SecurityEvaluationReport(
        **score.model_dump(),
        findings=findings,
    )
