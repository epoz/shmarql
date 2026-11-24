"""API of the LODEON story editor authentication: login and access tokens.

The editor login uses the username/password users of the editor user database: the OAuth2
password grant (``POST /token``) validates the credentials (bcrypt hashes) and returns a
signed, expiring JWT access token (HS256, ``sub`` = username) that is used as a bearer token
for the protected editor endpoints (Preview, Publish, ...).

Without editor users configured, the editor login is disabled: Preview is open and Publish
is disabled.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm

from ..auth import (
    User,
    authenticate_user,
    create_access_token,
    has_editor_users,
    user_from_bearer,
)
from ..config import Settings
from ..web import get_state, render

log = logging.getLogger("shmarql.lodeon")

router = APIRouter(tags=["auth"])

ARTEFACTS = "/api/artefacts"
oauth2_password_form = Depends(OAuth2PasswordRequestForm)


def problem(code: str, status: int, detail: str = "") -> JSONResponse:
    return JSONResponse(
        {"code": code, "status": status, "detail": detail or code},
        status_code=status,
        media_type="application/problem+json",
    )


# -- authentication ---------------------------------------------------------------------------
def _bearer(request: Request) -> str:
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer":
        return value.strip()
    # Browser sessions may carry the access token in the ``access_token`` cookie, as the
    # IC server does; fall back to it.
    return request.cookies.get("access_token", "").strip()


def editor_auth_enabled(settings: Settings) -> bool:
    """Editor login is enabled when the editor user database holds at least one user."""
    return has_editor_users(settings)


def authenticated_method(request: Request) -> str | None:
    """The editor login method that authenticated the request, or ``None``."""
    settings = get_state(request).settings
    state = editor_auth_state(settings, _bearer(request))
    return state["method"] if state["authenticated"] else None


def authenticated(request: Request) -> bool:
    return authenticated_method(request) is not None


def editor_auth_state(settings: Settings, bearer_token: str) -> dict[str, Any]:
    """The editor authentication state of a bearer token against the given settings."""
    enabled = editor_auth_enabled(settings)
    authenticated = False
    user: User | None = None
    method: str | None = None
    if enabled:
        user = user_from_bearer(settings.secret_key, bearer_token, settings.users_db_path)
        if user is not None:
            authenticated = True
            method = "credentials"
    return {"enabled": enabled, "authenticated": authenticated, "user": user, "method": method}


def auth_status(request: Request, is_authenticated: bool | None = None) -> dict[str, Any]:
    settings = get_state(request).settings
    state = editor_auth_state(settings, _bearer(request))
    is_auth = is_authenticated if is_authenticated is not None else state["authenticated"]
    status_payload: dict[str, Any] = {
        "authEnabled": state["enabled"],
        "authenticated": is_auth,
        "methods": {
            "credentials": has_editor_users(settings),
            "externalProviders": [],
        },
        "capabilities": {"publish": is_auth},
    }
    if is_auth:
        status_payload["loginMethod"] = state["method"]
        if state["user"] is not None:
            status_payload["username"] = state["user"].username
    return status_payload


def auth_context(request: Request) -> dict[str, Any]:
    """The editor authentication state, for rendering the login/logout UI of the site.

    Returns the values the templates of the main application need: whether the editor login
    is enabled, whether the current visitor is authenticated, the username of the logged-in
    user (when known) and whether the username/password login form should be offered.
    """
    settings = get_state(request).settings
    state = editor_auth_state(settings, _bearer(request))
    return {
        "auth_enabled": state["enabled"],
        "authenticated": state["authenticated"],
        "username": state["user"].username if state["user"] is not None else None,
        "login_method": state["method"],
        "auth_credentials_login": state["enabled"],
    }


@router.get("/login")
async def login_page(request: Request) -> Response:
    """The site login page with the username/password form (linked from the site header)."""
    if authenticated(request):
        return RedirectResponse("/", status_code=307)
    return render(request, "login.html")


@router.get("/api/auth/status")
async def get_auth_status(request: Request) -> JSONResponse:
    return JSONResponse(auth_status(request))


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
        return problem("auth.login_failed", 404, "editor users are not configured")
    user = authenticate_user(form_data.username, form_data.password, db_path=settings.users_db_path)
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
    # The JWT access token lives in the browser cookie; discard it.
    return JSONResponse(auth_status(request, False))
