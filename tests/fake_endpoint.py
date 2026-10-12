"""An in-process SPARQL endpoint backed by rdflib, mounted as an httpx transport."""

from __future__ import annotations

from urllib.parse import parse_qs

import httpx
from rdflib import Graph


class FakeSparqlEndpoint:
    """Answers SPARQL protocol requests for ``graph``; records every request it receives."""

    def __init__(self, graph: Graph, fail_on: tuple[str, ...] = ()):
        self.graph = graph
        self.requests: list[dict] = []
        # Substrings that make a query fail with HTTP 500 (to test fallbacks).
        self.fail_on = fail_on

    def _query_text(self, request: httpx.Request) -> tuple[str | None, str | None]:
        params = parse_qs(request.url.query.decode())
        if request.method == "GET":
            return (params.get("query") or [None])[0], (params.get("update") or [None])[0]
        content_type = request.headers.get("content-type", "").split(";")[0]
        body = request.content.decode()
        if content_type == "application/sparql-query":
            return body, None
        if content_type == "application/sparql-update":
            return None, body
        form = parse_qs(body)
        return (form.get("query") or [None])[0], (form.get("update") or [None])[0]

    def handler(self, request: httpx.Request) -> httpx.Response:
        query, update = self._query_text(request)
        self.requests.append(
            {
                "method": request.method,
                "query": query,
                "update": update,
                "headers": dict(request.headers),
                "url": str(request.url),
            }
        )
        if update:
            self.graph.update(update)
            return httpx.Response(204)
        if not query:
            return httpx.Response(400, text="no query")
        if any(marker in query for marker in self.fail_on):
            return httpx.Response(500, text="simulated failure")
        try:
            result = self.graph.query(query)
        except Exception as exc:  # report parse errors like a real endpoint
            return httpx.Response(400, text=f"bad query: {exc}")
        accept = request.headers.get("accept", "")
        if result.type in ("CONSTRUCT", "DESCRIBE"):
            g = result.graph
            if "application/n-triples" in accept and "text/turtle" not in accept:
                return httpx.Response(
                    200,
                    content=g.serialize(format="nt"),
                    headers={"content-type": "application/n-triples"},
                )
            return httpx.Response(
                200,
                content=g.serialize(format="turtle"),
                headers={"content-type": "text/turtle; charset=utf-8"},
            )
        payload = result.serialize(format="json")
        return httpx.Response(
            200,
            content=payload,
            headers={"content-type": "application/sparql-results+json"},
        )

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)
