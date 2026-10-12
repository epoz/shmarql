"""SPARQL protocol proxy: ``/sparql`` (default profile) and ``/sparql/{key}``."""

from __future__ import annotations

from urllib.parse import parse_qs, urlencode

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse

from ..profiles import Profile
from ..sparql_client import SparqlError
from ..web import get_state

router = APIRouter(tags=["sparql"])

SPARQL_METHODS = ["GET", "POST"]


def _is_update(request: Request, body: bytes) -> bool:
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type == "application/sparql-update":
        return True
    if content_type == "application/x-www-form-urlencoded":
        return "update" in parse_qs(body.decode("utf-8", errors="replace"))
    return False


def _wants_html(request: Request) -> bool:
    accept = request.headers.get("accept", "")
    return "text/html" in accept


async def proxy_request(request: Request, profile: Profile, read_only: bool = False) -> Response:
    """Forward one SPARQL protocol request to ``profile``'s endpoint."""
    state = get_state(request)
    params = list(request.query_params.multi_items())
    body: bytes | None = None

    if request.method == "GET":
        names = {name for name, _ in params}
        if "update" in names:
            return PlainTextResponse("SPARQL Update requires POST", status_code=405)
        if "query" not in names:
            if _wants_html(request):
                # A browser visiting the endpoint: show the query editor instead.
                return RedirectResponse(
                    "/query?" + urlencode({"profile": profile.key}), status_code=303
                )
            return PlainTextResponse("Missing 'query' parameter", status_code=400)
    else:
        body = await request.body()
        if _is_update(request, body) and (read_only or not profile.allow_update):
            return PlainTextResponse(
                "SPARQL Update is not allowed for this profile", status_code=403
            )
        if not body and not any(name == "query" for name, _ in params):
            return PlainTextResponse("Missing query", status_code=400)

    try:
        upstream = await state.client.forward(
            profile, request.method, params, body, dict(request.headers)
        )
    except SparqlError as exc:
        return PlainTextResponse(str(exc), status_code=exc.status_code)
    return Response(
        content=upstream.content, status_code=upstream.status_code, headers=upstream.headers
    )


@router.api_route("/sparql", methods=SPARQL_METHODS, name="sparql_default")
async def sparql_default(request: Request) -> Response:
    profile = get_state(request).registry.default
    if profile is None:
        return PlainTextResponse("No default SPARQL profile configured", status_code=404)
    return await proxy_request(request, profile)


@router.api_route("/sparql/{key}", methods=SPARQL_METHODS, name="sparql_profile")
async def sparql_profile(request: Request, key: str) -> Response:
    profile = get_state(request).registry.by_key(key)
    if profile is None:
        return PlainTextResponse(f"Unknown SPARQL profile: {key}", status_code=404)
    return await proxy_request(request, profile)


@router.get("/api/profiles", name="profiles")
async def list_profiles(request: Request) -> JSONResponse:
    """All profiles (without upstream addresses), used by the query page autocomplete."""
    return JSONResponse(get_state(request).registry.public_list())
