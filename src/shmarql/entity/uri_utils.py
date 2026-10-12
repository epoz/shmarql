"""URI and WKT helpers (ported from ldview's ``uri_utils.py``)."""

from __future__ import annotations

import re

# WKT parsing regex patterns
_WKT_POINT_RE = re.compile(
    r"POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)", re.IGNORECASE
)
_WKT_LINESTRING_RE = re.compile(
    r"(?<!MULTI)LINESTRING\s*\(\s*((?:-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?(?:\s*,\s*)?)+)\s*\)",
    re.IGNORECASE,
)
_WKT_POLYGON_RE = re.compile(
    r"POLYGON\s*\(\s*\(\s*((?:-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?(?:\s*,\s*)?)+)\s*\)\s*(?:,\s*\(\s*(?:-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?(?:\s*,\s*)?)+\s*\)\s*)*\)",
    re.IGNORECASE,
)
_WKT_MULTILINESTRING_RE = re.compile(r"MULTILINESTRING\s*\((.+)\)\s*$", re.IGNORECASE | re.DOTALL)
_WKT_MULTIPOLYGON_RE = re.compile(r"MULTIPOLYGON\s*\((.+)\)\s*$", re.IGNORECASE | re.DOTALL)
_WKT_RING_RE = re.compile(r"\(\s*((?:-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?(?:\s*,\s*)?)+)\s*\)")


def _parse_coordinate_pair(pair_str: str) -> tuple[float, float] | None:
    """Parse a coordinate pair string like '5.1 51.98' into (lon, lat) floats."""
    parts = pair_str.strip().split()
    if len(parts) != 2:
        return None
    try:
        lon = float(parts[0])
        lat = float(parts[1])
        return (lon, lat)
    except ValueError:
        return None


def parse_wkt_geometry(value: str) -> dict | None:
    """
    Parse a WKT geometry literal (POINT, LINESTRING, POLYGON, or MULTILINESTRING).

    Handles formats like:
    - "POINT(5.1 51.983333)"
    - "LINESTRING(5.1 51.98, 5.2 52.0)"
    - "POLYGON((-64.8 32.3, -65.5 18.3, -80.3 25.2, -64.8 32.3))"
    - "MULTILINESTRING((5.1 51.98, 5.2 52.0),(5.3 52.1, 5.4 52.2))"
    - With optional CRS prefix: "<http://.../EPSG/0/4326> POINT(...)"

    WKT order is (longitude latitude).

    Returns:
        dict with:
        - 'type': 'point' | 'linestring' | 'polygon' | 'multilinestring'
        - 'coordinates': list of [lat, lon] pairs (for Leaflet compatibility)
        - 'lines': list of coordinate lists (only for multilinestring)
        - 'center': {'latitude': float, 'longitude': float} (for map centering)
        or None if parsing fails.
    """
    if not isinstance(value, str):
        return None

    # Try POINT
    m = _WKT_POINT_RE.search(value)
    if m:
        try:
            lon = float(m.group(1))
            lat = float(m.group(2))
        except ValueError:
            return None
        return {
            "type": "point",
            "coordinates": [[lat, lon]],
            "center": {"latitude": lat, "longitude": lon},
            "wkt": value,
        }

    # Try LINESTRING
    m = _WKT_LINESTRING_RE.search(value)
    if m:
        coord_str = m.group(1)
        pairs = [p.strip() for p in coord_str.split(",")]
        coordinates = []
        for pair in pairs:
            parsed = _parse_coordinate_pair(pair)
            if parsed:
                coordinates.append([parsed[1], parsed[0]])  # [lat, lon] for Leaflet
        if coordinates:
            # Calculate center as midpoint of bounding box
            lats = [c[0] for c in coordinates]
            lons = [c[1] for c in coordinates]
            return {
                "type": "linestring",
                "coordinates": coordinates,
                "center": {"latitude": sum(lats) / len(lats), "longitude": sum(lons) / len(lons)},
                "wkt": value,
            }
        return None

    # Try MULTILINESTRING
    m = _WKT_MULTILINESTRING_RE.search(value)
    if m:
        rings_str = m.group(1)
        lines = []
        all_coords = []
        for ring_m in _WKT_RING_RE.finditer(rings_str):
            coord_str = ring_m.group(1)
            pairs = [p.strip() for p in coord_str.split(",")]
            ring_coords = []
            for pair in pairs:
                parsed = _parse_coordinate_pair(pair)
                if parsed:
                    ring_coords.append([parsed[1], parsed[0]])  # [lat, lon] for Leaflet
            if ring_coords:
                lines.append(ring_coords)
                all_coords.extend(ring_coords)
        if lines:
            lats = [c[0] for c in all_coords]
            lons = [c[1] for c in all_coords]
            return {
                "type": "multilinestring",
                "lines": lines,
                "coordinates": all_coords,
                "center": {"latitude": sum(lats) / len(lats), "longitude": sum(lons) / len(lons)},
                "wkt": value,
            }
        return None

    # Try POLYGON (simple ring, no holes)
    m = _WKT_POLYGON_RE.search(value)
    if m:
        coord_str = m.group(1)
        pairs = [p.strip() for p in coord_str.split(",")]
        coordinates = []
        for pair in pairs:
            parsed = _parse_coordinate_pair(pair)
            if parsed:
                coordinates.append([parsed[1], parsed[0]])  # [lat, lon] for Leaflet
        if coordinates:
            # Remove duplicate last point if same as first
            if len(coordinates) > 1 and coordinates[0] == coordinates[-1]:
                coordinates = coordinates[:-1]
            # Calculate center as centroid of polygon vertices
            lats = [c[0] for c in coordinates]
            lons = [c[1] for c in coordinates]
            return {
                "type": "polygon",
                "coordinates": coordinates,
                "center": {"latitude": sum(lats) / len(lats), "longitude": sum(lons) / len(lons)},
                "wkt": value,
            }
        return None

    # Try MULTIPOLYGON (collection of polygons, each with optional holes)
    m = _WKT_MULTIPOLYGON_RE.search(value)
    if m:
        polygons_str = m.group(1)
        # Each polygon is wrapped in () and contains one or more rings
        polygons = []
        all_coords = []
        for poly_m in _WKT_RING_RE.finditer(polygons_str):
            ring_str = poly_m.group(1)
            pairs = [p.strip() for p in ring_str.split(",")]
            ring_coords = []
            for pair in pairs:
                parsed = _parse_coordinate_pair(pair)
                if parsed:
                    ring_coords.append([parsed[1], parsed[0]])  # [lat, lon] for Leaflet
            if ring_coords:
                polygons.append(ring_coords)
                all_coords.extend(ring_coords)
        if polygons:
            lats = [c[0] for c in all_coords]
            lons = [c[1] for c in all_coords]
            return {
                "type": "multipolygon",
                "polygons": polygons,
                "coordinates": all_coords,
                "center": {"latitude": sum(lats) / len(lats), "longitude": sum(lons) / len(lons)},
                "wkt": value,
            }
        return None

    return None


def parse_wkt_point(value: str) -> dict | None:
    """
    Legacy wrapper for backward compatibility.
    Returns dict with 'latitude' and 'longitude' for POINT geometries only.
    """
    result = parse_wkt_geometry(value)
    if result and result["type"] == "point":
        return {
            "latitude": result["center"]["latitude"],
            "longitude": result["center"]["longitude"],
        }
    return None


def shorten_uri(uri: str, namespaces: dict[str, str]) -> dict:
    """Shorten a URI using known namespaces. Returns ``{prefix, local, uri}``."""
    if not isinstance(uri, str):
        return {"prefix": "", "local": str(uri), "uri": str(uri)}
    if uri.startswith("_:"):
        return {"prefix": "", "local": uri, "uri": uri}
    best = None
    for prefix, namespace in namespaces.items():
        # Prefer the longest matching namespace.
        # Longest namespace wins; on ties the later (e.g. user supplied) prefix wins.
        if uri.startswith(namespace) and (best is None or len(namespace) >= len(best[1])):
            best = (prefix, namespace)
    if best:
        return {"prefix": best[0] + ":", "local": uri[len(best[1]) :], "uri": uri}
    return {"prefix": "", "local": uri, "uri": uri}
