from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_database_health_returns_meaningful_result() -> None:
    response = client.get("/api/v1/health/database")
    assert response.status_code == 200
    assert response.json()["status"] in {"ok", "error"}
