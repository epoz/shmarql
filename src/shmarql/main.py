"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings, get_settings
from .docs_site import DocsSite
from .entity.settings import DisplaySettings
from .lodeon import StoryRenderer
from .markdown_render import MarkdownRenderer
from .profiles import ProfileRegistry
from .routes import lodeon_api, lodeon_editor, pages, sparql
from .sparql_client import SparqlClient
from .web import EDITOR_DIR, STATIC_DIR, AppState, create_templates

log = logging.getLogger("shmarql")


def create_app(
    settings: Settings | None = None,
    registry: ProfileRegistry | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """Build the application.

    ``registry`` and ``transport`` are injectable for tests; by default the profiles
    are read from ``settings.profiles_path`` and real HTTP is used.
    """
    settings = settings or get_settings()
    if registry is None:
        registry = ProfileRegistry.from_yaml(settings.profiles_path, settings.default_profile)
    elif settings.default_profile:
        registry = ProfileRegistry(
            list(registry), settings.default_profile, display=registry.display
        )
    client = SparqlClient(
        timeout=settings.sparql_timeout,
        user_agent=settings.sparql_user_agent,
        transport=transport,
    )
    http = httpx.AsyncClient(transport=transport)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await client.aclose()
        await http.aclose()

    app = FastAPI(
        title=settings.site_title,
        version=__version__,
        debug=settings.debug,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.shmarql = AppState(
        settings=settings,
        registry=registry,
        client=client,
        docs=DocsSite(settings.docs_path),
        markdown=MarkdownRenderer(StoryRenderer(settings.lodeon_config_path)),
        display=DisplaySettings().merged(registry.display),
        http=http,
    )
    app.state.templates = create_templates()

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )

    # LODEON assets: a configured directory replaces the bundled copy.
    if settings.lodeon_assets_path:
        app.mount(
            "/static/lodeon",
            StaticFiles(directory=settings.lodeon_assets_path),
            name="lodeon_assets",
        )
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    app.include_router(sparql.router)
    app.include_router(lodeon_api.router)
    if settings.lodeon_editor_enabled:
        # /lodeon/ itself is rendered in the site template by lodeon_editor.editor_page.
        app.include_router(lodeon_editor.router)
        app.add_api_route("/lodeon", _editor_redirect, methods=["GET"], include_in_schema=False)
        if (EDITOR_DIR / "index.html").is_file():
            app.mount("/lodeon", StaticFiles(directory=EDITOR_DIR), name="lodeon_editor")
        else:
            log.warning("LODEON editor is not built (run `npm run build` in editor/)")
        if not settings.lodeon_editor_token:
            log.info("LODEON editor: set LODEON_EDITOR_TOKEN to enable publishing stories")
    app.include_router(pages.router)
    # The documentation catch-all must come last.
    app.add_api_route("/", pages.docs_page, methods=["GET"], include_in_schema=False)
    app.add_api_route("/{path:path}", pages.docs_page, methods=["GET"], include_in_schema=False)

    log.info(
        "%s ready: %d profile(s), default=%s, docs=%s",
        settings.site_title,
        len(registry),
        registry.default.name if registry.default else None,
        settings.docs_path,
    )
    return app


async def _editor_redirect() -> RedirectResponse:
    return RedirectResponse("/lodeon/", status_code=307)


def app_factory() -> FastAPI:
    """Entry point for ``uvicorn --factory shmarql.main:app_factory``."""
    return create_app()
