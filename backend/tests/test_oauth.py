from urllib.parse import parse_qs, urlparse
from uuid import UUID

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.v1.auth as auth_module
from app.database.models import Base, ScanSetting, User
from app.database.session import get_db
from app.main import app


class MockResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("HTTP error")

    def json(self) -> dict:
        return self.payload


class MockAsyncClient:
    claims: dict

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, url: str, **kwargs):
        return MockResponse({"access_token": "provider-access-token"})

    async def get(self, url: str, **kwargs):
        return MockResponse(self.claims)


@pytest.fixture
def oauth_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        with test_session() as db:
            yield db

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-test-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-test-secret")
    monkeypatch.setenv("AWS_COGNITO_DOMAIN", "https://test.auth.us-east-1.amazoncognito.com")
    monkeypatch.setenv("AWS_COGNITO_CLIENT_ID", "cognito-test-id")
    auth_module.get_settings.cache_clear()
    app.dependency_overrides[get_db] = override_get_db
    MockAsyncClient.claims = {}

    try:
        with TestClient(app) as client:
            yield client, test_session
    finally:
        app.dependency_overrides.clear()
        auth_module.get_settings.cache_clear()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.mark.parametrize(
    ("provider", "login_path"),
    [
        ("google", "/api/v1/auth/oauth/google/login"),
        ("aws", "/api/v1/auth/oauth/aws/login"),
    ],
)
def test_oauth_login_redirect_contains_valid_state(
    oauth_client,
    provider: str,
    login_path: str,
) -> None:
    oauth_client, _ = oauth_client
    response = oauth_client.get(login_path, follow_redirects=False)
    assert response.status_code == 302
    location = urlparse(response.headers["location"])
    query = parse_qs(location.query)
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["openid email profile"]
    assert "state" in query

    settings = auth_module.get_settings()
    payload = jwt.decode(
        query["state"][0],
        settings.app_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    assert payload["purpose"] == "oauth_state"
    assert payload["provider"] == provider


def test_google_callback_creates_user_setting_and_mints_jwt(
    oauth_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    oauth_client, test_session = oauth_client
    MockAsyncClient.claims = {
        "sub": "google-sub-123",
        "email": "google.user@gmail.com",
        "name": "Google User",
    }
    monkeypatch.setattr(auth_module.httpx, "AsyncClient", MockAsyncClient)

    login = oauth_client.get(
        "/api/v1/auth/oauth/google/login",
        follow_redirects=False,
    )
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    callback = oauth_client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"code": "google-code", "state": state},
        follow_redirects=False,
    )

    assert callback.status_code == 302
    redirect = urlparse(callback.headers["location"])
    token = parse_qs(redirect.query)["token"][0]
    me = oauth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["full_name"] == "Google User"

    with test_session() as db:
        user = db.scalar(select(User).where(User.email == "google.user@gmail.com"))
        assert user is not None
        assert user.auth_provider == "google"
        assert user.provider_sub == "google-sub-123"
        assert db.scalar(select(ScanSetting).where(ScanSetting.user_id == user.id)) is not None


def test_aws_callback_creates_user_setting_and_mints_jwt(
    oauth_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    oauth_client, test_session = oauth_client
    MockAsyncClient.claims = {
        "sub": "aws-sub-456",
        "email": "aws.user@gmail.com",
        "name": "AWS User",
    }
    monkeypatch.setattr(auth_module.httpx, "AsyncClient", MockAsyncClient)

    login = oauth_client.get(
        "/api/v1/auth/oauth/aws/login",
        follow_redirects=False,
    )
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    callback = oauth_client.get(
        "/api/v1/auth/oauth/aws/callback",
        params={"code": "aws-code", "state": state},
        follow_redirects=False,
    )

    assert callback.status_code == 302
    redirect = urlparse(callback.headers["location"])
    token = parse_qs(redirect.query)["token"][0]
    me = oauth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["full_name"] == "AWS User"

    with test_session() as db:
        user = db.scalar(select(User).where(User.email == "aws.user@gmail.com"))
        assert user is not None
        assert user.auth_provider == "aws"
        assert user.provider_sub == "aws-sub-456"
        assert db.scalar(select(ScanSetting).where(ScanSetting.user_id == user.id)) is not None
