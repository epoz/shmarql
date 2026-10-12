"""Vendored verbatim from lodeon-core renderer/nodes (MIT License, (c) Torsten Schrade and LODEON contributors).

Graph Explorer Special Node HTML projection."""

from __future__ import annotations

import html
import json
import re
from typing import Protocol, TypedDict


class _TextResolver(Protocol):
    """Localized text callable required by Graph Explorer projection."""

    def __call__(self, key: str, variables: dict[str, object] | None = None) -> str: ...


class _GraphExplorerPublicPayload(TypedDict):
    """Stable browser-visible envelope for one Graph Explorer viewer."""

    profileId: str
    items: list[dict[str, object]]
    graphData: dict[object, object] | None
    direction: object
    depth: int
    maxNodes: int
    maxEdgesPerNode: int
    includeLiterals: bool
    includeBlankNodes: bool
    showPredicateLabels: bool
    showTypes: bool
    colorScheme: str
    colors: dict[str, object]
    height: int
    labels: dict[str, str]
    colorway: list[str]
    singleTraceColor: str


_PATTERN = re.compile(r"```lodeon-graph-explorer(?P<info>[^\n]*)\n(?P<body>.*?)\n```", re.DOTALL)


def _parse_fence_title(info: str) -> str:
    match = re.search(r'title="([^"]*)"', info)
    return match.group(1) if match else ""


def _error_definition(registry: dict[str, object], code: str) -> dict[str, object]:
    errors = registry.get("errors")
    value = errors.get(code) if isinstance(errors, dict) else None
    return value if isinstance(value, dict) else {}


def preprocess_lodeon_graph_explorers(
    markdown: str,
    config: dict[str, object],
    text: _TextResolver,
    error_registry: dict[str, object],
) -> str:
    """Replace Graph Explorer fences with validated published viewer shells.

    Only the compact public payload enters generated HTML. Endpoint resolution
    remains API-mediated and raw traversal results or endpoint URLs are not
    serialized into the story.
    """

    def replace(match: re.Match[str]) -> str:
        info = match.group("info") or ""
        source = match.group("body") or ""

        try:
            spec = json.loads(source)
        except json.JSONDecodeError:
            return _render_graph_explorer_error("graph_explorer.request_invalid", error_registry)

        return _render_lodeon_graph_explorer(spec, info, config, text, error_registry)

    return _PATTERN.sub(replace, markdown)


def _render_lodeon_graph_explorer(
    spec: object,
    info: str,
    config: dict[str, object],
    text: _TextResolver,
    error_registry: dict[str, object],
) -> str:
    if not isinstance(spec, dict):
        return _render_graph_explorer_error("graph_explorer.request_invalid", error_registry)

    if spec.get("renderer") != "graphExplorer":
        return _render_graph_explorer_error("graph_explorer.request_invalid", error_registry)

    profile_id = str(spec.get("knowledgeGraphProfileId") or "").strip()
    title = str(spec.get("title") or _parse_fence_title(info) or text("graphExplorer.defaultTitle"))
    caption = str(spec.get("caption") or "").strip()
    payload = _graph_explorer_public_payload(spec, profile_id, config, text)

    parts = [
        '<figure class="lodeon-graph-explorer">',
    ]
    if title:
        parts.append(
            f'<figcaption class="lodeon-visualization-title">{html.escape(title)}</figcaption>'
        )

    parts.extend(
        [
            '<div class="lodeon-graph-explorer-viewer"></div>',
            '<p class="lodeon-graph-explorer-status">'
            f"{html.escape(text('graphExplorer.ready'))}"
            "</p>",
            '<script type="application/json" class="lodeon-graph-explorer-spec">'
            f"{_safe_inline_json(payload)}"
            "</script>",
        ]
    )

    if caption:
        parts.append(
            f'<figcaption class="lodeon-graph-explorer-caption">{html.escape(caption)}</figcaption>'
        )

    parts.append("</figure>")
    return "\n".join(parts)


def _graph_explorer_public_payload(
    spec: dict[str, object],
    profile_id: str,
    config: dict[str, object],
    text: _TextResolver,
) -> _GraphExplorerPublicPayload:
    graph_data = spec.get("graphData")
    direction = spec.get("direction")
    color_scheme = spec.get("colorScheme")

    return {
        "profileId": profile_id,
        "items": _graph_explorer_public_items(spec.get("items")),
        "graphData": graph_data if isinstance(graph_data, dict) else None,
        "direction": (direction if direction in {"outgoing", "incoming", "both"} else "both"),
        "depth": _parse_graph_explorer_int(spec.get("depth"), 1, 1, 5),
        "maxNodes": _parse_graph_explorer_int(spec.get("maxNodes"), 100, 1, 500),
        "maxEdgesPerNode": _parse_graph_explorer_int(spec.get("maxEdgesPerNode"), 50, 1, 500),
        "includeLiterals": bool(spec.get("showLiterals", True)),
        "includeBlankNodes": bool(spec.get("includeBlankNodes")),
        "showPredicateLabels": bool(spec.get("showPredicateLabels", True)),
        "showTypes": bool(spec.get("showTypes", True)),
        "colorScheme": color_scheme if isinstance(color_scheme, str) else "",
        "colors": _graph_explorer_public_colors(spec.get("colors")),
        "height": _parse_graph_explorer_int(spec.get("height"), 520, 160, 1600),
        "labels": {
            "loading": text("graphExplorer.loading"),
            "unavailable": text("graphExplorer.unavailable"),
            "summary": text("graphExplorer.summary"),
            "zoomIn": text("graphExplorer.zoomIn"),
            "zoomOut": text("graphExplorer.zoomOut"),
            "resetZoom": text("graphExplorer.resetZoom"),
            "togglePredicateLabels": text("graphExplorer.togglePredicateLabels"),
            "enterFullscreen": text("graphExplorer.enterFullscreen"),
            "exitFullscreen": text("graphExplorer.exitFullscreen"),
            "popupLabel": text("graphExplorer.popupLabel"),
            "popupResource": text("graphExplorer.popupResource"),
            "popupType": text("graphExplorer.popupType"),
        },
        "colorway": _graph_explorer_colorway(config),
        "singleTraceColor": _graph_explorer_single_trace_color(config),
    }


def _graph_explorer_public_colors(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        return {
            "nodeColors": {
                "iri": "#0072B2",
                "blank": "#E69F00",
                "literal": "#FFFFFF",
            },
            "edgeColors": {"default": "#666666"},
        }

    node_colors = value.get("nodeColors")
    edge_colors = value.get("edgeColors")
    return {
        "nodeColors": _graph_explorer_public_color_map(
            node_colors,
            {
                "iri": "#0072B2",
                "blank": "#E69F00",
                "literal": "#FFFFFF",
            },
        ),
        "edgeColors": _graph_explorer_public_color_map(
            edge_colors,
            {"default": "#666666"},
        ),
    }


def _graph_explorer_public_color_map(
    value: object, defaults: dict[str, object]
) -> dict[str, object]:
    colors = dict(defaults)
    if not isinstance(value, dict):
        return colors

    for key, color in value.items():
        if isinstance(key, str) and key.strip() and isinstance(color, str) and color.strip():
            colors[key.strip()] = color.strip()
    return colors


def _graph_explorer_public_items(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []

    items: list[dict[str, object]] = []
    for item in value:
        if not isinstance(item, dict):
            continue

        iri = item.get("iri") or item.get("resource") or item.get("item")
        if not isinstance(iri, str) or not iri.strip():
            continue

        items.append(
            {
                "iri": iri.strip(),
                "label": str(item.get("label") or item.get("title") or "").strip(),
            }
        )

    return items


def _parse_graph_explorer_int(
    value: object,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    try:
        parsed = int(value) if isinstance(value, (str, int)) else default
    except (TypeError, ValueError):
        parsed = default

    return min(max(parsed, minimum), maximum)


def _graph_explorer_colorway(config: dict[str, object]) -> list[str]:
    nodes = config.get("nodes")
    plotly = nodes.get("plotly") if isinstance(nodes, dict) else None
    defaults = plotly.get("defaults") if isinstance(plotly, dict) else None
    colorway = defaults.get("colorway") if isinstance(defaults, dict) else None

    if not isinstance(colorway, list):
        return []

    return [str(color) for color in colorway if isinstance(color, str) and color]


def _graph_explorer_single_trace_color(config: dict[str, object]) -> str:
    nodes = config.get("nodes")
    plotly = nodes.get("plotly") if isinstance(nodes, dict) else None
    defaults = plotly.get("defaults") if isinstance(plotly, dict) else None

    if not isinstance(defaults, dict):
        return ""

    value = defaults.get("singleTraceColor")
    return value if isinstance(value, str) else ""


def _safe_inline_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def _render_graph_explorer_error(code: str, error_registry: dict[str, object]) -> str:
    definition = _error_definition(error_registry, code)
    detail = str(definition.get("detail") or code)
    hint = str(definition.get("hint") or "")
    parts = [f"<p>{html.escape(detail)}</p>"]

    if hint:
        parts.append(f"<p>{html.escape(hint)}</p>")

    attributes = (
        'class="lodeon-graph-explorer lodeon-graph-explorer-error" '
        f'data-error-code="{html.escape(code, quote=True)}"'
    )
    return f"<div {attributes}>" + "\n".join(parts) + "</div>"
