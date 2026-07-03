"""
FastAPI rendering helper

Provides:
- ``APIRouter``: a thin subclass of ``fastapi.APIRouter`` that automatically
  wraps route handlers returning ``fastcore.xml`` elements (``FT``) or tuples
  thereof into ``HTMLResponse`` instances. It also exposes a ``to_app(app)``
  helper that registers all the router's routes onto a Starlette/FastAPI app,
  which lets us keep the ``router.to_app(app)`` pattern that the
  legacy code used.
- ``render_page`` / ``to_html``: helpers to render FT trees as either a full
  HTML document or a fragment.
"""

from __future__ import annotations

import inspect
from functools import wraps
from typing import Annotated, Any, Iterable

from fastapi import APIRouter as _APIRouter
from fastapi.responses import HTMLResponse, Response
from fastcore.xml import FT, to_xml, Html, Head, Body

# Tags that belong inside ``<head>`` when we auto-build a full document.
_HEAD_TAGS = {"title", "meta", "link", "style", "script", "base"}


def _flatten(items: Iterable[Any]) -> list:
    out: list = []
    for it in items:
        if it is None:
            continue
        if isinstance(it, (list, tuple)):
            out.extend(_flatten(it))
        else:
            out.append(it)
    return out


def _is_ft(obj: Any) -> bool:
    return isinstance(obj, FT) or hasattr(obj, "tag")


def _looks_like_full_page(items: list) -> bool:
    """True if the top-level items contain head-only tags (e.g. ``Title``)."""
    for el in items:
        tag = (getattr(el, "tag", "") or "").lower()
        if tag in _HEAD_TAGS:
            return True
    return False


def render_page(content: Any) -> HTMLResponse:
    """Render ``content`` as a complete HTML document.

    Top-level head-ish tags (``Title``, ``Meta``, ``Link``, ``Style``,
    ``Script``) are collected into ``<head>``; everything else goes inside
    ``<body>``.
    """
    items = _flatten(content if isinstance(content, (list, tuple)) else [content])
    head_els, body_els = [], []
    for el in items:
        tag = (getattr(el, "tag", "") or "").lower()
        if tag in _HEAD_TAGS:
            head_els.append(el)
        else:
            body_els.append(el)
    doc = Html(Head(*head_els), Body(*body_els))
    rendered = to_xml(doc)
    # ``to_xml`` on an ``<html>`` element already emits a doctype declaration.
    if not rendered.lstrip().lower().startswith("<!doctype"):
        rendered = "<!doctype html>\n" + rendered
    return HTMLResponse(rendered)


def to_html(content: Any) -> str:
    """Serialise an FT element (or iterable thereof) to an HTML string."""
    items = _flatten(content if isinstance(content, (list, tuple)) else [content])
    return "".join(to_xml(el) for el in items)


def _maybe_wrap(result: Any) -> Any:
    """Convert FT/tuple results into an HTMLResponse; pass everything else through."""
    if isinstance(result, Response):
        return result
    if result is None:
        return result
    # Tuple/list of items - decide page vs fragment.
    if isinstance(result, (list, tuple)):
        items = _flatten(list(result))
        if not items:
            return HTMLResponse("")
        if all(_is_ft(i) for i in items):
            if _looks_like_full_page(items):
                return render_page(items)
            return HTMLResponse(to_html(items))
        # Non-FT contents: let FastAPI handle it (e.g. JSON-ish).
        return result
    # Single FT element.
    if _is_ft(result):
        tag = (getattr(result, "tag", "") or "").lower()
        if tag == "html":
            # Caller built the full ``<html>...</html>`` tree themselves.
            return HTMLResponse(to_xml(result))
        if tag in _HEAD_TAGS:
            return render_page(result)
        return HTMLResponse(to_xml(result))
    return result


def ft_endpoint(fn):
    """Decorator: wrap an endpoint so FT/tuple returns become ``HTMLResponse``.

    Uses ``functools.wraps`` so FastAPI's signature introspection (which
    follows ``__wrapped__``) still sees the original parameters.
    """

    if inspect.iscoroutinefunction(fn):

        @wraps(fn)
        async def awrapper(*args, **kwargs):
            return _maybe_wrap(await fn(*args, **kwargs))

        return awrapper

    @wraps(fn)
    def wrapper(*args, **kwargs):
        return _maybe_wrap(fn(*args, **kwargs))

    return wrapper


class APIRouter(_APIRouter):
    """FastAPI router that auto-wraps FT responses and supports ``to_app``."""

    def add_api_route(self, path: str, endpoint, **kwargs):  # type: ignore[override]
        return super().add_api_route(path, ft_endpoint(endpoint), **kwargs)

    def to_app(self, app) -> None:
        """Attach this router's routes to a Starlette/FastAPI ``app``.

        FastAPI's ``APIRoute`` is a subclass of Starlette's ``Route``, so it
        can be plugged directly into any Starlette router. We insert the
        routes at the front of ``app.routes`` so they take precedence over
        any catch-all routes that may already be registered on ``app``.
        """
        for r in self.routes:
            app.routes.append(r)
