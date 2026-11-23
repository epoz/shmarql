"""API of the LODEON story editor authentication: login and sessions.

The editor login comes in two flavors:

* with ``LODEON_EDITOR_TOKEN`` set, a login with that token yields a signed, expiring
  session (a bearer token) that Preview and Publish require;
* with editor users configured, editors can log in with a username/password (the OAuth2
  password grant) and use the returned JWT access token as a bearer token.

Without a token (or users) login is disabled: Preview is open and Publish is disabled.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm

from ..auth import authenticate_user, create_access_token, get_user_from_token, has_editor_users
from ..config import Settings
from ..web import get_state

log = logging.getLogger("shmarql.lodeon")

router = APIRouter(tags=["auth"])

ARTEFACTS = "/api/artefacts"
SESSION_CONTEXT = b"shmarql-lodeon-editor-session"
oauth2_password_form = Depends(OAuth2PasswordRequestForm)


def problem(code: str, status: int, detail: str = "") -> JSONResponse:
    return JSONResponse(
        {"code": code, "status": status, "detail": detail or code},
        status_code=status,
        media_type="application/problem+json",
    )


# -- authentication ---------------------------------------------------------------------------
def _signature(token: str, expiry: int) -> str:
    key = hashlib.sha256(SESSION_CONTEXT + token.encode()).digest()
    return hmac.new(key, str(expiry).encode(), hashlib.sha256).hexdigest()


def create_session(token: str, ttl: int, now: float | None = None) -> str:
    expiry = int((now if now is not None else time.time()) + ttl)
    return f"{expiry}.{_signature(token, expiry)}"


def valid_session(token: str, session: str, now: float | None = None) -> bool:
    expiry_text, _, signature = session.partition(".")
    if not token or not expiry_text.isdigit() or not signature:
        return False
    expiry = int(expiry_text)
    if expiry < (now if now is not None else time.time()):
        return False
    return hmac.compare_digest(signature, _signature(token, expiry))


def _bearer(request: Request) -> str:
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer":
        return value.strip()
    # Browser sessions may carry the access token in the ``access_token`` cookie, as the
    # IC server does; fall back to it.
    return request.cookies.get("access_token", "").strip()


def authenticated_method(request: Request) -> str | None:
    """The editor login method that authenticated the request, or ``None``."""
    settings = get_state(request).settings
    token = settings.lodeon_editor_token
    bearer = _bearer(request)
    if token and valid_session(token, bearer):
        return "token"
    if bearer:
        try:
            get_user_from_token(
                bearer, secret_key=settings.secret_key, db_path=settings.users_db_path
            )
        except HTTPException:
            return None
        return "credentials"
    return None


def authenticated(request: Request) -> bool:
    return authenticated_method(request) is not None


def editor_auth_enabled(settings: Settings) -> bool:
    """Editor login is enabled by a static token or by a user database with users."""
    return bool(settings.lodeon_editor_token) or has_editor_users(settings)


def auth_status(request: Request, is_authenticated: bool | None = None) -> dict[str, Any]:
    settings = get_state(request).settings
    auth_enabled = editor_auth_enabled(settings)
    if is_authenticated is None:
        is_authenticated = authenticated(request)
    status_payload: dict[str, Any] = {
        "authEnabled": auth_enabled,
        "authenticated": is_authenticated,
        "methods": {
            "token": bool(settings.lodeon_editor_token),
            "credentials": has_editor_users(settings),
            "externalProviders": [],
        },
        "capabilities": {"publish": is_authenticated},
    }
    if is_authenticated:
        status_payload["loginMethod"] = authenticated_method(request)
    return status_payload


@router.get("/api/auth/status")
async def get_auth_status(request: Request) -> JSONResponse:
    return JSONResponse(auth_status(request))


@router.post("/api/auth/login")
async def login(request: Request) -> JSONResponse:
    settings = get_state(request).settings
    if not settings.lodeon_editor_token:
        return problem("auth.login_failed", 404, "token login is not configured")
    try:
        payload = await request.json()
    except (ValueError, json.JSONDecodeError):
        payload = None
    token = payload.get("token") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        return problem("auth.login_payload_invalid", 400)
    if not secrets.compare_digest(token.encode(), settings.lodeon_editor_token.encode()):
        return problem("auth.invalid_token", 401)
    session = create_session(settings.lodeon_editor_token, settings.lodeon_editor_session_ttl)
    return JSONResponse({**auth_status(request, True), "session": session})


@router.post("/token")
async def login_for_access_token(
    request: Request, form_data: OAuth2PasswordRequestForm = oauth2_password_form
) -> JSONResponse:
    """Exchange an OAuth2 username/password login for a signed access token.

    The same flow as the one of the IC server: the credentials are validated against the
    editor user database (bcrypt hashes) and a JWT access token (HS256, ``sub`` = username,
    expiring) is returned, to be used as a bearer token for the protected editor endpoints.
    """
    settings = get_state(request).settings
    if not editor_auth_enabled(settings):
        return problem("auth.login_failed", 404, "token login is not configured")
    user = authenticate_user(
        form_data.username, form_data.password, db_path=settings.users_db_path
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        {"sub": user.username},
        secret_key=settings.secret_key,
        expires_delta=timedelta(days=settings.access_token_expire_days),
    )
    if request.cookies.get("return_url"):
        response = JSONResponse(
            {
                "access_token": access_token,
                "token_type": "bearer",
                "return_url": request.cookies.get("return_url"),
            }
        )
        response.delete_cookie("return_url")
        return response
    return JSONResponse({"access_token": access_token, "token_type": "bearer"})


@router.post("/api/auth/logout")
async def logout(request: Request) -> JSONResponse:
    # Sessions are stateless; the browser discards its copy.
    return JSONResponse(auth_status(request, False))
