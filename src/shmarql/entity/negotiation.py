"""RDF content negotiation for the entity view (ported from ldview)."""

from __future__ import annotations

from rdflib import Graph

FORMATS: dict[str, dict[str, str]] = {
    "xml": {"format": "xml", "mime_type": "application/rdf+xml"},
    "turtle": {"format": "turtle", "mime_type": "text/turtle"},
    "json-ld": {"format": "json-ld", "mime_type": "application/ld+json"},
    "nt": {"format": "nt", "mime_type": "application/n-triples"},
}


def negotiate(format_param: str | None, accept_header: str | None) -> dict[str, str] | None:
    """Return the RDF format to use, or None when HTML should be rendered."""
    if format_param and format_param in FORMATS:
        return FORMATS[format_param]
    if accept_header:
        # Only switch to RDF when the client explicitly prefers an RDF type over HTML.
        for entry in accept_header.split(","):
            mime = entry.split(";")[0].strip().lower()
            if mime in ("text/html", "application/xhtml+xml", "*/*"):
                return None
            for info in FORMATS.values():
                if mime == info["mime_type"]:
                    return info
    return None


def serialize(graph: Graph, info: dict[str, str]) -> tuple[str, str]:
    return graph.serialize(format=info["format"]), f"{info['mime_type']}; charset=utf-8"
