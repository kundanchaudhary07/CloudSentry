from datetime import datetime, timedelta, timezone
import time
from typing import Any
from uuid import UUID

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.models import Base, User, UserAwsCredential
from app.database.session import get_db
from app.api.v1.dependencies import get_current_user
from app.integrations.aws.models import (
    EC2CpuMetric,
    InventoryResource,
    InventorySnapshot,
    MetricCollectionResult,
)
import app.database.session as database_session
import base64
import hashlib
from cryptography.fernet import Fernet
from app.main import app
from app.rules.models import CostExplorerSummary
from app.services.scan_service import ScanDependencies, get_scan_dependencies

REGION = "us-east-1"
NOW = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def api_client() -> TestClient:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection: Any, record: Any) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with test_session() as setup_db:
        test_user = User(
            id=UUID("00000000-0000-0000-0000-000000000001"),
            email="operator@example.test",
            full_name="Test Operator",
            hashed_password="!",
            is_active=True,
        )
        setup_db.add(test_user)
        setup_db.commit()
        key = hashlib.sha256(b"change-me-in-production").digest()
        encrypted = Fernet(base64.urlsafe_b64encode(key)).encrypt(b"test-secret").decode()
        setup_db.add(UserAwsCredential(
            user_id=test_user.id,
            aws_access_key_id="AKIATEST1234",
            encrypted_secret_access_key=encrypted,
            aws_default_region=REGION,
        ))
        setup_db.commit()

    def override_get_db():
        with test_session() as db:
            yield db

    snapshot = InventorySnapshot(
        resources=[
            InventoryResource(
                resource_id="sg-public",
                resource_type="SecurityGroup",
                region=REGION,
                state="active",
                configuration={
                    "ingress_rules": [
                        {
                            "ip_protocol": "tcp",
                            "from_port": 22,
                            "to_port": 22,
                            "ipv4_cidrs": ["0.0.0.0/0"],
                            "ipv6_cidrs": [],
                        }
                    ]
                },
            ),
            InventoryResource(
                resource_id="i-idle",
                resource_type="EC2",
                region=REGION,
                state="running",
                tags={},
                configuration={"instance_type": "t3.micro"},
            ),
            InventoryResource(
                resource_id="vol-open",
                resource_type="EBS",
                region=REGION,
                state="available",
                tags={},
                configuration={
                    "encrypted": False,
                    "size_gb": 40,
                    "volume_type": "gp3",
                    "attached_instance_ids": [],
                },
            ),
        ]
    )
    metric_result = MetricCollectionResult(
        metrics=[
            EC2CpuMetric(
                resource_id="i-idle",
                region=REGION,
                lookback_days=7,
                start_time=NOW - timedelta(days=7),
                end_time=NOW,
                average_cpu_percent=1.5,
                maximum_cpu_percent=3.0,
                datapoint_count=7,
            )
        ]
    )
    dependencies = ScanDependencies(
        session_factory=lambda: object(),
        inventory_collector=lambda **kwargs: snapshot,
        cloudwatch_collector=lambda *args, **kwargs: metric_result,
        cost_explorer_collector=lambda *args, **kwargs: CostExplorerSummary(
            cost_explorer_available=True,
            current_period_total="12.50",
            prior_period_total="10.00",
            currency="USD",
            trend_percent_change="25.00",
            service_breakdown=[
                {"service": "Amazon EC2", "amount": "12.50", "unit": "USD"}
            ],
        ),
    )
    app.dependency_overrides[get_db] = override_get_db
    original_session_local = database_session.SessionLocal
    database_session.SessionLocal = test_session
    def override_get_current_user(db=Depends(get_db)) -> User:
        return db.scalar(
            select(User).where(User.id == UUID("00000000-0000-0000-0000-000000000001"))
        )

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_scan_dependencies] = lambda: dependencies
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        database_session.SessionLocal = original_session_local
        Base.metadata.drop_all(engine)
        engine.dispose()


def _create_scan(client: TestClient) -> dict[str, Any]:
    response = client.post(
        "/api/v1/scans",
        json={
            "regions": [REGION],
            "include_cost_explorer": True,
            "required_tags": ["Environment", "Owner"],
            "required_cost_tags": ["CostCenter", "Project"],
        },
    )
    assert response.status_code == 202, response.text
    created = response.json()
    for _ in range(20):
        detail = client.get(f"/api/v1/scans/{created['id']}")
        if detail.status_code == 200 and detail.json()["status"] != "RUNNING":
            return detail.json()
        time.sleep(0.05)
    return created


def test_scan_persistence_and_read_routes(api_client: TestClient) -> None:
    created = _create_scan(api_client)
    scan_id = created["id"]

    assert created["status"] == "COMPLETED"
    assert created["resource_count"] == 3
    assert created["regions"] == [REGION]
    assert 0 <= created["posture_score"] <= 100
    assert created["severity_counts"]["high"] == 1
    assert created["cost_summary"]["cost_explorer"]["current_period_total"] == "12.50"

    scans = api_client.get("/api/v1/scans")
    assert scans.status_code == 200
    assert [scan["id"] for scan in scans.json()] == [scan_id]

    scan_detail = api_client.get(f"/api/v1/scans/{scan_id}")
    assert scan_detail.status_code == 200
    detail = scan_detail.json()
    assert len(detail["resources"]) == 3
    assert {finding["rule_id"] for finding in detail["findings"]} >= {
        "SG-001",
        "EBS-001",
        "EC2-001",
        "COST-001",
        "COST-002",
        "COST-003",
    }

    all_findings = api_client.get("/api/v1/findings", params={"scan_id": scan_id})
    assert all_findings.status_code == 200
    assert len(all_findings.json()) == len(detail["findings"])
    filtered = api_client.get(
        "/api/v1/findings",
        params={
            "scan_id": scan_id,
            "category": "SECURITY",
            "severity": "HIGH",
            "status": "OPEN",
            "resource_type": "SecurityGroup",
            "search": "SSH",
        },
    )
    assert filtered.status_code == 200
    assert [finding["rule_id"] for finding in filtered.json()] == ["SG-001"]

    inventory = api_client.get(
        "/api/v1/inventory",
        params={"resource_type": "EC2", "region": REGION, "search": "i-idle"},
    )
    assert inventory.status_code == 200
    assert [resource["resource_id"] for resource in inventory.json()] == ["i-idle"]

    costs = api_client.get("/api/v1/costs")
    assert costs.status_code == 200
    cost_report = costs.json()
    assert cost_report["scan_id"] == scan_id
    assert cost_report["cost_report"]["total_waste_findings"] == 4
    assert cost_report["cost_report"]["cost_explorer"]["service_breakdown"][0]["service"] == (
        "Amazon EC2"
    )
    assert {finding["rule_id"] for finding in cost_report["findings"]} >= {
        "COST-001",
        "COST-002",
        "COST-003",
    }

    dashboard = api_client.get("/api/v1/dashboard")
    assert dashboard.status_code == 200
    dashboard_data = dashboard.json()
    assert dashboard_data["total_resources"] == 3
    assert dashboard_data["high_critical_count"] == 1
    assert dashboard_data["open_findings_count"] == len(detail["findings"])
    assert dashboard_data["waste_findings_count"] == 4
    assert len(dashboard_data["recent_scan_trend"]) == 1
    assert dashboard_data["top_findings"][0]["severity"] == "HIGH"


def test_finding_patch_updates_status_notes_and_appends_audit(
    api_client: TestClient,
) -> None:
    created = _create_scan(api_client)
    findings = api_client.get(
        "/api/v1/findings",
        params={"scan_id": created["id"]},
    )
    finding_id = next(item["id"] for item in findings.json() if item["rule_id"] == "SG-001")

    updated = api_client.patch(
        f"/api/v1/findings/{finding_id}",
        json={
            "status": "ACKNOWLEDGED",
            "notes": "Reviewed by the network team.",
            "actor": "analyst@example.test",
        },
    )
    assert updated.status_code == 200, updated.text
    finding = updated.json()
    assert finding["status"] == "ACKNOWLEDGED"
    assert finding["notes"] == "Reviewed by the network team."
    assert len(finding["remediation_history"]) == 1
    history = finding["remediation_history"][0]
    assert history["previous_status"] == "OPEN"
    assert history["new_status"] == "ACKNOWLEDGED"
    assert history["action"] == "STATUS_AND_NOTES_UPDATED"
    assert history["actor"] == "analyst@example.test"
    assert history["notes"] == "Reviewed by the network team."

    listed = api_client.get(
        "/api/v1/findings",
        params={"scan_id": created["id"], "status": "ACKNOWLEDGED"},
    )
    assert [item["id"] for item in listed.json()] == [finding_id]


def test_inventory_and_cost_routes_accept_explicit_scan_id(
    api_client: TestClient,
) -> None:
    created = _create_scan(api_client)
    scan_id = created["id"]

    inventory = api_client.get("/api/v1/inventory", params={"scan_id": scan_id})
    costs = api_client.get("/api/v1/costs", params={"scan_id": scan_id})
    assert inventory.status_code == 200
    assert len(inventory.json()) == 3
    assert costs.status_code == 200
    assert costs.json()["scan_id"] == scan_id


def test_api_returns_not_found_and_validates_patch_payload(
    api_client: TestClient,
) -> None:
    assert api_client.get(f"/api/v1/scans/{UUID(int=0)}").status_code == 404
    assert api_client.get(f"/api/v1/findings/{UUID(int=0)}").status_code == 404
    assert api_client.patch(
        f"/api/v1/findings/{UUID(int=0)}",
        json={"actor": "operator"},
    ).status_code == 422


def test_disconnect_aws_credentials_removes_user_connection(
    api_client: TestClient,
) -> None:
    disconnected = api_client.delete("/api/v1/settings/aws-credentials")
    assert disconnected.status_code == 200
    assert disconnected.json() == {
        "connected": False,
        "message": "AWS connection disconnected.",
    }

    credentials = api_client.get("/api/v1/settings/aws-credentials")
    assert credentials.status_code == 200
    assert credentials.json()["has_aws_credentials"] is False
    assert credentials.json()["aws_access_key_id_preview"] is None

    scan = api_client.post(
        "/api/v1/scans",
        json={
            "regions": [REGION],
            "include_cost_explorer": False,
            "required_tags": ["Environment", "Owner"],
            "required_cost_tags": ["CostCenter", "Project"],
        },
    )
    assert scan.status_code == 400
    assert scan.json()["detail"] == "Connect your AWS account in Settings before running a scan."


def test_cross_user_scan_inventory_finding_and_settings_are_isolated(
    api_client: TestClient,
) -> None:
    foreign_user_id = UUID("00000000-0000-0000-0000-000000000002")
    foreign_scan_id = UUID("00000000-0000-0000-0000-000000000003")
    created = _create_scan(api_client)

    assert api_client.get(f"/api/v1/scans/{foreign_scan_id}").status_code == 404
    assert api_client.get(f"/api/v1/scans/{created['id']}").status_code == 200
    assert api_client.get("/api/v1/inventory", params={"scan_id": foreign_scan_id}).status_code == 404
    assert api_client.get("/api/v1/findings", params={"scan_id": foreign_scan_id}).status_code == 200
