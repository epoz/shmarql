"""Shared application state and template helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import Request
from fastapi.templating import Jinja2Templates
from markupsafe import Markup

from . import __version__
from .config import Settings
from .docs_site import DocsSite
from .entity.i18n import preferred_language, translator
from .entity.settings import DisplaySettings
from .markdown_render import MarkdownRenderer
from .profiles import Profile, ProfileRegistry
from .sparql_client import SparqlClient

PACKAGE_DIR = Path(__file__).parent
TEMPLATES_DIR = PACKAGE_DIR / "templates"
STATIC_DIR = PACKAGE_DIR / "static"
# The built LODEON story editor (``npm run build`` in ``editor/``), served at /lodeon/.
EDITOR_DIR = PACKAGE_DIR / "lodeon_editor"


@dataclass
class AppState:
    settings: Settings
    registry: ProfileRegistry
    client: SparqlClient
    docs: DocsSite
    markdown: MarkdownRenderer
    display: DisplaySettings
    # General-purpose HTTP client (e.g. embed metadata lookups for the editor).
    http: httpx.AsyncClient

    def display_for(self, profile: Profile) -> DisplaySettings:
        return self.display.merged(profile.display)

    def entity_href(self, uri: str, profile: Profile | None = None) -> str:
        """Link to the entity view for ``uri``; profiles claiming the URI prefix win."""
        if not uri:
            return "#"
        target = self.registry.for_uri(uri) or profile or self.registry.default
        params = {"uri": uri}
        if target is not None:
            params["profile"] = target.key
        return "/entity?" + urlencode(params)

    def query_href(self, query: str, profile: Profile | None = None) -> str:
        params = {"query": query}
        if profile is not None:
            params["profile"] = profile.key
        return "/query?" + urlencode(params)


def get_state(request: Request) -> AppState:
    return request.app.state.shmarql


# -- Jinja filters (from ldview) -------------------------------------------------------------
def zwsp_filter(value: Any) -> Markup:
    safe = str(Markup.escape(str(value)))
    return Markup(safe.replace("/", "/<wbr>").replace("-", "-<wbr>"))


def camel_wbr_filter(value: Any) -> Markup:
    """Insert <wbr> at camelCase boundaries and after / - and #."""
    safe = str(Markup.escape(str(value)))
    result = re.sub(r"([a-z])([A-Z])", r"\1<wbr>\2", safe)
    result = result.replace("/", "/<wbr>").replace("-", "-<wbr>").replace("#", "#<wbr>")
    return Markup(result)


def blank_node_display(value: Any, skolem_pattern: str = "/.well-known/genid/") -> str:
    """Short display string for blank/skolem node identifiers."""
    value = str(value)
    if value.startswith("_:"):
        return value[2:]
    if skolem_pattern and skolem_pattern in value:
        return value[value.index(skolem_pattern) + 1 :]
    return value


def create_templates() -> Jinja2Templates:
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    env = templates.env
    env.filters["zwsp"] = zwsp_filter
    env.filters["camel_wbr"] = camel_wbr_filter
    env.filters["blank_node_display"] = blank_node_display
    env.globals["version"] = __version__
    return templates


def render(
    request: Request,
    template: str,
    context: dict[str, Any] | None = None,
    status_code: int = 200,
):
    state = get_state(request)
    settings = state.settings
    lang = preferred_language(
        request.headers.get("accept-language"),
        settings.supported_languages,
        settings.default_language,
    )
    ctx: dict[str, Any] = {
        "site_title": settings.site_title,
        "lang": lang,
        "_": translator(lang, settings.default_language),
        "has_docs": state.docs.exists,
        "has_profiles": len(state.registry) > 0,
        "has_editor": settings.lodeon_editor_enabled,
    }
    ctx.update(context or {})
    templates: Jinja2Templates = request.app.state.templates
    return templates.TemplateResponse(request, template, ctx, status_code=status_code)
