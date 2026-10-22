"""Endpoints used by the LODEON browser runtime (``runtime.js``) on data story pages.

* ``POST /api/sparql/{profile}``      read-only SPARQL for fences with a ``kg`` attribute
* ``POST /shmarql/fragments/sparql``  HTML result table for ``shmarql`` fences without ``kg``
* ``POST /api/explorer/{profile}/expand``  neighbourhood expansion for the Graph Explorer
* ``GET  /shmarql/``                  "execute" links on SPARQL code blocks -> query page

``{profile}`` is a profile hash key or a profile name, so LODEON knowledge-graph
profile ids can be used as profile names in ``profiles.yaml``.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from ..entity.uri_utils import shorten_uri
from ..profiles import Profile
from ..sparql_client import SparqlError
from ..web import get_state, render
from .sparql import proxy_request

router = APIRouter(tags=["lodeon"])


def _problem(code: str, detail: str, status: int) -> JSONResponse:
    return JSONResponse({"ok": False, "code": code, "detail": detail}, status_code=status)


def _resolve(request: Request, ref: str) -> Profile | None:
    return get_state(request).registry.get(ref)


@router.api_route("/api/sparql/{ref}", methods=["GET", "POST"])
async def lodeon_sparql(request: Request, ref: str) -> Response:
    profile = _resolve(request, ref)
    if profile is None:
        return _problem("sparql.profile_not_found", f"Unknown knowledge graph profile: {ref}", 404)
    return await proxy_request(request, profile, read_only=True)


@router.post("/shmarql/fragments/sparql", response_class=HTMLResponse)
async def sparql_fragment(request: Request, query: str = Form(...), profile: str = Form("")):
    state = get_state(request)
    target = state.registry.get(profile) if profile else state.registry.default
    if target is None:
        return HTMLResponse('<p class="sparql-error">No SPARQL profile configured</p>', 404)
    try:
        results = await state.client.select(target, query)
    except SparqlError as exc:
        return render(
            request,
            "fragments/sparql_error.html",
            {"message": str(exc)},
            status_code=exc.status_code,
        )
    display = state.display_for(target)
    return render(
        request,
        "fragments/results_table.html",
        {
            "results": results,
            "shorten": lambda uri: shorten_uri(uri, display.namespaces),
            "entity_href": lambda uri: state.entity_href(uri, target),
        },
    )


@router.get("/shmarql")
@router.get("/shmarql/")
async def shmarql_query_redirect(request: Request) -> RedirectResponse:
    params = dict(request.query_params)
    return RedirectResponse("/query" + ("?" + urlencode(params) if params else ""), 303)


# -- Graph Explorer --------------------------------------------------------------------------
def _escape_iri(value: str) -> str | None:
    if any(ch in value for ch in '<>"{}|^`\\ \n\r\t'):
        return None
    return f"<{value}>"


def _node_kind(binding: dict[str, Any]) -> str:
    kind = binding.get("type")
    if kind == "bnode":
        return "blank"
    if kind in ("literal", "typed-literal"):
        return "literal"
    return "iri"


def _clamp(value: Any, default: int, low: int, high: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(low, min(high, parsed))


def _label(value: str) -> str:
    tail = value.rstrip("/#").rsplit("/", 1)[-1].rsplit("#", 1)[-1]
    return tail or value


@router.post("/api/explorer/{ref}/expand")
async def graph_explorer_expand(request: Request, ref: str) -> JSONResponse:
    state = get_state(request)
    profile = _resolve(request, ref)
    if profile is None:
        return _problem("graph_explorer.profile_not_found", f"Unknown profile: {ref}", 404)
    try:
        payload = await request.json()
    except (ValueError, json.JSONDecodeError):
        return _problem("graph_explorer.request_invalid", "Request body must be JSON", 400)
    if not isinstance(payload, dict):
        return _problem("graph_explorer.request_invalid", "Request body must be an object", 400)
    iris = [i for i in payload.get("iris") or [] if isinstance(i, str) and i.strip()]
    start_terms = [t for t in (_escape_iri(i.strip()) for i in iris) if t]
    if not start_terms:
        return _problem("graph_explorer.request_invalid", "No valid IRIs given", 400)

    direction = payload.get("direction") if payload.get("direction") in (
        "outgoing", "incoming", "both"
    ) else "both"  # fmt: skip
    depth = _clamp(payload.get("depth"), 1, 1, 3)
    max_nodes = _clamp(payload.get("maxNodes"), 100, 1, 500)
    max_edges = _clamp(payload.get("maxEdgesPerNode"), 50, 1, 500)
    include_literals = bool(payload.get("includeLiterals"))
    include_blank = bool(payload.get("includeBlankNodes"))
    labels = state.display_for(profile).label_predicates
    label_values = " ".join(f"<{p}>" for p in labels)

    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    truncated = False

    def add_node(value: str, kind: str, start: bool = False, label: str | None = None) -> None:
        node = nodes.get(value)
        if node is None:
            nodes[value] = {
                "id": value,
                "label": label or (value if kind == "literal" else _label(value)),
                "kind": kind,
                "start": start,
                "hasLabel": bool(label),
            }
        else:
            node["start"] = node["start"] or start
            if label and not node.get("hasLabel"):
                node["label"], node["hasLabel"] = label, True

    for iri in iris:
        add_node(iri.strip(), "iri", start=True)

    frontier = list(start_terms)
    for _level in range(depth):
        if not frontier or len(nodes) >= max_nodes:
            break
        values = " ".join(frontier)
        blocks = []
        if direction in ("outgoing", "both"):
            blocks.append(
                f'{{ VALUES ?focus {{ {values} }} ?focus ?predicate ?other . BIND("out" AS ?dir) }}'
            )
        if direction in ("incoming", "both"):
            blocks.append(
                f'{{ VALUES ?focus {{ {values} }} ?other ?predicate ?focus . BIND("in" AS ?dir) }}'
            )
        filters = []
        if not include_literals:
            filters.append("!isLiteral(?other)")
        if not include_blank:
            filters.append("!isBlank(?other)")
        filter_clause = f"FILTER({' && '.join(filters)})" if filters else ""
        query = f"""SELECT ?focus ?predicate ?other ?dir ?label WHERE {{
  {" UNION ".join(blocks)}
  {filter_clause}
  OPTIONAL {{ ?other ?lp ?label . VALUES ?lp {{ {label_values} }} }}
}} LIMIT {max_edges * len(frontier) * 2}"""
        try:
            rows = await state.client.bindings(profile, query)
        except SparqlError as exc:
            return _problem("graph_explorer.query_failed", str(exc), exc.status_code)

        next_frontier: list[str] = []
        per_node: dict[str, int] = {}
        for row in rows:
            focus = row.get("focus", {}).get("value")
            predicate = row.get("predicate", {}).get("value")
            other_b = row.get("other", {})
            other = other_b.get("value")
            if not (focus and predicate and other):
                continue
            kind = _node_kind(other_b)
            if kind == "blank" and not other.startswith("_:"):
                other = "_:" + other
            label = row.get("label", {}).get("value")
            if other not in nodes:
                if len(nodes) >= max_nodes:
                    truncated = True
                    continue
                if per_node.get(focus, 0) >= max_edges:
                    truncated = True
                    continue
                if kind == "iri":
                    term = _escape_iri(other)
                    if term:
                        next_frontier.append(term)
            add_node(other, kind, label=label)
            source, target = (focus, other) if row.get("dir", {}).get("value") == "out" else (
                other, focus
            )  # fmt: skip
            edge_id = hashlib.sha1(f"{source}|{predicate}|{target}".encode()).hexdigest()
            if edge_id not in edges:
                per_node[focus] = per_node.get(focus, 0) + 1
                edges[edge_id] = {
                    "id": edge_id,
                    "source": source,
                    "target": target,
                    "predicate": predicate,
                    "label": _label(predicate),
                }
        frontier = next_frontier
    if truncated:
        warnings.append("graph_explorer.truncated")
    return JSONResponse(
        {
            "ok": True,
            "nodes": list(nodes.values()),
            "edges": list(edges.values()),
            "warnings": warnings,
            "truncated": truncated,
        }
    )
