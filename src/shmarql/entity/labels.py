"""Language-aware choice between label/description candidates."""

from __future__ import annotations

from collections.abc import Sequence

from rdflib import Graph, Literal, URIRef
from rdflib.term import Node


def pick_by_language(
    candidates: list[tuple],
    predicates: list[str],
    preferred_lang: str | None,
    fallback_languages: Sequence[str] = (),
) -> tuple | None:
    """Pick the best value from ``(predicate, lang, *value)`` tuples.

    Languages are tried in the order: preferred, untagged, ``fallback_languages``;
    within a language the predicate priority order decides.
    """
    lookup: dict[tuple[str, str | None], tuple] = {}
    for cand in candidates:
        lookup.setdefault((cand[0], (cand[1] or "").lower() or None), cand[2:])
    languages: list[str | None] = []
    if preferred_lang:
        languages.append(preferred_lang.lower())
    languages.append(None)
    languages.extend(lang.lower() for lang in fallback_languages)
    for lang in languages:
        for pred in predicates:
            if (pred, lang) in lookup:
                return lookup[(pred, lang)]
    return candidates[0][2:] if candidates else None


def best_label(
    graph: Graph,
    node: Node,
    label_predicates: Sequence[str],
    preferred_lang: str | None = None,
    fallback_languages: Sequence[str] = (),
) -> str | None:
    """The best label of ``node`` in ``graph``, honouring predicate and language priority."""
    candidates = []
    for pred in label_predicates:
        for obj in graph.objects(node, URIRef(pred)):
            lang = obj.language if isinstance(obj, Literal) else None
            candidates.append((pred, lang, str(obj)))
    picked = pick_by_language(
        candidates, list(label_predicates), preferred_lang, fallback_languages
    )
    return picked[0] if picked else None
