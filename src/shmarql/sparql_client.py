"""Asynchronous HTTP client for talking to the backend SPARQL endpoints."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from rdflib import Graph

from .profiles import Profile

log = logging.getLogger("shmarql.sparql")

# Accepted RDF graph media types for CONSTRUCT/DESCRIBE queries, in preference order.
GRAPH_ACCEPT = ", ".join(
    [
        "text/turtle",
        "application/n-triples;q=0.9",
        "application/rdf+xml;q=0.8",
        "application/ld+json;q=0.7",
    ]
)
RESULTS_JSON = "application/sparql-results+json"

_RDF_FORMATS = {
    "text/turtle": "turtle",
    "application/x-turtle": "turtle",
    "application/n-triples": "nt",
    "text/plain": "nt",
    "application/rdf+xml": "xml",
    "application/ld+json": "json-ld",
    "application/json": "json-ld",
    "application/n-quads": "nquads",
    "application/trig": "trig",
}

# Request headers that are passed on to the upstream endpoint.
FORWARDED_REQUEST_HEADERS = ("accept", "content-type", "accept-encoding")
# Response headers that are passed back to the client.
FORWARDED_RESPONSE_HEADERS = ("content-type", "content-disposition", "cache-control", "vary")


class SparqlError(Exception):
    """Raised when an upstream endpoint fails or returns an unusable response."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class UpstreamResponse:
    status_code: int
    headers: dict[str, str]
    content: bytes


class SparqlClient:
    """Thin wrapper around :class:`httpx.AsyncClient` with profile-aware defaults."""

    def __init__(
        self,
        timeout: float = 30.0,
        user_agent: str = "shmarql",
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.timeout = timeout
        self.user_agent = user_agent
        self._http = httpx.AsyncClient(transport=transport, follow_redirects=True)

    async def aclose(self) -> None:
        await self._http.aclose()

    # -- helpers ------------------------------------------------------------------
    def _headers(self, profile: Profile, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"User-Agent": self.user_agent}
        headers.update(extra or {})
        headers.update(profile.headers)
        return headers

    def _timeout(self, profile: Profile) -> float:
        return profile.timeout if profile.timeout is not None else self.timeout

    # -- raw proxying ---------------------------------------------------------------
    async def forward(
        self,
        profile: Profile,
        method: str,
        params: list[tuple[str, str]],
        body: bytes | None,
        headers: dict[str, str],
    ) -> UpstreamResponse:
        """Forward a SPARQL protocol request verbatim to ``profile``'s endpoint."""
        passed = {k: v for k, v in headers.items() if k.lower() in FORWARDED_REQUEST_HEADERS}
        try:
            response = await self._http.request(
                method,
                profile.endpoint,
                params=params or None,
                content=body if method.upper() == "POST" else None,
                headers=self._headers(profile, passed),
                timeout=self._timeout(profile),
            )
        except httpx.TimeoutException as exc:
            raise SparqlError(f"Upstream SPARQL endpoint timed out: {exc}", 504) from exc
        except httpx.HTTPError as exc:
            raise SparqlError(f"Upstream SPARQL endpoint unreachable: {exc}", 502) from exc
        out_headers = {
            k: v for k, v in response.headers.items() if k.lower() in FORWARDED_RESPONSE_HEADERS
        }
        return UpstreamResponse(response.status_code, out_headers, response.content)

    # -- typed queries ----------------------------------------------------------------
    async def _post_query(self, profile: Profile, query: str, accept: str) -> httpx.Response:
        try:
            response = await self._http.post(
                profile.endpoint,
                content=urlencode({"query": query}).encode("utf-8"),
                headers=self._headers(
                    profile,
                    {"Accept": accept, "Content-Type": "application/x-www-form-urlencoded"},
                ),
                timeout=self._timeout(profile),
            )
        except httpx.TimeoutException as exc:
            raise SparqlError(f"SPARQL endpoint timed out: {exc}", 504) from exc
        except httpx.HTTPError as exc:
            raise SparqlError(f"SPARQL endpoint unreachable: {exc}", 502) from exc
        if response.status_code >= 400:
            raise SparqlError(
                f"SPARQL endpoint returned HTTP {response.status_code}: {response.text[:500]}",
                502 if response.status_code >= 500 else response.status_code,
            )
        return response

    async def select(self, profile: Profile, query: str) -> dict[str, Any]:
        """Run a SELECT/ASK query and return the parsed SPARQL JSON results."""
        response = await self._post_query(profile, query, f"{RESULTS_JSON}, application/json;q=0.9")
        try:
            return json.loads(response.content)
        except ValueError as exc:
            raise SparqlError(f"SPARQL endpoint returned invalid JSON: {exc}") from exc

    async def bindings(self, profile: Profile, query: str) -> list[dict[str, Any]]:
        return (await self.select(profile, query)).get("results", {}).get("bindings", [])

    async def construct(self, profile: Profile, query: str) -> Graph:
        """Run a CONSTRUCT/DESCRIBE query and parse the response into an rdflib Graph."""
        response = await self._post_query(profile, query, GRAPH_ACCEPT)
        content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
        fmt = _RDF_FORMATS.get(content_type, "turtle")
        graph = Graph()
        try:
            graph.parse(data=response.content, format=fmt)
        except Exception as exc:  # rdflib raises many different exception types
            raise SparqlError(f"Could not parse {content_type or 'RDF'} response: {exc}") from exc
        return graph
