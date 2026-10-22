"""API of the LODEON story editor served at ``/lodeon/``.

The editor is LODEON's browser application without the AI Assistant. It talks to
the same endpoints as in lodeon-core; this module provides them on top of shmarql:

* ``GET  /api/config``                         browser configuration (see ``lodeon.editor_config``)
* ``GET  /api/auth/status``, ``POST /api/auth/login``, ``POST /api/auth/logout``
* ``GET  /api/welcome-story``                  the initial project (``.lodeon.zip``)
* ``GET  /api/knowledge-graphs/{ref}/sparnatural``  visual query builder configuration
* ``POST /api/embed/metadata``                 titles of allow-listed embed URLs
* ``POST /api/preview``, ``GET|DELETE /api/artefacts/{id}``  rendered previews
* ``POST /api/publish``                        write a story into the documentation

``GET /lodeon/`` renders the editor inside shmarql's page template (site header and
footer); the rest of ``/lodeon/`` is the built editor, served as static files.

``/api/sparql/{ref}`` and ``/api/explorer/{ref}/expand`` come from ``lodeon_api``.

Authentication: with ``LODEON_EDITOR_TOKEN`` set, a login with that token yields a
signed, expiring session (a bearer token) that Preview and Publish require. Without
a token Preview is open and Publish is disabled.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException

from ..lodeon.editor_config import EditorConfig
from ..lodeon.embed_metadata import metadata_response
from ..lodeon.publishing import (
    INDEX,
    PreviewStore,
    StoryError,
    StoryPayload,
    parse_json_payload,
    parse_multipart_payload,
    publish_story,
    published_package_path,
)
from ..lodeon.welcome import welcome_story_zip
from ..web import EDITOR_DIR, get_state, render

log = logging.getLogger("shmarql.lodeon")

router = APIRouter(tags=["lodeon-editor"])

ARTEFACTS = "/api/artefacts"
SESSION_CONTEXT = b"shmarql-lodeon-editor-session"


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
    return value.strip() if scheme.lower() == "bearer" else ""


def authenticated(request: Request) -> bool:
    token = get_state(request).settings.lodeon_editor_token
    return bool(token) and valid_session(token, _bearer(request))


def auth_status(request: Request, is_authenticated: bool | None = None) -> dict[str, Any]:
    token_configured = bool(get_state(request).settings.lodeon_editor_token)
    if is_authenticated is None:
        is_authenticated = authenticated(request)
    status: dict[str, Any] = {
        "authEnabled": token_configured,
        "authenticated": is_authenticated,
        "methods": {"token": token_configured, "externalProviders": []},
        "capabilities": {"publish": is_authenticated},
    }
    if is_authenticated:
        status["loginMethod"] = "token"
    return status


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


@router.post("/api/auth/logout")
async def logout(request: Request) -> JSONResponse:
    # Sessions are stateless; the browser discards its copy.
    return JSONResponse(auth_status(request, False))


# -- the editor page ----------------------------------------------------------------------------
_ASSET = re.compile(r"<(script|link)\b([^>]*)>", re.IGNORECASE)
_ATTR = re.compile(r'(\w+)="([^"]*)"')


@lru_cache(maxsize=4)
def _editor_assets(index: Path, mtime: float) -> dict[str, list[str]]:
    """Script and stylesheet URLs of the Vite build, taken from its ``index.html``."""
    assets: dict[str, list[str]] = {"scripts": [], "styles": [], "preloads": []}
    for tag, attributes in _ASSET.findall(index.read_text(encoding="utf-8")):
        attrs = dict(_ATTR.findall(attributes))
        if tag.lower() == "script" and attrs.get("type") == "module" and attrs.get("src"):
            assets["scripts"].append(attrs["src"])
        elif attrs.get("rel") == "stylesheet" and attrs.get("href"):
            assets["styles"].append(attrs["href"])
        elif attrs.get("rel") == "modulepreload" and attrs.get("href"):
            assets["preloads"].append(attrs["href"])
    return assets


def editor_assets(directory: Path = EDITOR_DIR) -> dict[str, list[str]]:
    index = directory / "index.html"
    if not index.is_file():
        return {"scripts": [], "styles": [], "preloads": []}
    return _editor_assets(index, index.stat().st_mtime)


@router.get("/lodeon/", include_in_schema=False)
async def editor_page(request: Request) -> Response:
    response = render(request, "lodeon_editor.html", {"editor": editor_assets()})
    response.headers["Cache-Control"] = "no-cache"
    return response


# -- configuration ------------------------------------------------------------------------------
def editor_config(request: Request) -> EditorConfig:
    state = get_state(request)
    return EditorConfig(state.markdown.story_renderer, state.registry, state.display_for)


@router.get("/api/config")
async def get_config(request: Request) -> Response:
    return JSONResponse(editor_config(request).build(), headers={"Cache-Control": "no-store"})


@router.get("/api/welcome-story")
async def welcome_story(request: Request) -> Response:
    state = get_state(request)
    content = welcome_story_zip(state.registry.default, state.settings.site_title)
    return Response(content, media_type="application/zip", headers={"Cache-Control": "no-store"})


@router.get("/api/knowledge-graphs/{ref}/sparnatural")
async def sparnatural_config(request: Request, ref: str) -> Response:
    profile = get_state(request).registry.get(ref)
    if profile is None or profile.sparnatural is None or not profile.sparnatural.is_file():
        return problem("sparnatural.profile_unavailable", 404)
    return FileResponse(profile.sparnatural, media_type="text/turtle")


@router.post("/api/embed/metadata")
async def embed_metadata(request: Request) -> JSONResponse:
    state = get_state(request)
    if state.settings.lodeon_editor_token and not authenticated(request):
        return problem("auth.required", 401)
    try:
        payload = await request.json()
    except (ValueError, json.JSONDecodeError):
        return problem("embed.metadata.request_invalid", 400)
    urls = payload.get("urls") if isinstance(payload, dict) else None
    if not isinstance(urls, list):
        return problem("embed.metadata.urls_invalid", 400)
    nodes = state.markdown.story_renderer.config.get("nodes") or {}
    embed = nodes.get("embed") if isinstance(nodes.get("embed"), dict) else {}
    return JSONResponse(await metadata_response(state.http, urls[:50], embed))


# -- preview and publish ---------------------------------------------------------------------
async def read_story(request: Request, too_large_code: str) -> StoryPayload:
    """Parse a JSON or multipart Preview/Publish request."""
    limit = get_state(request).settings.lodeon_max_upload_mb * 1024 * 1024
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > limit:
        raise StoryError(too_large_code, 413)
    content_type = request.headers.get("content-type", "")
    if content_type.lower().startswith("multipart/form-data"):
        try:
            form = await request.form(max_files=1000, max_fields=10, max_part_size=limit)
        except MultiPartException as exc:
            raise StoryError("renderer.asset_payload_invalid", detail=str(exc)) from exc
        try:
            files: dict[str, bytes] = {}
            payload_text = ""
            for name, value in form.multi_items():
                if isinstance(value, UploadFile):
                    files[name] = await value.read()
                elif name == "payload":
                    payload_text = value
            return parse_multipart_payload(payload_text, files)
        finally:
            await form.close()
    body = await request.body()
    if len(body) > limit:
        raise StoryError(too_large_code, 413)
    return parse_json_payload(body)


def preview_store(request: Request) -> PreviewStore:
    settings = get_state(request).settings
    return PreviewStore(settings.lodeon_preview_path, settings.lodeon_preview_ttl)


@router.post("/api/preview")
async def create_preview(request: Request) -> Response:
    state = get_state(request)
    if state.settings.lodeon_editor_token and not authenticated(request):
        return problem("preview.login_required", 401)
    try:
        story = await read_story(request, "preview.payload_too_large")
        preview_id = preview_store(request).create(story)
    except StoryError as exc:
        return problem(exc.code, exc.status, exc.detail)
    return JSONResponse({"id": preview_id, "url": f"{ARTEFACTS}/{preview_id}/"})


@router.get(ARTEFACTS + "/{preview_id}")
async def preview_redirect(preview_id: str) -> RedirectResponse:
    return RedirectResponse(f"{ARTEFACTS}/{preview_id}/", status_code=307)


@router.get(ARTEFACTS + "/{preview_id}/{path:path}")
async def preview_page(request: Request, preview_id: str, path: str = "") -> Response:
    directory = preview_store(request).directory(preview_id)
    if directory is None:
        return problem("preview.not_found", 404)
    if path and path != INDEX:
        target = (directory / path).resolve()
        if not target.is_relative_to(directory.resolve()) or not target.is_file():
            return problem("preview.not_found", 404)
        return FileResponse(target)
    state = get_state(request)
    page = state.markdown.render((directory / INDEX).read_text(encoding="utf-8"), "Preview")
    response = render(request, "doc.html", {"page": page, "nav": [], "current_url": ""})
    # Previews are drafts: keep them out of search engines and caches.
    response.headers["X-Robots-Tag"] = "noindex"
    response.headers["Cache-Control"] = "no-store"
    return response


@router.delete(ARTEFACTS + "/{preview_id}")
async def delete_preview(request: Request, preview_id: str) -> Response:
    state = get_state(request)
    if state.settings.lodeon_editor_token and not authenticated(request):
        return problem("preview.login_required", 401)
    try:
        deleted = preview_store(request).delete(preview_id)
    except StoryError as exc:
        return problem(exc.code, exc.status, exc.detail)
    return JSONResponse({"id": preview_id, "deleted": deleted})


@router.post("/api/publish")
async def publish(request: Request) -> Response:
    state = get_state(request)
    settings = state.settings
    if not settings.lodeon_editor_token:
        return problem("auth.publish_access_denied", 403, "set LODEON_EDITOR_TOKEN to publish")
    if not authenticated(request):
        return problem("publish.login_required", 401)
    story_root = state.docs.root / settings.lodeon_story_dir
    try:
        story = await read_story(request, "publish.payload_too_large")
        publish_story(story_root, story)
    except StoryError as exc:
        return problem(exc.code, exc.status, exc.detail)
    except OSError as exc:
        log.exception("Publishing story %r failed", getattr(exc, "filename", ""))
        return problem("publish.failed", 500, str(exc))
    url = state.docs.url_of(story_root / story.slug / INDEX)
    log.info("Published story %s at %s", story.slug, url)
    response: dict[str, Any] = {
        "slug": story.slug,
        "title": story.title or story.slug,
        "path": f"{settings.lodeon_story_dir}/{story.slug}/{INDEX}",
        "url": url,
    }
    package = published_package_path(story)
    if package:
        response["packageUrl"] = url + package
    return JSONResponse(response)
