"""Turn an RDF graph about one entity into template data.

This is a port of ldview's ``process_subject()`` and the HTML part of
``resolve_uri()``: the main subject, other directly referenced subjects, and all
blank (or skolemised) nodes are converted into grouped, label-aware property
tables; inverse relations, images and coordinates are added from extra queries.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

import nh3
from markupsafe import Markup
from rdflib import RDF, XSD, BNode, Graph, Literal, URIRef

from .inverse import prerender_inverse_relations
from .labels import best_label, pick_by_language
from .settings import DisplaySettings
from .source import EntitySource
from .uri_utils import parse_wkt_geometry, shorten_uri

log = logging.getLogger("shmarql.entity")

NUMERIC_DATATYPES = {
    XSD.integer, XSD.int, XSD.long, XSD.short, XSD.byte,
    XSD.nonNegativeInteger, XSD.positiveInteger, XSD.nonPositiveInteger, XSD.negativeInteger,
    XSD.unsignedInt, XSD.unsignedLong, XSD.unsignedShort, XSD.unsignedByte,
    XSD.decimal, XSD.float, XSD.double,
}  # fmt: skip


def group_predicates(predicates: list[dict], predicate_groups: list[list[str]]) -> list[dict]:
    """Group predicate rows according to the configured predicate groups."""
    result = []
    used: list[dict] = []
    for group in predicate_groups:
        rows: list[dict] = []
        for pred_uri in group:
            matching = [p for p in predicates if p["predicate"] == pred_uri]
            if matching:
                rows.extend(matching)
                used.extend(matching)
        if rows:
            result.append({"predicates": rows})
    others = [p for p in predicates if not any(p is u for u in used)]
    if others:
        result.append({"predicates": sorted(others, key=lambda x: x["predicate"])})
    return result


def is_blank_like(term: Any, settings: DisplaySettings) -> bool:
    value = str(term)
    return isinstance(term, BNode) or value.startswith("_:") or settings.skolem_uri_pattern in value


def sanitize_html(value: str, settings: DisplaySettings) -> str:
    return nh3.clean(
        value,
        tags=set(settings.allowed_html_tags),
        attributes={tag: set(attrs) for tag, attrs in settings.allowed_html_attrs.items()},
    )


def process_subject(
    subject: URIRef | BNode,
    graph: Graph,
    settings: DisplaySettings,
    is_main_subject: bool = False,
    id_uri: str | None = None,
    object_labels: dict[str, str] | None = None,
    preferred_lang: str | None = None,
) -> dict[str, Any]:
    """Collect the display data for one subject of ``graph``."""
    ns = settings.namespaces
    subject_uri = str(subject)
    is_blank = is_blank_like(subject, settings)

    predicates: list[dict] = []
    types: list[dict] = []
    images: list[dict] = []
    coordinates_list: list[dict] = []
    current = {"latitude": None, "longitude": None}
    label_candidates: list[tuple] = []
    description_candidates: list[tuple] = []
    lat_preds = set(settings.coordinate_predicates.get("latitude", []))
    lon_preds = set(settings.coordinate_predicates.get("longitude", []))
    wkt_preds = set(settings.wkt_predicates)

    def find_label(node: Any, is_blank_node: bool = False) -> str | None:
        label = best_label(
            graph, node, settings.label_predicates, preferred_lang, settings.fallback_languages
        )
        if label is None and is_blank_node:
            # Follow bn_label_predicate_paths to a node that has a label.
            for path_pred in settings.bn_label_predicate_paths:
                for target in graph.objects(node, URIRef(path_pred)):
                    label = best_label(
                        graph,
                        target,
                        settings.label_predicates,
                        preferred_lang,
                        settings.fallback_languages,
                    )
                    if label is not None:
                        return label
        return label

    for _s, _p, o in graph.triples((subject, RDF.type, None)):
        types.append(shorten_uri(str(o), ns))
    types.sort(
        key=lambda t: (
            settings.type_predicate_priority.index(t["uri"])
            if t["uri"] in settings.type_predicate_priority
            else len(settings.type_predicate_priority),
            t["uri"],
        )
    )

    main_label = find_label(subject, is_blank_node=is_blank)

    relation_to_main = relation_uri = None
    if not is_main_subject:
        for s, p, _o in graph.triples((None, None, subject)):
            if str(s) == id_uri:
                relation_to_main = shorten_uri(str(p), ns)
                relation_uri = str(p)

    for _s, p, o in sorted(
        graph.triples((subject, None, None)), key=lambda t: (str(t[1]), str(t[2]))
    ):
        predicate = str(p)
        obj = str(o)

        if predicate in settings.image_predicates:
            images.append(
                {"url": obj, "link_url": obj, "predicate": predicate,
                 "predicate_short": shorten_uri(predicate, ns)}
            )  # fmt: skip
        if predicate in settings.iiif_image_predicates:
            service = obj.rstrip("/")
            images.append(
                {
                    "url": service + settings.iiif_image_suffix,
                    "link_url": service + "/full/max/0/default.jpg",
                    "predicate": predicate,
                    "predicate_short": shorten_uri(predicate, ns),
                }
            )

        if predicate in lat_preds:
            try:
                current["latitude"] = float(obj)
            except ValueError:
                pass
        elif predicate in lon_preds:
            try:
                current["longitude"] = float(obj)
            except ValueError:
                pass
        if predicate in wkt_preds:
            geom = parse_wkt_geometry(obj)
            if geom is not None:
                if is_main_subject:
                    geom["label"] = main_label
                coordinates_list.append(geom)
        if current["latitude"] is not None and current["longitude"] is not None:
            if is_main_subject:
                current["label"] = main_label
            coordinates_list.append(dict(current))
            current = {"latitude": None, "longitude": None}

        # Coordinates held by a blank / skolem node hanging off this subject.
        is_blank_obj = not isinstance(o, Literal) and is_blank_like(o, settings)
        if is_blank_obj:
            blank_coords = {"latitude": None, "longitude": None}
            wkt_from_blank = None
            for _bs, bp, bo in graph.triples((o, None, None)):
                bp_str = str(bp)
                if bp_str in lat_preds:
                    try:
                        blank_coords["latitude"] = float(bo)
                    except ValueError:
                        pass
                elif bp_str in lon_preds:
                    try:
                        blank_coords["longitude"] = float(bo)
                    except ValueError:
                        pass
                elif bp_str in wkt_preds:
                    parsed = parse_wkt_geometry(str(bo))
                    if parsed is not None:
                        wkt_from_blank = parsed
            if blank_coords["latitude"] is not None and blank_coords["longitude"] is not None:
                blank_coords["label"] = find_label(o)
                coordinates_list.append(blank_coords)
            elif wkt_from_blank is not None:
                wkt_from_blank["label"] = find_label(o)
                coordinates_list.append(wkt_from_blank)

        if is_main_subject and predicate in settings.label_predicates:
            lang = o.language if isinstance(o, Literal) else None
            label_candidates.append((predicate, lang, obj))

        obj_label = None
        if is_blank_obj:
            obj_label = find_label(o, is_blank_node=True)
        elif object_labels and obj.startswith("http"):
            obj_label = object_labels.get(obj)

        is_literal = isinstance(o, Literal)
        is_numeric = is_literal and o.datatype in NUMERIC_DATATYPES
        is_html = is_literal and (
            o.datatype == RDF.HTML or predicate in settings.html_literal_predicates
        )
        if is_html:
            obj = sanitize_html(str(o), settings)

        if is_main_subject and predicate in settings.description_predicates:
            lang = o.language if isinstance(o, Literal) else None
            description_candidates.append((predicate, lang, obj, is_html))

        datatype_to_show = language_tag = None
        if is_literal:
            if o.language:
                language_tag = o.language
            elif o.datatype and o.datatype not in (XSD.string, XSD.integer):
                datatype_to_show = str(o.datatype)

        if predicate in settings.hide_predicates:
            continue
        predicates.append(
            {
                "predicate": predicate,
                "predicate_short": shorten_uri(predicate, ns),
                "object": obj,
                "object_short": shorten_uri(obj, ns),
                "is_blank_object": is_blank_obj,
                "object_anchor": blank_anchor(obj) if is_blank_obj else None,
                "is_uri": isinstance(o, URIRef) and not is_blank_obj,
                "object_label": obj_label,
                "is_numeric": is_numeric,
                "is_html": is_html,
                "is_literal": is_literal,
                "is_wkt": predicate in wkt_preds,
                "datatype": datatype_to_show,
                "language": language_tag,
            }
        )

    main_description = None
    picked = pick_by_language(
        description_candidates,
        settings.description_predicates,
        preferred_lang,
        settings.fallback_languages,
    )
    if picked:
        main_description, desc_is_html = picked
        if desc_is_html:
            main_description = Markup(main_description)

    picked_label = pick_by_language(
        label_candidates, settings.label_predicates, preferred_lang, settings.fallback_languages
    )
    if picked_label:
        main_label = picked_label[0]

    return {
        "subject": subject_uri,
        "anchor": blank_anchor(subject_uri),
        "subject_short": shorten_uri(subject_uri, ns),
        "types": types,
        "main_label": main_label,
        "main_description": main_description if is_main_subject else None,
        "images": images if is_main_subject else [],
        "predicate_groups": group_predicates(predicates, settings.predicate_groups),
        "is_blank": is_blank,
        "relation_to_main": relation_to_main,
        "relation_uri": relation_uri,
        "coordinates_list": coordinates_list or None,
        "predicate_chain": [],
        "depth": 0,
    }


def _coord_key(coord: dict) -> tuple:
    if coord.get("wkt"):
        return ("wkt", coord["wkt"])
    return ("latlon", coord.get("latitude"), coord.get("longitude"))


def blank_anchor(value: str) -> str:
    """A stable HTML id for a (blank) node."""
    import hashlib

    return "bn-" + hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


async def build_entity_view(
    source: EntitySource,
    graph: Graph,
    id_uri: str,
    preferred_lang: str | None = None,
    query_link: Callable[[str, str], str] | None = None,
) -> dict[str, Any]:
    """Build the full template context for the entity page."""
    settings = source.settings
    ns = settings.namespaces
    main_node = URIRef(id_uri)

    # Independent lookups run concurrently with the label lookup below.
    async def inverse() -> dict[str, dict]:
        if not settings.show_inverse_relations:
            return {}
        inverse_graph, inverse_counts = await asyncio.gather(
            source.get_inverse_relations_graph(id_uri),
            source.get_inverse_relations_counts(id_uri),
        )
        return prerender_inverse_relations(
            inverse_graph,
            id_uri,
            settings,
            inverse_counts=inverse_counts,
            query_link=query_link,
            preferred_lang=preferred_lang,
        )

    inverse_task = asyncio.ensure_future(inverse())
    images_task = asyncio.ensure_future(source.get_images(id_uri))
    coords_task = asyncio.ensure_future(source.get_coordinates(id_uri))

    # Labels for all URI objects: first from the graph itself, then from the endpoint.
    image_preds = set(settings.image_predicates)
    referenced = {
        str(o)
        for _s, p, o in graph
        if isinstance(o, URIRef)
        and str(o).startswith("http")
        and p != RDF.type
        and str(p) not in image_preds
        and not is_blank_like(o, settings)
    }
    object_labels: dict[str, str] = {}
    for uri in referenced:
        label = best_label(
            graph,
            URIRef(uri),
            settings.label_predicates,
            preferred_lang,
            settings.fallback_languages,
        )
        if label is not None:
            object_labels[uri] = label
    missing = [u for u in referenced if u not in object_labels]
    if missing:
        object_labels.update(await source.get_labels_for_uris(missing, preferred_lang))

    main_object_uris = {str(o) for o in graph.objects(main_node, None)}

    main_subject = None
    others: dict[str, dict] = {}
    blank_nodes: list[dict] = []
    blank_node_uris: set[str] = set()
    for subject in sorted(set(graph.subjects()), key=str):
        subject_uri = str(subject)
        if is_blank_like(subject, settings):
            data = process_subject(
                subject, graph, settings, object_labels=object_labels, preferred_lang=preferred_lang
            )
            blank_nodes.append(data)
            blank_node_uris.add(subject_uri)
            continue
        if subject_uri != id_uri and subject_uri not in main_object_uris:
            continue
        data = process_subject(
            subject,
            graph,
            settings,
            is_main_subject=subject_uri == id_uri,
            id_uri=id_uri,
            object_labels=object_labels,
            preferred_lang=preferred_lang,
        )
        if subject_uri == id_uri:
            main_subject = data
        else:
            others[subject_uri] = data

    # Predicate chains (main subject -> ... -> blank node) and nesting depth.
    parent_map: dict[str, tuple[str, dict, str]] = {}
    for s, p, o in graph:
        o_str, s_str = str(o), str(s)
        if o_str in blank_node_uris and (s_str == id_uri or s_str in blank_node_uris):
            parent_map.setdefault(o_str, (s_str, shorten_uri(str(p), ns), str(p)))
    bn_labels = {bn["subject"]: bn.get("main_label") for bn in blank_nodes}
    for bn in blank_nodes:
        chain = []
        current = bn["subject"]
        visited: set[str] = set()
        while current in parent_map and current not in visited:
            visited.add(current)
            parent_uri, pred_short, pred_uri = parent_map[current]
            chain.insert(
                0,
                {
                    "pred_short": pred_short,
                    "pred_uri": pred_uri,
                    "node_label": bn_labels.get(current),
                    "node_uri": current,
                },
            )
            current = parent_uri
        bn["predicate_chain"] = chain
        bn["depth"] = len(chain)
    blank_nodes.sort(key=lambda x: (x["depth"], x["subject"]))

    # Back-fill labels of blank objects in the main table from the processed subjects.
    if main_subject:
        labels = {bn["subject"]: bn["main_label"] for bn in blank_nodes if bn.get("main_label")}
        labels.update({k: v["main_label"] for k, v in others.items() if v.get("main_label")})
        for group in main_subject["predicate_groups"]:
            for row in group["predicates"]:
                if row["is_blank_object"] and not row["object_label"]:
                    row["object_label"] = labels.get(row["object"])

        existing = {img["url"] for img in main_subject["images"]}
        for img in await images_task:
            if img["url"] not in existing:
                existing.add(img["url"])
                main_subject["images"].append(
                    {
                        "url": img["url"],
                        "link_url": img["link_url"],
                        "predicate": "",
                        "predicate_short": {"prefix": "", "local": ""},
                    }
                )
        coords = main_subject["coordinates_list"] or []
        seen = {_coord_key(c) for c in coords}
        for coord in await coords_task:
            if _coord_key(coord) not in seen:
                seen.add(_coord_key(coord))
                coords.append(coord)
        main_subject["coordinates_list"] = coords or None

    inverse_relations = await inverse_task
    if not main_subject:
        # Don't leave the lookups dangling.
        await asyncio.gather(images_task, coords_task)

    subjects: list[dict] = []
    if main_subject:
        subjects.append(main_subject)
    subjects.extend(others[k] for k in sorted(others))
    subjects.extend(blank_nodes)

    return {
        "subjects": subjects,
        "main_subject": main_subject,
        "other_subjects": [others[k] for k in sorted(others)],
        "blank_nodes": blank_nodes,
        "inverse_relations": inverse_relations,
        "query_uri": id_uri,
        "query_uri_short": shorten_uri(id_uri, ns),
        "settings": settings,
    }
