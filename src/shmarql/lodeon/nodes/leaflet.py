"""Vendored verbatim from lodeon-core renderer/nodes (MIT License, (c) Torsten Schrade and LODEON contributors).

Leaflet Special Node validation and HTML projection."""

from __future__ import annotations

import html
import json
import math
import re
from typing import Protocol, TypedDict
from urllib.parse import urlparse


class _TextResolver(Protocol):
    """Localized text callable required by Leaflet projection."""

    def __call__(self, key: str, variables: dict[str, object] | None = None) -> str: ...


class _LeafletFeatureCollection(TypedDict):
    """Validated GeoJSON collection embedded in the public viewer payload."""

    type: str
    features: list[dict[str, object]]


class _LeafletPublicPayload(TypedDict):
    """Stable browser-visible payload emitted for one Leaflet node."""

    renderer: str
    featureCollection: _LeafletFeatureCollection
    tileLayerId: str
    tileLayer: dict[str, object]
    height: int | float
    initialView: str
    center: list[int | float] | None
    zoom: int | float | None
    fitBoundsMaxZoom: int | float
    clustering: dict[str, object]
    legend: dict[str, object]
    popupFields: list[str]
    markerStyle: dict[str, object]
    caption: str
    labels: dict[str, str]


_PATTERN = re.compile(r"```lodeon-leaflet(?P<info>[^\n]*)\n(?P<body>.*?)\n```", re.DOTALL)


def _parse_fence_title(info: str) -> str:
    match = re.search(r'title="([^"]*)"', info)
    return match.group(1) if match else ""


def _safe_inline_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def _error_definition(registry: dict[str, object], code: str) -> dict[str, object]:
    errors = registry.get("errors")
    if not isinstance(errors, dict):
        return {}
    value = errors.get(code)
    return value if isinstance(value, dict) else {}


class _LeafletSpecError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def preprocess_lodeon_leaflet(
    markdown: str,
    config: dict[str, object],
    text: _TextResolver,
    error_registry: dict[str, object],
) -> str:
    """Validate Leaflet fences and render deterministic published map markup.

    Non-finite JSON and invalid map contracts fail into coded error surfaces.
    Feature properties remain generic JSON only below the validated GeoJSON and
    viewer configuration envelope.
    """

    def replace(match: re.Match[str]) -> str:
        info = match.group("info") or ""
        source = match.group("body") or ""

        try:
            spec = json.loads(source, parse_constant=_reject_leaflet_json_constant)
            payload = _leaflet_public_payload(spec, config, text)
        except json.JSONDecodeError:
            return _render_leaflet_error("leaflet.geojson_invalid", error_registry)
        except _LeafletSpecError as error:
            return _render_leaflet_error(error.code, error_registry)

        return _render_lodeon_leaflet(payload, spec, info, text)

    return _PATTERN.sub(replace, markdown)


def _render_lodeon_leaflet(
    payload: _LeafletPublicPayload,
    spec: dict[str, object],
    info: str,
    text: _TextResolver,
) -> str:
    title = str(
        spec.get("title") or _parse_fence_title(info) or text("leaflet.defaultTitle")
    ).strip()
    caption = str(payload.get("caption") or "").strip()
    feature_collection = payload.get("featureCollection")
    assert isinstance(feature_collection, dict)
    features = feature_collection.get("features")
    assert isinstance(features, list)
    feature_count = len(features)
    status_key = "leaflet.ready" if feature_count else "leaflet.empty"
    parts = ['<figure class="lodeon-leaflet">']

    if title:
        parts.append(
            f'<figcaption class="lodeon-visualization-title">{html.escape(title)}</figcaption>'
        )

    parts.extend(
        [
            '<div class="lodeon-leaflet-viewer"></div>',
            '<p class="lodeon-leaflet-status" role="status" aria-live="polite">'
            f"{html.escape(text(status_key, {'count': feature_count}))}"
            "</p>",
            '<script type="application/json" class="lodeon-leaflet-spec">'
            f"{_safe_inline_json(payload)}"
            "</script>",
        ]
    )

    if caption:
        parts.append(
            f'<figcaption class="lodeon-leaflet-caption">{html.escape(caption)}</figcaption>'
        )

    parts.append("</figure>")
    return "\n".join(parts)


def _reject_leaflet_json_constant(_value: str) -> None:
    raise _LeafletSpecError("leaflet.geojson_invalid")


def _leaflet_public_payload(
    value: object, config: dict[str, object], text: _TextResolver
) -> _LeafletPublicPayload:
    if not isinstance(value, dict) or value.get("renderer") != "leaflet":
        raise _LeafletSpecError("leaflet.geojson_invalid")

    feature_collection = _validate_leaflet_feature_collection(value.get("featureCollection"))
    nodes = config.get("nodes")
    leaflet_config = nodes.get("leaflet") if isinstance(nodes, dict) else None
    if not isinstance(leaflet_config, dict):
        leaflet_config = {}
    tile_layers = leaflet_config.get("tileLayers")
    if not isinstance(tile_layers, dict):
        tile_layers = {}
    tile_layer_id = _require_non_empty_string(value.get("tileLayerId"))
    tile_layer = tile_layers.get(tile_layer_id)
    if not isinstance(tile_layer, dict):
        raise _LeafletSpecError("leaflet.tile_layer_unavailable")

    initial_view = value.get("initialView")
    if initial_view not in {"fitBounds", "configured"}:
        raise _LeafletSpecError("leaflet.geojson_invalid")

    validated_tile_layer = _validate_leaflet_tile_layer(tile_layer)
    minimum_zoom = validated_tile_layer.get("minZoom")
    maximum_zoom = validated_tile_layer.get("maxZoom")
    assert isinstance(minimum_zoom, int)
    assert isinstance(maximum_zoom, int)
    zoom = _require_optional_number(value.get("zoom"), 0, 24)
    fit_bounds_max_zoom = _require_number(value.get("fitBoundsMaxZoom"), 0, 24)
    clustering = _validate_leaflet_clustering(value.get("clustering"))
    for candidate in (zoom, fit_bounds_max_zoom, clustering["disableAtZoom"]):
        if candidate is None:
            continue
        if isinstance(candidate, bool) or not isinstance(candidate, (int, float)):
            raise _LeafletSpecError("leaflet.geojson_invalid")
        if not minimum_zoom <= candidate <= maximum_zoom:
            raise _LeafletSpecError("leaflet.geojson_invalid")

    return {
        "renderer": "leaflet",
        "featureCollection": feature_collection,
        "tileLayerId": tile_layer_id,
        "tileLayer": validated_tile_layer,
        "height": _require_number(value.get("height"), 160, 1600),
        "initialView": initial_view,
        "center": _validate_leaflet_center(value.get("center")),
        "zoom": zoom,
        "fitBoundsMaxZoom": fit_bounds_max_zoom,
        "clustering": clustering,
        "legend": _validate_leaflet_legend(value.get("legend")),
        "popupFields": _validate_leaflet_popup_fields(value.get("popupFields")),
        "markerStyle": _validate_leaflet_marker_style(value.get("markerStyle")),
        "caption": str(value.get("caption") or "").strip(),
        "labels": {
            "ariaLabel": text("leaflet.ariaLabel"),
            "empty": text("leaflet.empty"),
            "ready": text(
                "leaflet.ready",
                {
                    "count": len(feature_collection["features"])
                    if isinstance(feature_collection["features"], list)
                    else 0
                },
            ),
            "unavailable": text("leaflet.unavailable"),
            "legend": text("leaflet.legend"),
            "feature": text("leaflet.feature"),
        },
    }


def _validate_leaflet_feature_collection(value: object) -> _LeafletFeatureCollection:
    if not isinstance(value, dict) or value.get("type") != "FeatureCollection":
        raise _LeafletSpecError("leaflet.geojson_invalid")
    features = value.get("features")
    if not isinstance(features, list):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return {
        "type": "FeatureCollection",
        "features": [_validate_leaflet_feature(item) for item in features],
    }


def _validate_leaflet_feature(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or value.get("type") != "Feature":
        raise _LeafletSpecError("leaflet.geojson_invalid")
    properties = value.get("properties")
    if not isinstance(properties, dict):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    feature: dict[str, object] = {
        "type": "Feature",
        "geometry": _validate_leaflet_geometry(value.get("geometry")),
        "properties": properties,
    }
    feature_id = value.get("id")
    if isinstance(feature_id, (str, int)) and not isinstance(feature_id, bool):
        feature["id"] = feature_id
    return feature


def _validate_leaflet_geometry(value: object) -> dict[str, object] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    geometry_type = value.get("type")
    validators = {
        "Point": lambda coordinates: _validate_leaflet_position(coordinates),
        "MultiPoint": lambda coordinates: _validate_leaflet_positions(coordinates, 1),
        "LineString": lambda coordinates: _validate_leaflet_positions(coordinates, 2),
        "MultiLineString": lambda coordinates: _validate_leaflet_nested_positions(coordinates, 2),
        "Polygon": _validate_leaflet_polygon,
        "MultiPolygon": _validate_leaflet_multi_polygon,
    }
    if geometry_type == "GeometryCollection":
        geometries = value.get("geometries")
        if not isinstance(geometries, list):
            raise _LeafletSpecError("leaflet.geojson_invalid")
        validated = [_validate_leaflet_geometry(item) for item in geometries]
        if any(item is None for item in validated):
            raise _LeafletSpecError("leaflet.geojson_invalid")
        return {"type": geometry_type, "geometries": validated}
    validator = validators.get(geometry_type) if isinstance(geometry_type, str) else None
    if validator is None:
        raise _LeafletSpecError("leaflet.geometry_unsupported")
    return {"type": geometry_type, "coordinates": validator(value.get("coordinates"))}


def _validate_leaflet_position(value: object) -> list[object]:
    if not isinstance(value, list) or len(value) < 2:
        raise _LeafletSpecError("leaflet.coordinate_invalid")
    longitude = _require_number(value[0], -180, 180, "leaflet.coordinate_invalid")
    latitude = _require_number(value[1], -90, 90, "leaflet.coordinate_invalid")
    result: list[object] = [longitude, latitude]
    for coordinate in value[2:]:
        result.append(_require_number(coordinate, -1e308, 1e308, "leaflet.coordinate_invalid"))
    return result


def _validate_leaflet_positions(value: object, minimum: int) -> list[object]:
    if not isinstance(value, list) or len(value) < minimum:
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return [_validate_leaflet_position(item) for item in value]


def _validate_leaflet_nested_positions(value: object, minimum: int) -> list[object]:
    if not isinstance(value, list) or not value:
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return [_validate_leaflet_positions(item, minimum) for item in value]


def _validate_leaflet_polygon(value: object) -> list[object]:
    rings = _validate_leaflet_nested_positions(value, 4)
    if any(not isinstance(ring, list) or ring[0] != ring[-1] for ring in rings):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return rings


def _validate_leaflet_multi_polygon(value: object) -> list[object]:
    if not isinstance(value, list) or not value:
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return [_validate_leaflet_polygon(item) for item in value]


def _validate_leaflet_center(value: object) -> list[int | float] | None:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != 2:
        raise _LeafletSpecError("leaflet.coordinate_invalid")
    return [
        _require_number(value[0], -90, 90, "leaflet.coordinate_invalid"),
        _require_number(value[1], -180, 180, "leaflet.coordinate_invalid"),
    ]


def _validate_leaflet_tile_layer(value: dict[str, object]) -> dict[str, object]:
    url_template = _require_non_empty_string(value.get("urlTemplate"))
    parsed = urlparse(url_template)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or any(placeholder not in url_template for placeholder in ("{z}", "{x}", "{y}"))
    ):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return {
        "label": _require_non_empty_string(value.get("label")),
        "urlTemplate": url_template,
        "attribution": str(value.get("attribution") or ""),
        "minZoom": int(_require_number(value.get("minZoom"), 0, 24)),
        "maxZoom": int(_require_number(value.get("maxZoom"), 0, 24)),
    }


def _validate_leaflet_clustering(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return {
        "enabled": _require_bool(value.get("enabled")),
        "disableAtZoom": _require_optional_number(value.get("disableAtZoom"), 0, 24),
        "showCoverageOnHover": _require_bool(value.get("showCoverageOnHover")),
        "spiderfyOnMaxZoom": _require_bool(value.get("spiderfyOnMaxZoom")),
        "spiderfyDistanceMultiplier": _require_number(
            value.get("spiderfyDistanceMultiplier"), 0.1, 10
        ),
    }


def _validate_leaflet_legend(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or value.get("position") not in {
        "topLeft",
        "topRight",
        "bottomLeft",
        "bottomRight",
    }:
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return {
        "enabled": _require_bool(value.get("enabled")),
        "position": value["position"],
        "title": str(value.get("title") or "").strip(),
    }


def _validate_leaflet_popup_fields(value: object) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return [item.strip() for item in value if item.strip()]


def _validate_leaflet_marker_style(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return {
        "radius": _require_number(value.get("radius"), 1, 40),
        "color": _require_leaflet_color(value.get("color")),
        "fillColor": _require_leaflet_color(value.get("fillColor")),
        "fillOpacity": _require_number(value.get("fillOpacity"), 0, 1),
        "weight": _require_number(value.get("weight"), 0, 20),
    }


def _require_leaflet_color(value: object) -> str:
    color = _require_non_empty_string(value)
    if not re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", color):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return color


def _require_non_empty_string(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return value.strip()


def _require_bool(value: object) -> bool:
    if not isinstance(value, bool):
        raise _LeafletSpecError("leaflet.geojson_invalid")
    return value


def _require_optional_number(value: object, minimum: float, maximum: float) -> float | None:
    if value is None:
        return None
    return _require_number(value, minimum, maximum)


def _require_number(
    value: object,
    minimum: float,
    maximum: float,
    code: str = "leaflet.geojson_invalid",
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _LeafletSpecError(code)
    parsed = float(value)
    if not math.isfinite(parsed) or parsed < minimum or parsed > maximum:
        raise _LeafletSpecError(code)
    return value


def _render_leaflet_error(code: str, error_registry: dict[str, object]) -> str:
    definition = _error_definition(error_registry, code)
    detail = str(definition.get("detail") or code)
    hint = str(definition.get("hint") or "")
    parts = [f"<p>{html.escape(detail)}</p>"]
    if hint:
        parts.append(f"<p>{html.escape(hint)}</p>")
    return (
        '<div class="lodeon-leaflet lodeon-leaflet-error" '
        f'data-error-code="{html.escape(code, quote=True)}" role="alert">'
        + "\n".join(parts)
        + "</div>"
    )
