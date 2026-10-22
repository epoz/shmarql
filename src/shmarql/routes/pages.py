"""HTML pages: the query editor, the entity viewer, and Markdown documentation."""

from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse, RedirectResponse, Response

from ..entity.i18n import preferred_language
from ..entity.negotiation import negotiate, serialize
from ..entity.source import EntitySource, ResourceNotFound
from ..entity.uri_utils import shorten_uri
from ..entity.view import build_entity_view
from ..web import get_state, render

log = logging.getLogger("shmarql.pages")

router = APIRouter()

DEFAULT_QUERY = "SELECT * WHERE {\n  ?s ?p ?o .\n}\nLIMIT 10\n"


# -- Query editor ---------------------------------------------------------------------------
@router.get("/query", name="query_page")
async def query_page(
    request: Request,
    query: str = Query(DEFAULT_QUERY),
    profile: str = Query(""),
):
    state = get_state(request)
    selected = state.registry.get(profile) or state.registry.default
    return render(
        request,
        "query.html",
        {
            "query": query,
            "profiles": state.registry.public_list(),
            "selected": selected.public_dict(selected is state.registry.default)
            if selected
            else None,
        },
    )


# -- Entity viewer --------------------------------------------------------------------------
@router.get("/entity", name="entity")
async def entity_page(
    request: Request,
    uri: str = Query(""),
    profile: str = Query(""),
    format: str = Query(""),  # noqa: A002 - mirrors ldview's ?format= parameter
):
    state = get_state(request)
    uri = uri.strip()
    if not uri:
        return render(request, "entity_lookup.html", {"profiles": state.registry.public_list()})

    target = state.registry.get(profile) if profile else None
    target = target or state.registry.for_uri(uri) or state.registry.default
    if target is None:
        return render(request, "error.html", {"message_key": "error.no_profile", "uri": uri}, 404)

    display = state.display_for(target)
    source = EntitySource(state.client, target, display)
    try:
        graph = await source.get_rdf_for_uri(uri)
    except ValueError as exc:
        return render(request, "error.html", {"message": str(exc), "uri": uri}, 400)
    except ResourceNotFound as exc:
        return render(
            request,
            "error.html",
            {"message_key": "error.not_found", "error": str(exc), "uri": uri},
            404,
        )

    rdf_format = negotiate(format, request.headers.get("accept"))
    if rdf_format:
        content, content_type = serialize(graph, rdf_format)
        return Response(content, media_type=None, headers={"content-type": content_type})

    settings = state.settings
    lang = preferred_language(
        request.headers.get("accept-language"),
        settings.supported_languages,
        settings.default_language,
    )
    view = await build_entity_view(
        source,
        graph,
        uri,
        preferred_lang=lang,
        query_link=lambda q, _title: state.query_href(q, target),
    )
    view.update(
        {
            "profile": target.public_dict(target is state.registry.default),
            "uri_href": lambda u: state.entity_href(u, target),
            "shorten_uri": lambda u: shorten_uri(u, display.namespaces),
            "skolem_pattern": display.skolem_uri_pattern,
            "current_lang": lang,
            "format_links": [
                (name, "/entity?" + urlencode({**request.query_params, "format": key}))
                for key, name in (("turtle", "Turtle"), ("json-ld", "JSON-LD"), ("xml", "RDF/XML"))
            ],
        }
    )
    return render(request, "entity.html", view)


# -- Documentation (catch-all, registered last) ----------------------------------------------
async def docs_page(request: Request, path: str = ""):
    state = get_state(request)
    resolution = state.docs.resolve(path)
    if resolution.kind == "redirect":
        return RedirectResponse(resolution.location, status_code=301)
    if resolution.kind == "file" and resolution.path:
        return FileResponse(resolution.path)
    if resolution.kind == "markdown" and resolution.path:
        text = resolution.path.read_text(encoding="utf-8")
        page = state.markdown.render(text, fallback_title=resolution.path.stem)
        return render(
            request,
            "doc.html",
            {
                "page": page,
                "nav": state.docs.nav(),
                "current_url": state.docs.url_of(resolution.path),
            },
        )
    if path in ("", "/"):
        # No documentation configured: show a small built-in home page.
        return render(request, "home.html", {"profiles": state.registry.public_list()})
    return render(
        request, "error.html", {"message": "404 - Page not found", "uri": "/" + path}, 404
    )
