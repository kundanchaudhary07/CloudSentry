import argparse
import json
import math
from pathlib import Path
from typing import Sequence

from app.integrations.aws.cloudwatch_collector import collect_ec2_cpu_metrics
from app.integrations.aws.cost_explorer_collector import collect_cost_explorer
from app.integrations.aws.inventory_engine import run_inventory
from app.integrations.aws.session import create_aws_session
from app.rules.cost_engine import evaluate_cost_intelligence
from app.rules.cost_rules import DEFAULT_REQUIRED_COST_TAGS
from app.rules.engine import evaluate_inventory


def _cpu_threshold(value: str) -> float:
    try:
        threshold = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("CPU threshold must be a number") from exc
    if not math.isfinite(threshold) or not 0 <= threshold <= 100:
        raise argparse.ArgumentTypeError("CPU threshold must be between 0 and 100")
    return threshold


def _positive_days(value: str) -> int:
    try:
        days = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Lookback days must be an integer") from exc
    if days < 1:
        raise argparse.ArgumentTypeError("Lookback days must be at least 1")
    return days


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a read-only AWS inventory snapshot.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("inventory_snapshot.json"),
        help="Path to the normalized JSON snapshot (default: inventory_snapshot.json)",
    )
    parser.add_argument(
        "--regions",
        help="Comma-separated AWS regions. Defaults to AWS_REGIONS or discovered regions.",
    )
    parser.add_argument(
        "--scan-report",
        action="store_true",
        help="Evaluate the collected inventory with the security rules and include findings and score.",
    )
    parser.add_argument(
        "--required-tags",
        default="Environment,Owner",
        help="Comma-separated EC2 governance tags checked by security rules.",
    )
    parser.add_argument(
        "--cpu-threshold",
        type=_cpu_threshold,
        default=5.0,
        help="Average CPU percentage below which a running instance is an opportunity (default: 5.0).",
    )
    parser.add_argument(
        "--lookback-days",
        type=_positive_days,
        default=7,
        help="CloudWatch CPU observation window (default: 7 days).",
    )
    parser.add_argument(
        "--required-cost-tags",
        default=",".join(DEFAULT_REQUIRED_COST_TAGS),
        help="Comma-separated cost allocation tag keys (default: CostCenter,Project).",
    )
    parser.add_argument(
        "--include-cost-explorer",
        action="store_true",
        help="Include read-only Cost Explorer spend data. Requires Cost Explorer access.",
    )
    args = parser.parse_args(argv)
    regions = (
        [value.strip() for value in args.regions.split(",") if value.strip()]
        if args.regions
        else None
    )
    collection_error_count = 0
    if args.scan_report:
        session = create_aws_session()
        snapshot = run_inventory(session=session, regions=regions)
        cpu_metrics = collect_ec2_cpu_metrics(
            session,
            snapshot,
            lookback_days=args.lookback_days,
        )
        collection_error_count = len(snapshot.errors) + len(cpu_metrics.errors)
        cost_explorer = collect_cost_explorer(
            session,
            enabled=args.include_cost_explorer,
        )
        required_tags = [value.strip() for value in args.required_tags.split(",") if value.strip()]
        required_cost_tags = [
            value.strip()
            for value in args.required_cost_tags.split(",")
            if value.strip()
        ]
        evaluation = evaluate_inventory(snapshot, required_tags)
        cost_report = evaluate_cost_intelligence(
            snapshot,
            cpu_metrics.metrics,
            cloudwatch_errors=cpu_metrics.errors,
            cost_explorer=cost_explorer,
            cpu_threshold=args.cpu_threshold,
            lookback_days=args.lookback_days,
            required_tag_keys=required_cost_tags,
        )
        payload = {
            "inventory": snapshot.model_dump(mode="json"),
            **evaluation.model_dump(mode="json"),
            "cost_report": cost_report.model_dump(mode="json"),
        }
        output = json.dumps(payload, indent=2)
    else:
        snapshot = run_inventory(regions=regions)
        collection_error_count = len(snapshot.errors)
        output = snapshot.model_dump_json(indent=2)
    args.output.write_text(output, encoding="utf-8")
    print(
        f"Wrote {len(snapshot.resources)} resources and "
        f"{collection_error_count} collection errors to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
