import fnmatch
import ipaddress
from collections.abc import Callable, Sequence
from functools import partial
from typing import Any

from app.integrations.aws.models import InventoryResource
from app.rules.models import Finding, Severity

DEFAULT_REQUIRED_TAG_KEYS = ("Environment", "Owner")
RuleEvaluator = Callable[[InventoryResource, Sequence[str]], list[Finding]]


def _finding(
    resource: InventoryResource,
    rule_id: str,
    title: str,
    severity: Severity,
    description: str,
    recommendation: str,
) -> Finding:
    return Finding(
        rule_id=rule_id,
        title=title,
        severity=severity,
        resource_id=resource.resource_id,
        resource_type=resource.resource_type,
        region=resource.region,
        description=description,
        recommendation=recommendation,
    )


def _is_internet_cidr(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return ipaddress.ip_network(value, strict=False).prefixlen == 0
    except ValueError:
        return False


def _is_world_open_for_port(rule: dict[str, Any], port: int) -> bool:
    protocol = str(rule.get("ip_protocol", "")).lower()
    if protocol != "-1":
        if protocol not in {"tcp", "6"}:
            return False
        try:
            first = int(rule["from_port"])
            last = int(rule["to_port"])
        except (KeyError, TypeError, ValueError):
            return False
        if not first <= port <= last:
            return False

    ipv4 = rule.get("ipv4_cidrs", [])
    ipv6 = rule.get("ipv6_cidrs", [])
    sources = [
        *(ipv4 if isinstance(ipv4, list) else []),
        *(ipv6 if isinstance(ipv6, list) else []),
    ]
    return any(_is_internet_cidr(source) for source in sources)


def evaluate_sg_001(
    resource: InventoryResource,
) -> list[Finding]:
    if resource.resource_type != "SecurityGroup":
        return []
    ingress = resource.configuration.get("ingress_rules", [])
    if not isinstance(ingress, list) or not any(
        isinstance(rule, dict) and _is_world_open_for_port(rule, 22) for rule in ingress
    ):
        return []
    return [
        _finding(
            resource,
            "SG-001",
            "SSH exposed to the internet",
            "HIGH",
            "An inbound security-group rule allows SSH (TCP port 22) from the internet.",
            "Restrict SSH ingress to approved source networks or use a managed access path.",
        )
    ]


def evaluate_sg_002(
    resource: InventoryResource,
) -> list[Finding]:
    if resource.resource_type != "SecurityGroup":
        return []
    ingress = resource.configuration.get("ingress_rules", [])
    if not isinstance(ingress, list) or not any(
        isinstance(rule, dict) and _is_world_open_for_port(rule, 3389) for rule in ingress
    ):
        return []
    return [
        _finding(
            resource,
            "SG-002",
            "RDP exposed to the internet",
            "HIGH",
            "An inbound security-group rule allows RDP (TCP port 3389) from the internet.",
            "Restrict RDP ingress to approved source networks or use a managed access path.",
        )
    ]


def evaluate_ebs_001(
    resource: InventoryResource,
) -> list[Finding]:
    if resource.resource_type != "EBS":
        return []
    encrypted = resource.configuration.get("encrypted")
    if encrypted is True:
        return []
    return [
        _finding(
            resource,
            "EBS-001",
            "EBS volume is unencrypted",
            "MEDIUM",
            "The volume is unencrypted or its encryption state was not reported.",
            "Enable EBS encryption for the volume and ensure future volumes use encryption by default.",
        )
    ]


def _public_acl_grant(grant: Any) -> bool:
    if not isinstance(grant, dict):
        return False
    uri = grant.get("uri")
    if not isinstance(uri, str):
        return False
    return uri.rsplit("/", 1)[-1] in {"AllUsers", "AuthenticatedUsers"}


def _values(value: Any) -> list[Any]:
    return value if isinstance(value, list) else [value]


def _wildcard_principal(value: Any) -> bool:
    if value == "*":
        return True
    if isinstance(value, list):
        return any(_wildcard_principal(item) for item in value)
    if isinstance(value, dict):
        return any(_wildcard_principal(item) for item in value.values())
    return False


def _restricted_by_condition(condition: Any) -> bool:
    if not isinstance(condition, dict):
        return False
    restricting_keys = {
        "aws:principalorgid",
        "aws:principalarn",
        "aws:sourcevpc",
        "aws:sourcevpce",
        "aws:sourceip",
    }
    for operator, entries in condition.items():
        normalized_operator = str(operator).lower()
        if "not" in normalized_operator or "ifexists" in normalized_operator:
            continue
        base_operator = normalized_operator.rsplit(":", 1)[-1]
        if base_operator not in {
            "stringequals",
            "stringlike",
            "arnequals",
            "arnlike",
            "ipaddress",
        }:
            continue
        if not isinstance(entries, dict):
            continue
        for key, value in entries.items():
            normalized_key = str(key).lower()
            if normalized_key not in restricting_keys:
                continue
            values = _values(value)
            if not values:
                continue
            if normalized_key == "aws:sourceip":
                if base_operator != "ipaddress" or not all(
                    isinstance(item, str) for item in values
                ):
                    continue
                try:
                    networks = [
                        ipaddress.ip_network(item, strict=False)
                        for item in values
                    ]
                except ValueError:
                    continue
                if networks and all(
                    network.prefixlen >= (8 if network.version == 4 else 32)
                    for network in networks
                ):
                    return True
            elif (
                base_operator in {"stringequals", "stringlike", "arnequals", "arnlike"}
                and all(
                    isinstance(item, str)
                    and item
                    and "*" not in item
                    and "?" not in item
                    for item in values
                )
            ):
                return True
    return False


def _statement_applies_to_bucket(statement: dict[str, Any], bucket: str) -> bool:
    resource_arns = _values(statement.get("Resource", []))
    bucket_arn = f"arn:aws:s3:::{bucket}"
    return any(
        isinstance(arn, str)
        and (
            arn == "*"
            or fnmatch.fnmatchcase(bucket_arn, arn)
            or fnmatch.fnmatchcase(f"{bucket_arn}/*", arn)
        )
        for arn in resource_arns
    )


def _is_public_bucket_policy_statement(statement: Any, bucket: str) -> bool:
    if not isinstance(statement, dict) or str(statement.get("Effect", "")).lower() != "allow":
        return False
    if not _statement_applies_to_bucket(statement, bucket):
        return False
    if _restricted_by_condition(statement.get("Condition")):
        return False

    if "NotPrincipal" in statement:
        return not _wildcard_principal(statement.get("NotPrincipal"))
    return _wildcard_principal(statement.get("Principal"))


def _s3_unsafe_reasons(resource: InventoryResource) -> list[str]:
    configuration = resource.configuration
    reasons: list[str] = []
    if configuration.get("public_access_block_status") != "unavailable":
        public_access_block = configuration.get("public_access_block")
        required_flags = (
            "BlockPublicAcls",
            "IgnorePublicAcls",
            "BlockPublicPolicy",
            "RestrictPublicBuckets",
        )
        if not isinstance(public_access_block, dict):
            reasons.append("the bucket public-access block is missing")
        else:
            for flag in required_flags:
                if public_access_block.get(flag) is not True:
                    reasons.append(f"{flag} is missing or disabled")

    grants = configuration.get("acl_grants", [])
    if (
        configuration.get("acl_status") != "unavailable"
        and isinstance(grants, list)
        and any(_public_acl_grant(grant) for grant in grants)
    ):
        reasons.append("the ACL grants access to AllUsers or AuthenticatedUsers")

    statements = configuration.get("bucket_policy_statements", [])
    if (
        configuration.get("bucket_policy_status") != "unavailable"
        and isinstance(statements, list)
        and any(
            _is_public_bucket_policy_statement(statement, resource.resource_id)
            for statement in statements
        )
    ):
        reasons.append("the bucket policy allows a public principal")
    return reasons


def evaluate_s3_001(
    resource: InventoryResource,
) -> list[Finding]:
    if resource.resource_type != "S3":
        return []
    reasons = _s3_unsafe_reasons(resource)
    if not reasons:
        return []
    return [
        _finding(
            resource,
            "S3-001",
            "S3 bucket has unsafe public access configuration",
            "CRITICAL",
            "Unsafe S3 access configuration: " + "; ".join(reasons) + ".",
            "Enable all four S3 Block Public Access settings, remove public ACL grants, "
            "and restrict bucket-policy principals and resources.",
        )
    ]


def evaluate_ec2_001(
    resource: InventoryResource, required_tag_keys: Sequence[str] = DEFAULT_REQUIRED_TAG_KEYS
) -> list[Finding]:
    if resource.resource_type != "EC2":
        return []
    missing = [
        key
        for key in required_tag_keys
        if not isinstance(resource.tags.get(key), str) or not resource.tags[key].strip()
    ]
    if not missing:
        return []
    return [
        _finding(
            resource,
            "EC2-001",
            "EC2 instance is missing governance tags",
            "LOW",
            f"Required governance tags are missing or blank: {', '.join(missing)}.",
            "Add non-empty values for the required governance tags: "
            + ", ".join(missing)
            + ".",
        )
    ]


def create_rule_registry(
    required_tag_keys: Sequence[str] = DEFAULT_REQUIRED_TAG_KEYS,
) -> tuple[RuleEvaluator, ...]:
    return (
        evaluate_sg_001,
        evaluate_sg_002,
        evaluate_ebs_001,
        evaluate_s3_001,
        partial(evaluate_ec2_001, required_tag_keys=tuple(required_tag_keys)),
    )


RULE_REGISTRY = create_rule_registry()


def evaluate_security_rules(
    resources: Sequence[InventoryResource],
    required_tag_keys: Sequence[str] = DEFAULT_REQUIRED_TAG_KEYS,
) -> list[Finding]:
    findings: list[Finding] = []
    rules = create_rule_registry(required_tag_keys)
    for resource in resources:
        for rule in rules:
            findings.extend(rule(resource))
    return findings
