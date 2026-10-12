"""Fetch entity data from a SPARQL profile (ported from ldview's ``rdf_sources``).

Combines ldview's ``SPARQLEndpoint`` and ``ProxySPARQLEndpoint`` behaviour: the
CONSTRUCT query falls back from the full blank-node-traversing query, to a simpler
OPTIONAL-based query, to only the direct triples.
"""

from __future__ import annotations

import asyncio
import logging

from rdflib import Graph

from ..profiles import Profile
from ..sparql_client import SparqlClient, SparqlError
from .labels import pick_by_language
from .settings import DisplaySettings
from .uri_utils import parse_wkt_geometry

log = logging.getLogger("shmarql.entity")


class ResourceNotFound(Exception):
    """No triples are available for the requested URI."""


# Placeholder used where a VALUES block would otherwise be empty (some engines reject `{ }`).
NO_MATCH = "<urn:shmarql:no-match>"


def _values(uris: list[str]) -> str:
    return " ".join(_iri(u) for u in uris) or NO_MATCH


def _iri(uri: str) -> str:
    """Render ``uri`` as a SPARQL IRI reference, refusing characters that break out of it."""
    if any(ch in uri for ch in '<>"{}|^`\\ \n\r\t'):
        raise ValueError(f"Invalid IRI: {uri!r}")
    return f"<{uri}>"


class EntitySource:
    def __init__(self, client: SparqlClient, profile: Profile, settings: DisplaySettings):
        self.client = client
        self.profile = profile
        self.settings = settings

    # -- the entity itself ---------------------------------------------------------------
    async def get_rdf_for_uri(self, id_uri: str) -> Graph:
        s = self.settings
        subject = _iri(id_uri)
        query = (
            s.construct_query.replace("{subject_uris}", subject)
            .replace("{bn_label_path_preds}", _values(s.bn_label_predicate_paths))
            .replace("{label_preds}", _values(s.label_predicates))
            .replace("{skolem_pattern}", s.skolem_uri_pattern)
        )
        attempts = [
            ("full", query),
            ("simple", s.construct_query_simple.format(id_uri=id_uri)),
            ("minimal", f"CONSTRUCT {{ {subject} ?p ?o . }} WHERE {{ {subject} ?p ?o . }}"),
        ]
        last_error: Exception | None = None
        for name, q in attempts:
            try:
                graph = await self.client.construct(self.profile, q)
            except SparqlError as exc:
                log.warning("%s CONSTRUCT failed on %s: %s", name, self.profile.name, exc)
                last_error = exc
                continue
            if len(graph) == 0:
                raise ResourceNotFound(f"No data found for {id_uri} in {self.profile.label}")
            return graph
        raise ResourceNotFound(f"Failed to fetch data for {id_uri}: {last_error}")

    # -- labels --------------------------------------------------------------------------
    async def get_labels_for_uris(self, uris, preferred_lang: str | None = None) -> dict[str, str]:
        """One label per URI, honouring label predicate and language priority.

        URIs are looked up in batches of ``label_batch_size``, a few batches at a time.
        """
        s = self.settings
        uri_list = sorted(
            {u for u in uris if isinstance(u, str) and u.startswith("http") and _safe(u)}
        )
        if not uri_list or not s.label_predicates:
            return {}
        languages = [""] + [lang for lang in [preferred_lang, *s.fallback_languages] if lang]
        lang_filter = ", ".join(
            f'"{_escape_string(lang.lower())}"' for lang in dict.fromkeys(languages)
        )
        semaphore = asyncio.Semaphore(4)

        async def batch(chunk: list[str]) -> list[dict]:
            query = (
                "SELECT ?s ?p ?l WHERE {\n"
                f"  VALUES ?s {{ {_values(chunk)} }}\n"
                f"  VALUES ?p {{ {_values(s.label_predicates)} }}\n"
                "  ?s ?p ?l .\n"
                f"  FILTER(LCASE(LANG(?l)) IN ({lang_filter}))\n"
                "}"
            )
            async with semaphore:
                try:
                    return await self.client.bindings(self.profile, query)
                except SparqlError as exc:
                    log.warning("Label lookup failed: %s", exc)
                    return []

        size = max(1, s.label_batch_size)
        chunks = [uri_list[i : i + size] for i in range(0, len(uri_list), size)]
        candidates: dict[str, list[tuple]] = {}
        for rows in await asyncio.gather(*(batch(chunk) for chunk in chunks)):
            for row in rows:
                subject = row.get("s", {}).get("value")
                pred = row.get("p", {}).get("value")
                label = row.get("l", {})
                if subject and pred and label.get("value"):
                    candidates.setdefault(subject, []).append(
                        (pred, label.get("xml:lang"), label["value"])
                    )
        labels: dict[str, str] = {}
        for subject, cands in candidates.items():
            picked = pick_by_language(
                cands, s.label_predicates, preferred_lang, s.fallback_languages
            )
            if picked:
                labels[subject] = picked[0]
        return labels

    # -- paths ---------------------------------------------------------------------------
    @staticmethod
    def _build_path_chain(id_uri: str, path: list[str], node_prefix: str) -> tuple[list[str], str]:
        """Triple patterns for ``path``; predicates prefixed with '^' are traversed inversely."""
        chain: list[str] = []
        prev = _iri(id_uri)
        for idx, predicate in enumerate(path):
            nxt = f"?{node_prefix}{idx}"
            if predicate.startswith("^"):
                chain.append(f"{nxt} {_iri(predicate[1:])} {prev} .")
            else:
                chain.append(f"{prev} {_iri(predicate)} {nxt} .")
            prev = nxt
        return chain, prev

    async def get_coordinates(self, id_uri: str) -> list[dict]:
        s = self.settings
        if not s.fetch_coordinates or not s.coordinate_paths:
            return []
        wkt_preds = _values(s.wkt_predicates)
        lat_preds = _values(s.coordinate_predicates.get("latitude", []))
        lon_preds = _values(s.coordinate_predicates.get("longitude", []))
        label_vars = [f"?lbl{i}" for i in range(len(s.label_predicates))]
        label_optionals = "\n      ".join(
            f"OPTIONAL {{ ?labelNode {_iri(p)} ?lbl{i} }}" for i, p in enumerate(s.label_predicates)
        )
        coalesce = f"COALESCE({', '.join(label_vars)})" if label_vars else '""'
        blocks = []
        for path_idx, path in enumerate(s.coordinate_paths):
            chain, geom_var = self._build_path_chain(id_uri, path, f"cn{path_idx}_")
            chain_str = "\n        ".join(chain)
            blocks.append(
                f"""    {{
        {chain_str}
        BIND(?cn{path_idx}_0 AS ?labelNode)
        {{
          {geom_var} ?wktPred ?wkt .
          VALUES ?wktPred {{ {wkt_preds} }}
        }} UNION {{
          {geom_var} ?latPred ?lat .
          {geom_var} ?lonPred ?lon .
          VALUES ?latPred {{ {lat_preds} }}
          VALUES ?lonPred {{ {lon_preds} }}
        }}
      }}"""
            )
        union = "\n    UNION\n".join(blocks)
        query = f"""SELECT ?wkt ?lat ?lon ?label WHERE {{
    {{
{union}
    }}
    {label_optionals}
    BIND({coalesce} AS ?label)
}}"""
        coordinates: list[dict] = []
        try:
            rows = await self.client.bindings(self.profile, query)
        except SparqlError as exc:
            log.warning("Coordinate lookup failed: %s", exc)
            return []
        for row in rows:
            label = row.get("label", {}).get("value") or None
            wkt_val = row.get("wkt", {}).get("value")
            if wkt_val:
                parsed = parse_wkt_geometry(wkt_val)
                if parsed:
                    parsed["label"] = label
                    coordinates.append(parsed)
                continue
            lat_val = row.get("lat", {}).get("value")
            lon_val = row.get("lon", {}).get("value")
            if lat_val and lon_val:
                try:
                    coordinates.append(
                        {"latitude": float(lat_val), "longitude": float(lon_val), "label": label}
                    )
                except ValueError:
                    pass
        return coordinates

    async def get_images(self, id_uri: str) -> list[dict]:
        s = self.settings
        if not s.fetch_images or not (s.image_predicates or s.iiif_image_predicates):
            return []
        all_paths = [[]] + list(s.image_paths or [])
        img_preds = _values(s.image_predicates)
        iiif_preds = _values(s.iiif_image_predicates)
        sort_preds = s.sort_predicates
        blocks = []
        for path_idx, path in enumerate(all_paths):
            chain, image_node = self._build_path_chain(id_uri, path, f"in{path_idx}_")
            chain_str = "\n        ".join(chain)
            pos_optionals = "\n        ".join(
                f"OPTIONAL {{ {image_node} {_iri(sp)} ?pos{i} }}" for i, sp in enumerate(sort_preds)
            )
            if not sort_preds:
                pos_binding = "BIND(0 AS ?position)"
            elif len(sort_preds) == 1:
                pos_binding = "BIND(?pos0 AS ?position)"
            else:
                pos_binding = (
                    "BIND(COALESCE("
                    + ", ".join(f"?pos{i}" for i in range(len(sort_preds)))
                    + ") AS ?position)"
                )
            blocks.append(
                f"""    {{
        {chain_str}
        {{
            {image_node} ?imgPred ?imgUrl .
            VALUES ?imgPred {{ {img_preds} }}
        }} UNION {{
            {image_node} ?iiifPred ?iiifService .
            VALUES ?iiifPred {{ {iiif_preds} }}
        }}
        {pos_optionals}
        {pos_binding}
    }}"""
            )
        query = (
            "SELECT ?imgUrl ?iiifService ?position WHERE {\n" + "\n    UNION\n".join(blocks) + "\n}"
        )
        images: list[dict] = []
        try:
            rows = await self.client.bindings(self.profile, query)
        except SparqlError as exc:
            log.warning("Image lookup failed: %s", exc)
            return []
        for row in rows:
            position = None
            pos_val = row.get("position", {}).get("value")
            if pos_val:
                try:
                    position = float(pos_val)
                except (TypeError, ValueError):
                    position = None
            img_url = row.get("imgUrl", {}).get("value")
            if img_url:
                images.append({"url": img_url, "link_url": img_url, "position": position})
                continue
            service = row.get("iiifService", {}).get("value")
            if service:
                service = service.rstrip("/")
                images.append(
                    {
                        "url": service + s.iiif_image_suffix,
                        "link_url": service + "/full/max/0/default.jpg",
                        "position": position,
                    }
                )
        images.sort(key=lambda x: (x["position"] is None, x["position"] or 0))
        return images

    # -- inverse relations -------------------------------------------------------------------
    async def get_inverse_relations_counts(self, id_uri: str) -> dict[str, int] | None:
        query = f"""SELECT ?p (COUNT(DISTINCT ?s) AS ?count) WHERE {{
    ?s ?p {_iri(id_uri)} .
    FILTER(!isBlank(?s) && !CONTAINS(STR(?s), "{self.settings.skolem_uri_pattern}"))
}} GROUP BY ?p"""
        try:
            rows = await self.client.bindings(self.profile, query)
        except SparqlError as exc:
            log.warning("Inverse relations count query failed: %s", exc)
            return None
        counts: dict[str, int] = {}
        for row in rows:
            try:
                counts[row["p"]["value"]] = int(row["count"]["value"])
            except (KeyError, ValueError):
                continue
        return counts

    async def get_inverse_relations_graph(self, id_uri: str) -> Graph:
        s = self.settings
        target = _iri(id_uri)
        label_values = _values(s.label_predicates)
        skolem = s.skolem_uri_pattern
        limit = s.max_inverse_subjects * s.max_inverse_predicates

        def blank(var: str) -> str:
            return f'(isBlank({var}) || CONTAINS(STR({var}), "{skolem}"))'

        def real(var: str) -> str:
            return f'(!isBlank({var}) && !CONTAINS(STR({var}), "{skolem}"))'

        parts = [
            f"    {{\n        ?real ?p_final {target} .\n        FILTER({real('?real')})\n    }}"
        ]
        if s.max_inverse_blank_hops >= 1:
            parts.append(
                f"""    {{
        ?blank1 ?p_final {target} .
        ?real ?hop1pred ?blank1 .
        FILTER({blank("?blank1")} && {real("?real")})
    }}"""
            )
        if s.max_inverse_blank_hops >= 2:
            parts.append(
                f"""    {{
        ?blank2 ?p_final {target} .
        ?blank1 ?hop2pred ?blank2 .
        ?real ?hop1pred ?blank1 .
        FILTER({blank("?blank2")} && {blank("?blank1")} && {real("?real")})
    }}"""
            )
        union = "\n    UNION\n".join(parts)
        query = f"""CONSTRUCT {{
    ?real ?p_final {target} .
    ?real ?label_pred ?label .
    ?real a ?type .
    ?real <urn:ldview:hop1pred> ?hop1pred .
    ?real <urn:ldview:hop2pred> ?hop2pred .
}}
WHERE {{
    {{
        SELECT DISTINCT ?real ?p_final ?hop1pred ?hop2pred WHERE {{
{union}
        }}
        LIMIT {limit}
    }}
    OPTIONAL {{
        ?real ?label_pred ?label .
        VALUES ?label_pred {{ {label_values} }}
    }}
    OPTIONAL {{ ?real a ?type . }}
}}"""
        try:
            return await self.client.construct(self.profile, query)
        except SparqlError as exc:
            log.warning("Inverse relations query failed, trying simplified query: %s", exc)
        simple = f"""CONSTRUCT {{ ?s ?p {target} . }}
WHERE {{
    ?s ?p {target} .
    FILTER(!isBlank(?s) && !CONTAINS(STR(?s), "{skolem}"))
}} LIMIT {limit}"""
        try:
            return await self.client.construct(self.profile, simple)
        except SparqlError as exc:
            log.error("Error getting inverse relations graph: %s", exc)
            return Graph()


def _escape_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _safe(uri: str) -> bool:
    try:
        _iri(uri)
        return True
    except ValueError:
        return False
