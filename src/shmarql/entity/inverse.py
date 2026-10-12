"""Inverse relations pre-rendering (ported from ldview's ``inverse_relations.py``)."""

from __future__ import annotations

from collections.abc import Callable

from rdflib import RDF, Graph, URIRef

from .labels import best_label
from .settings import DisplaySettings
from .uri_utils import shorten_uri

HOP1 = URIRef("urn:ldview:hop1pred")
HOP2 = URIRef("urn:ldview:hop2pred")
_SYNTHETIC = {str(HOP1), str(HOP2)}


def prerender_inverse_relations(
    graph: Graph,
    id_uri: str,
    settings: DisplaySettings,
    inverse_counts: dict[str, int] | None = None,
    query_link: Callable[[str, str], str] | None = None,
    preferred_lang: str | None = None,
) -> dict[str, dict]:
    """Group the subjects that point at ``id_uri`` by the full predicate chain.

    ``graph`` is the result of :meth:`EntitySource.get_inverse_relations_graph`, where
    subjects reaching the entity via 1 or 2 blank/skolem nodes carry the hop predicates
    in synthetic ``urn:ldview:hop1pred`` / ``urn:ldview:hop2pred`` triples.
    ``query_link(query, title)`` builds the link to the query editor that is shown when
    there are more subjects than ``settings.max_inverse_subjects``.
    """

    def _short(uri: str) -> dict:
        return shorten_uri(uri, settings.namespaces)

    groups: dict[tuple[str, ...], dict] = {}

    for s, p, o in graph:
        if str(o) != id_uri:
            continue
        final_pred = str(p)
        if final_pred in _SYNTHETIC:
            continue
        subj = str(s)
        if subj.startswith("_:") or settings.skolem_uri_pattern in subj or subj == id_uri:
            continue
        if not isinstance(s, URIRef):
            continue

        via_chain = []
        hop1_uri = next((str(o2) for o2 in graph.objects(s, HOP1)), None)
        hop2_uri = next((str(o2) for o2 in graph.objects(s, HOP2)), None)
        if hop1_uri:
            via_chain.append({"pred": hop1_uri, "pred_short": _short(hop1_uri)})
        if hop2_uri:
            via_chain.append({"pred": hop2_uri, "pred_short": _short(hop2_uri)})

        chain_key = tuple(h["pred"] for h in via_chain) + (final_pred,)
        if chain_key not in groups:
            groups[chain_key] = {
                "final_pred": final_pred,
                "final_pred_short": _short(final_pred),
                "via_chain": via_chain,
                "subjects": [],
                "_seen": set(),
            }
        if subj in groups[chain_key]["_seen"]:
            continue
        groups[chain_key]["_seen"].add(subj)

        label = (
            best_label(
                graph, s, settings.label_predicates, preferred_lang, settings.fallback_languages
            )
            or ""
        )

        type_uri = type_prefix = type_local = None
        all_types = {str(t) for t in graph.objects(s, RDF.type)}
        if all_types:
            for preferred in settings.type_predicate_priority:
                if preferred in all_types:
                    type_uri = preferred
                    break
            if type_uri is None:
                type_uri = sorted(all_types)[0]
            short = _short(type_uri)
            type_prefix = short.get("prefix", "")
            type_local = short.get("local", type_uri)
            if type_prefix and type_prefix.endswith(":"):
                type_prefix = type_prefix[:-1]

        groups[chain_key]["subjects"].append(
            {
                "uri": subj,
                "label": label,
                "type_uri": type_uri,
                "type_prefix": type_prefix,
                "type_local": type_local,
            }
        )

    for group in groups.values():
        group["subjects"].sort(key=lambda x: (not x["label"], x["label"].lower(), x["uri"]))

    inverse_relations: dict[str, dict] = {}
    for chain_key, group in groups.items():
        final_pred = group["final_pred"]
        if inverse_counts:
            total_count = inverse_counts.get(final_pred, len(group["subjects"]))
        else:
            total_count = len(group["subjects"])
        entry = {
            "final_pred": final_pred,
            "final_pred_short": group["final_pred_short"],
            "via_chain": group["via_chain"],
            "subjects": group["subjects"][: settings.max_inverse_subjects],
            "total_count": total_count,
            "query_url": None,
        }
        if total_count > settings.max_inverse_subjects and query_link:
            label_optionals = "\n  ".join(
                f"OPTIONAL {{ ?s <{lp}> ?label }}" for lp in settings.label_predicates
            )
            query = (
                f"SELECT ?s ?label WHERE {{\n  ?s <{final_pred}> <{id_uri}> .\n"
                f"  FILTER(!isBlank(?s))\n  {label_optionals}\n}} ORDER BY ?s"
            )
            entry["query_url"] = query_link(query, f"Inverse relations for {id_uri}")
        inverse_relations["\x00".join(chain_key)] = entry

    return inverse_relations
