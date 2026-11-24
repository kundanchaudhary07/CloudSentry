import logging
from collections.abc import Callable, Iterator
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from app.integrations.aws.models import CollectionError

logger = logging.getLogger("cloudsentry.aws.inventory")


def record_error(
    errors: list[CollectionError],
    service: str,
    operation: str,
    exception: ClientError | BotoCoreError,
) -> None:
    if isinstance(exception, ClientError):
        code = str(exception.response.get("Error", {}).get("Code", "ClientError"))
    else:
        code = type(exception).__name__
    logger.warning(
        "AWS inventory request failed",
        extra={"service": service, "operation": operation, "error_code": code},
    )
    denied = code in {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation"}
    message = (
        "Permission denied; verify the read-only IAM policy."
        if denied
        else "AWS request failed; see the error code."
    )
    errors.append(
        CollectionError(
            service=service,
            operation=operation,
            code=code,
            message=message,
        )
    )


def safe_call(
    call: Callable[[], Any],
    errors: list[CollectionError],
    service: str,
    operation: str,
    ignored_codes: set[str] | None = None,
) -> Any | None:
    try:
        return call()
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", "ClientError"))
        if code in (ignored_codes or set()):
            return None
        record_error(errors, service, operation, exc)
        return None
    except BotoCoreError as exc:
        record_error(errors, service, operation, exc)
        return None


def safe_pages(
    client: Any,
    operation: str,
    errors: list[CollectionError],
    service: str,
    **kwargs: Any,
) -> Iterator[dict[str, Any]]:
    try:
        paginator = client.get_paginator(operation)
        yield from paginator.paginate(**kwargs)
    except (ClientError, BotoCoreError) as exc:
        record_error(errors, service, operation, exc)
