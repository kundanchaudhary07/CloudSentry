from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.config.settings import Settings
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


def test_production_settings_reject_placeholder_secret() -> None:
    with pytest.raises(ValidationError, match="APP_SECRET_KEY must be configured"):
        Settings(app_env="production", app_secret_key="change-me-in-production")
