import jwt
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from urllib.parse import urlencode

import httpx
from fastapi.responses import RedirectResponse

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import get_current_user
from app.config.settings import get_settings
from app.database.models import ScanSetting, User
from app.database.session import get_db

router = APIRouter(prefix="/auth", tags=["authentication"])
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    auth_provider: str
    is_active: bool
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


def create_access_token(user: User) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user.id), "email": user.email, "exp": expires},
        settings.app_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def profile(user: User) -> UserProfile:
    return UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        auth_provider=user.auth_provider,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = str(request.email).strip().lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")
    user = User(
        id=uuid4(),
        email=email,
        full_name=request.full_name.strip(),
        hashed_password=password_context.hash(request.password),
        auth_provider="local",
        provider_sub=None,
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.add(ScanSetting(
        user_id=user.id,
        regions=[],
        include_cost_explorer=True,
        cpu_threshold=5.0,
        lookback_days=7,
        required_tags=["Environment", "Owner"],
        required_cost_tags=["CostCenter", "Project"],
    ))
    db.commit()
    db.refresh(user)
    return AuthResponse(access_token=create_access_token(user), user=profile(user))


@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = str(request.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if (
        user is None
        or not user.is_active
        or not user.hashed_password
        or not password_context.verify(request.password, user.hashed_password)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    return AuthResponse(access_token=create_access_token(user), user=profile(user))


@router.get("/me", response_model=UserProfile)
def me(current_user: User = Depends(get_current_user)) -> UserProfile:
    return profile(current_user)


def _oauth_state(provider: str) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode(
        {"provider": provider, "purpose": "oauth_state", "exp": expires},
        settings.app_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def _validate_oauth_state(state: str, provider: str) -> None:
    settings = get_settings()
    try:
        payload = jwt.decode(
            state,
            settings.app_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("purpose") != "oauth_state" or payload.get("provider") != provider:
            raise jwt.InvalidTokenError("OAuth state provider mismatch")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OAuth state.") from exc


def _oauth_error_redirect(message: str) -> RedirectResponse:
    settings = get_settings()
    return RedirectResponse(
        url=f"{settings.frontend_url.rstrip('/')}/login?{urlencode({'oauth_error': message})}",
        status_code=status.HTTP_302_FOUND,
    )


def _find_or_create_oauth_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    provider: str,
    provider_sub: str,
) -> User:
    normalized_email = email.strip().lower()
    user = db.scalar(
        select(User).where(
            (User.provider_sub == provider_sub) & (User.auth_provider == provider)
        )
    )
    if user is None:
        user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        user = User(
            id=uuid4(),
            email=normalized_email,
            full_name=full_name.strip() or normalized_email,
            hashed_password=None,
            auth_provider=provider,
            provider_sub=provider_sub,
            is_active=True,
        )
        db.add(user)
        db.flush()
        db.add(ScanSetting(
            user_id=user.id,
            regions=[],
            include_cost_explorer=True,
            cpu_threshold=5.0,
            lookback_days=7,
            required_tags=["Environment", "Owner"],
            required_cost_tags=["CostCenter", "Project"],
        ))
    else:
        user.auth_provider = provider
        user.provider_sub = provider_sub
        if not user.full_name and full_name.strip():
            user.full_name = full_name.strip()
    db.commit()
    db.refresh(user)
    return user


@router.get("/providers")
def oauth_providers() -> dict[str, bool]:
    settings = get_settings()
    return {
        "google": bool(settings.google_client_id and settings.google_client_secret),
    }


@router.get("/oauth/google/login")
def google_login() -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.",
        )
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": _oauth_state("google"),
    })
    return RedirectResponse(
        url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}",
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/oauth/google/callback")
async def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    settings = get_settings()
    if error:
        return _oauth_error_redirect(error)
    if not code or not state:
        return _oauth_error_redirect("Missing Google OAuth code or state.")
    try:
        _validate_oauth_state(state, "google")
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_response.raise_for_status()
            access_token = token_response.json()["access_token"]
            profile_response = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile_response.raise_for_status()
            claims = profile_response.json()
    except (httpx.HTTPError, KeyError, ValueError):
        return _oauth_error_redirect("Google OAuth sign-in failed.")
    except HTTPException:
        return _oauth_error_redirect("Invalid or expired Google OAuth state.")

    email = claims.get("email")
    provider_sub = claims.get("sub")
    if not email or not provider_sub:
        return _oauth_error_redirect("Google did not return an email and subject.")
    user = _find_or_create_oauth_user(
        db,
        email=str(email),
        full_name=str(claims.get("name") or claims.get("given_name") or email),
        provider="google",
        provider_sub=str(provider_sub),
    )
    cloudsentry_token = create_access_token(user)
    return RedirectResponse(
        url=f"{settings.frontend_url.rstrip('/')}/login?{urlencode({'token': cloudsentry_token})}",
        status_code=status.HTTP_302_FOUND,
    )
