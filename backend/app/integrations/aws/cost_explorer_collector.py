import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.integrations.aws.collector_utils import record_error
from app.integrations.aws.models import CollectionError
from app.rules.models import CostExplorerSummary, ServiceCost

DISABLED_ERROR_CODES = {
    "AccessDenied",
    "AccessDeniedException",
    "DataUnavailableException",
    "OptInRequiredException",
    "SubscriptionRequiredException",
}
SETUP_ERROR_NOTE = (
    "Enable Cost Explorer in the AWS Billing Console or grant ce:GetCostAndUsage permission."
)


def _periods(today: date) -> tuple[date, date, date, date]:
    current_start = today.replace(day=1)
    current_end = today + timedelta(days=1)
    previous_month = current_start - timedelta(days=1)
    previous_start = previous_month.replace(day=1)
    prior_days = min(today.day, calendar.monthrange(previous_start.year, previous_start.month)[1])
    previous_end = previous_start + timedelta(days=prior_days)
    return current_start, current_end, previous_start, previous_end


def _amount(metric: Any) -> tuple[Decimal | None, str | None]:
    if not isinstance(metric, dict) or "Amount" not in metric:
        return None, None
    try:
        amount = Decimal(str(metric["Amount"]))
    except (InvalidOperation, ValueError):
        return None, None
    if not amount.is_finite():
        return None, None
    unit = metric.get("Unit")
    return amount, unit if isinstance(unit, str) else None


def _total(response: dict[str, Any]) -> tuple[Decimal | None, str | None]:
    total = Decimal("0")
    unit: str | None = None
    found = False
    for period in response.get("ResultsByTime", []):
        amount, currency = _amount(period.get("Total", {}).get("UnblendedCost"))
        if amount is not None:
            total += amount
            unit = unit or currency
            found = True
            continue
        for group in period.get("Groups", []):
            amount, currency = _amount(group.get("Metrics", {}).get("UnblendedCost"))
            if amount is not None:
                total += amount
                unit = unit or currency
                found = True
    return (total, unit) if found else (None, None)


def _service_breakdown(response: dict[str, Any]) -> list[ServiceCost]:
    amounts: dict[tuple[str, str | None], Decimal] = {}
    for period in response.get("ResultsByTime", []):
        for group in period.get("Groups", []):
            keys = group.get("Keys", [])
            if not keys or not isinstance(keys[0], str):
                continue
            amount, unit = _amount(group.get("Metrics", {}).get("UnblendedCost"))
            if amount is not None:
                key = (keys[0], unit)
                amounts[key] = amounts.get(key, Decimal("0")) + amount
    return [
        ServiceCost(service=service, amount=amount, unit=unit)
        for (service, unit), amount in sorted(
            amounts.items(),
            key=lambda item: (-item[1], item[0][0]),
        )
    ]


def _query_costs(
    client: Any,
    errors: list[CollectionError],
    start: date,
    end: date,
    *,
    group_by_service: bool,
) -> dict[str, Any] | None:
    request: dict[str, Any] = {
        "TimePeriod": {"Start": start.isoformat(), "End": end.isoformat()},
        "Granularity": "MONTHLY",
        "Metrics": ["UnblendedCost"],
    }
    if group_by_service:
        request["GroupBy"] = [{"Type": "DIMENSION", "Key": "SERVICE"}]
    try:
        return client.get_cost_and_usage(**request)
    except (ClientError, BotoCoreError) as exc:
        record_error(errors, "ce", "GetCostAndUsage", exc)
        return None


def collect_cost_explorer(
    session: boto3.Session,
    enabled: bool = True,
    *,
    today: date | None = None,
) -> CostExplorerSummary:
    if not enabled:
        return CostExplorerSummary(
            cost_explorer_available=False,
            error_note="Cost Explorer collection is disabled.",
        )

    current_start, current_end, previous_start, previous_end = _periods(
        today or datetime.now(timezone.utc).date()
    )
    errors: list[CollectionError] = []
    client = session.client("ce", region_name="us-east-1")
    current = _query_costs(
        client,
        errors,
        current_start,
        current_end,
        group_by_service=True,
    )
    if current is None:
        code = errors[-1].code if errors else ""
        note = (
            SETUP_ERROR_NOTE
            if code in DISABLED_ERROR_CODES
            else "Cost Explorer data could not be retrieved."
        )
        return CostExplorerSummary(cost_explorer_available=False, error_note=note)

    previous = _query_costs(
        client,
        errors,
        previous_start,
        previous_end,
        group_by_service=False,
    )
    current_total, currency = _total(current)
    previous_total, previous_currency = _total(previous) if previous is not None else (None, None)
    if currency is None:
        currency = previous_currency
    available = previous is not None and current_total is not None and previous_total is not None
    trend = None
    if available and previous_total and previous_total > 0:
        trend = (
            (current_total - previous_total) / previous_total * Decimal("100")
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    note = None
    if not available:
        code = errors[-1].code if errors else ""
        note = (
            SETUP_ERROR_NOTE
            if code in DISABLED_ERROR_CODES
            else "Cost Explorer returned incomplete billing data."
        )

    return CostExplorerSummary(
        cost_explorer_available=available,
        error_note=note,
        current_period_start=current_start,
        current_period_end=current_end,
        prior_period_start=previous_start,
        prior_period_end=previous_end,
        current_period_total=current_total,
        prior_period_total=previous_total,
        currency=currency,
        trend_percent_change=trend,
        service_breakdown=_service_breakdown(current),
    )
