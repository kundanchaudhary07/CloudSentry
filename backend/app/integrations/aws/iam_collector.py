import boto3

from app.integrations.aws.collector_utils import safe_pages
from app.integrations.aws.models import CollectionResult, InventoryResource


def collect_iam(session: boto3.Session) -> CollectionResult:
    client = session.client("iam")
    result = CollectionResult()

    for page in safe_pages(client, "list_users", result.errors, "iam"):
        for user in page.get("Users", []):
            user_name = user["UserName"]
            attached_policies = [
                policy
                for page in safe_pages(
                    client,
                    "list_attached_user_policies",
                    result.errors,
                    "iam",
                    UserName=user_name,
                )
                for policy in page.get("AttachedPolicies", [])
            ]
            result.resources.append(
                InventoryResource(
                    resource_id=user["UserId"],
                    resource_type="IAMUser",
                    region="global",
                    name=user_name,
                    state="present",
                    configuration={
                        "path": user.get("Path"),
                        "attached_policies": [
                            {"name": policy.get("PolicyName"), "arn": policy.get("PolicyArn")}
                            for policy in attached_policies
                        ],
                    },
                )
            )

    for page in safe_pages(client, "list_roles", result.errors, "iam"):
        for role in page.get("Roles", []):
            role_name = role["RoleName"]
            attached_policies = [
                policy
                for page in safe_pages(
                    client,
                    "list_attached_role_policies",
                    result.errors,
                    "iam",
                    RoleName=role_name,
                )
                for policy in page.get("AttachedPolicies", [])
            ]
            result.resources.append(
                InventoryResource(
                    resource_id=role["RoleId"],
                    resource_type="IAMRole",
                    region="global",
                    name=role_name,
                    state="present",
                    configuration={
                        "path": role.get("Path"),
                        "attached_policies": [
                            {"name": policy.get("PolicyName"), "arn": policy.get("PolicyArn")}
                            for policy in attached_policies
                        ],
                    },
                )
            )
    return result
