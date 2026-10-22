"""Display settings for the entity viewer (ported from ldview's ``config.py``).

The defaults below can be overridden globally with a ``display:`` mapping at the
top level of the profiles YAML file, and per profile with a ``display:`` mapping
on a profile entry. Keys are the lower-case versions of the ldview settings,
e.g. ``label_predicates`` or ``construct_query``.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Any

DEFAULT_NAMESPACES: dict[str, str] = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "skosxl": "http://www.w3.org/2008/05/skos-xl#",
    "schema": "http://schema.org/",
    "sdo": "https://schema.org/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "geo": "http://www.opengis.net/ont/geosparql#",
    "sf": "http://www.opengis.net/ont/sf#",
    "wgs84": "http://www.w3.org/2003/01/geo/wgs84_pos#",
    "iiif": "http://iiif.io/api/presentation/3#",
    "aat": "http://vocab.getty.edu/aat/",
    "sem": "http://semanticweb.cs.vu.nl/2009/11/sem/",
    "cidoc": "http://www.cidoc-crm.org/cidoc-crm/",
    "crm": "http://www.cidoc-crm.org/cidoc-crm/",
    "linkedart": "https://linked.art/ns/terms/",
    "prov": "http://www.w3.org/ns/prov#",
    "pico": "https://personsincontext.org/model#",
    "bibo": "http://purl.org/ontology/bibo/",
    "rdaw": "http://rdaregistry.info/Elements/w/",
    "rdae": "http://rdaregistry.info/Elements/e/",
    "rdam": "http://rdaregistry.info/Elements/m/",
    "mads": "http://www.loc.gov/mads/rdf/v1#",
    "dcat": "http://www.w3.org/ns/dcat#",
    "sh": "http://www.w3.org/ns/shacl#",
    "wd": "http://www.wikidata.org/entity/",
    "wdt": "http://www.wikidata.org/prop/direct/",
    "p": "http://www.wikidata.org/prop/",
    "wikibase": "http://wikiba.se/ontology#",
    "pnv": "https://w3id.org/pnv#",
    "rico": "https://www.ica.org/standards/RiC/ontology#",
}

DEFAULT_LABEL_PREDICATES = [
    "http://www.w3.org/2004/02/skos/core#prefLabel",
    "http://www.w3.org/2000/01/rdf-schema#label",
    "http://purl.org/dc/terms/title",
    "http://purl.org/dc/elements/1.1/title",
    "http://schema.org/name",
    "https://schema.org/name",
    "http://xmlns.com/foaf/0.1/name",
    "http://www.w3.org/2004/02/skos/core#altLabel",
]

DEFAULT_DESCRIPTION_PREDICATES = [
    "http://www.w3.org/2004/02/skos/core#definition",
    "http://purl.org/dc/terms/description",
    "http://purl.org/dc/elements/1.1/description",
    "http://schema.org/description",
    "https://schema.org/description",
    "http://www.w3.org/2004/02/skos/core#description",
    "http://www.w3.org/2000/01/rdf-schema#comment",
]

DEFAULT_TYPE_PREDICATE_PRIORITY = [
    "http://schema.org/IndividualProduct",
    "https://schema.org/IndividualProduct",
    "http://schema.org/ProductModel",
    "https://schema.org/ProductModel",
    "http://schema.org/Book",
    "https://schema.org/Book",
    "http://schema.org/Person",
    "https://schema.org/Person",
    "http://schema.org/Organization",
    "https://schema.org/Organization",
    "http://schema.org/Place",
    "https://schema.org/Place",
    "http://schema.org/CreativeWork",
    "https://schema.org/CreativeWork",
    "http://www.w3.org/2004/02/skos/core#Concept",
    "http://schema.org/Thing",
    "http://www.w3.org/2000/01/rdf-schema#Resource",
]

DEFAULT_PREDICATE_GROUPS = [
    ["http://schema.org/text", "https://schema.org/text"],
    [
        "http://www.w3.org/2004/02/skos/core#prefLabel",
        "http://www.w3.org/2000/01/rdf-schema#label",
        "http://purl.org/dc/terms/title",
        "http://purl.org/dc/elements/1.1/title",
        "http://schema.org/name",
        "https://schema.org/name",
        "http://schema.org/familyName",
        "http://schema.org/givenName",
        "http://schema.org/alternateName",
        "http://www.w3.org/2004/02/skos/core#altLabel",
        "http://xmlns.com/foaf/0.1/nick",
    ],
    [
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "http://schema.org/additionalType",
        "https://schema.org/additionalType",
    ],
    [
        "http://schema.org/creator",
        "https://schema.org/creator",
        "http://schema.org/author",
        "https://schema.org/author",
        "http://schema.org/contributor",
        "https://schema.org/contributor",
    ],
    ["http://schema.org/dateCreated", "https://schema.org/dateCreated"],
    ["http://schema.org/disambiguatingDescription", "https://schema.org/disambiguatingDescription"],
    [
        "http://www.w3.org/2004/02/skos/core#definition",
        "http://purl.org/dc/terms/description",
        "http://purl.org/dc/elements/1.1/description",
        "http://schema.org/description",
        "https://schema.org/description",
        "http://www.w3.org/2004/02/skos/core#description",
        "http://www.w3.org/2000/01/rdf-schema#comment",
    ],
    ["http://schema.org/nationality", "https://schema.org/nationality"],
    [
        "http://schema.org/birthDate",
        "https://schema.org/birthDate",
        "http://schema.org/birthPlace",
        "https://schema.org/birthPlace",
        "http://schema.org/deathDate",
        "https://schema.org/deathDate",
        "http://schema.org/deathPlace",
        "https://schema.org/deathPlace",
    ],
    [
        "http://schema.org/mainEntity",
        "http://www.w3.org/2004/02/skos/core#broader",
        "http://www.w3.org/2004/02/skos/core#narrower",
        "http://www.w3.org/2004/02/skos/core#related",
    ],
    [
        "http://schema.org/width",
        "https://schema.org/width",
        "http://schema.org/height",
        "https://schema.org/height",
        "http://schema.org/position",
        "https://schema.org/position",
    ],
    [
        "http://www.w3.org/2002/07/owl#sameAs",
        "http://www.w3.org/2004/02/skos/core#exactMatch",
        "http://schema.org/sameAs",
        "http://schema.org/mainEntityOfPage",
        "http://www.w3.org/2000/01/rdf-schema#seeAlso",
    ],
]

# SPARQL CONSTRUCT template used to fetch an entity, including up to four levels of
# blank (or skolemised) nodes hanging off it, plus labels reachable via
# ``bn_label_predicate_paths``. Placeholders: {subject_uris}, {skolem_pattern},
# {bn_label_path_preds}, {label_preds}.
DEFAULT_CONSTRUCT_QUERY = """
CONSTRUCT {
    ?s ?p ?o .
    ?o ?p2 ?o2 .
    ?o2 ?p3 ?o3 .
    ?o3 ?p4 ?o4 .
    ?target ?labelPred ?targetLabel .
}
WHERE {
    VALUES ?s { {subject_uris} }

    { ?s ?p ?o . }
    UNION
    {
        ?s ?p ?o .
        FILTER(isBlank(?o) || CONTAINS(STR(?o), "{skolem_pattern}"))
        ?o ?p2 ?o2 .
    }
    UNION
    {
        ?s ?p ?o .
        FILTER(isBlank(?o) || CONTAINS(STR(?o), "{skolem_pattern}"))
        ?o ?p2 ?o2 .
        FILTER(isBlank(?o2) || CONTAINS(STR(?o2), "{skolem_pattern}"))
        ?o2 ?p3 ?o3 .
    }
    UNION
    {
        ?s ?p ?o .
        FILTER(isBlank(?o) || CONTAINS(STR(?o), "{skolem_pattern}"))
        ?o ?p2 ?o2 .
        FILTER(isBlank(?o2) || CONTAINS(STR(?o2), "{skolem_pattern}"))
        ?o2 ?p3 ?o3 .
        FILTER(isBlank(?o3) || CONTAINS(STR(?o3), "{skolem_pattern}"))
        ?o3 ?p4 ?o4 .
    }
    UNION
    {
        ?s ?p ?o .
        FILTER(isBlank(?o) || CONTAINS(STR(?o), "{skolem_pattern}"))
        ?o ?pathPred ?target .
        VALUES ?pathPred { {bn_label_path_preds} }
        ?target ?labelPred ?targetLabel .
        VALUES ?labelPred { {label_preds} }
    }
}
"""

# Fallback for endpoints that cannot handle the query above (no UNION/CONTAINS).
DEFAULT_CONSTRUCT_QUERY_SIMPLE = """
CONSTRUCT {{
    <{id_uri}> ?p ?o .
    ?o ?p2 ?o2 .
    ?o2 ?p3 ?o3 .
    ?o3 ?p4 ?o4 .
}}
WHERE {{
    <{id_uri}> ?p ?o .
    OPTIONAL {{
        ?o ?p2 ?o2 .
        FILTER(isBlank(?o))
        OPTIONAL {{
            ?o2 ?p3 ?o3 .
            FILTER(isBlank(?o2))
            OPTIONAL {{
                ?o3 ?p4 ?o4 .
                FILTER(isBlank(?o3))
            }}
        }}
    }}
}}
"""


@dataclass(frozen=True)
class DisplaySettings:
    namespaces: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_NAMESPACES))
    label_predicates: list[str] = field(default_factory=lambda: list(DEFAULT_LABEL_PREDICATES))
    description_predicates: list[str] = field(
        default_factory=lambda: list(DEFAULT_DESCRIPTION_PREDICATES)
    )
    # Predicates hidden from the property tables (rdf:type is shown as badges instead).
    hide_predicates: list[str] = field(
        default_factory=lambda: ["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"]
    )
    image_predicates: list[str] = field(
        default_factory=lambda: [
            "http://xmlns.com/foaf/0.1/depiction",
            "http://schema.org/image",
            "https://schema.org/image",
            "http://schema.org/thumbnailUrl",
            "https://schema.org/thumbnailUrl",
            "http://www.wikidata.org/prop/direct/P18",
        ]
    )
    # The object of these predicates is a IIIF Image API service URI.
    iiif_image_predicates: list[str] = field(
        default_factory=lambda: ["http://iiif.io/api/presentation/3#service"]
    )
    iiif_image_suffix: str = "/full/400,/0/default.jpg"
    # Paths (lists of predicates, '^' prefix = inverse) followed to discover images.
    image_paths: list[list[str]] = field(
        default_factory=lambda: [
            ["http://schema.org/associatedMedia"],
            ["https://schema.org/associatedMedia"],
        ]
    )
    sort_predicates: list[str] = field(
        default_factory=lambda: [
            "http://schema.org/position",
            "https://schema.org/position",
            "http://schema.org/name",
            "https://schema.org/name",
        ]
    )
    # URIs containing this pattern are treated as (skolemised) blank nodes.
    skolem_uri_pattern: str = "/.well-known/genid/"
    # Extra predicates followed to find labels for blank nodes without a label.
    bn_label_predicate_paths: list[str] = field(default_factory=list)
    type_predicate_priority: list[str] = field(
        default_factory=lambda: list(DEFAULT_TYPE_PREDICATE_PRIORITY)
    )
    coordinate_predicates: dict[str, list[str]] = field(
        default_factory=lambda: {
            "latitude": [
                "http://www.w3.org/2003/01/geo/wgs84_pos#lat",
                "http://schema.org/latitude",
            ],
            "longitude": [
                "http://www.w3.org/2003/01/geo/wgs84_pos#long",
                "http://schema.org/longitude",
            ],
        }
    )
    wkt_predicates: list[str] = field(
        default_factory=lambda: [
            "http://www.opengis.net/ont/geosparql#asWKT",
            "http://www.wikidata.org/prop/direct/P625",
        ]
    )
    coordinate_paths: list[list[str]] = field(
        default_factory=lambda: [
            ["http://www.opengis.net/ont/geosparql#hasGeometry"],
            [
                "http://schema.org/spatialCoverage",
                "http://www.opengis.net/ont/geosparql#hasGeometry",
            ],
        ]
    )
    predicate_groups: list[list[str]] = field(
        default_factory=lambda: [list(g) for g in DEFAULT_PREDICATE_GROUPS]
    )
    html_literal_predicates: list[str] = field(
        default_factory=lambda: ["http://schema.org/text", "https://schema.org/text"]
    )
    allowed_html_tags: list[str] = field(
        default_factory=lambda: [
            "a", "abbr", "b", "blockquote", "br", "code", "em", "i", "li", "ol",
            "p", "pre", "span", "strong", "sub", "sup", "table", "tbody", "td",
            "th", "thead", "tr", "ul", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
            "dl", "dt", "dd", "img",
        ]
    )  # fmt: skip
    allowed_html_attrs: dict[str, list[str]] = field(
        default_factory=lambda: {
            "a": ["href", "title", "target"],
            "abbr": ["title"],
            "img": ["src", "alt", "title", "width", "height"],
            "td": ["colspan", "rowspan"],
            "th": ["colspan", "rowspan"],
            "span": ["class"],
        }
    )
    construct_query: str = DEFAULT_CONSTRUCT_QUERY
    construct_query_simple: str = DEFAULT_CONSTRUCT_QUERY_SIMPLE
    # Languages tried, in order, after the user's preferred language and untagged
    # literals when picking a label/description ("mul" is used by Wikidata).
    fallback_languages: list[str] = field(default_factory=lambda: ["mul", "en"])
    # Number of URIs per label lookup query (lookups run concurrently).
    label_batch_size: int = 100
    max_inverse_subjects: int = 20
    max_inverse_predicates: int = 10
    max_inverse_blank_hops: int = 2
    default_map_zoom_level: int = 10
    # Disable expensive extra lookups (images/coordinates/inverse relations) if needed.
    show_inverse_relations: bool = True
    fetch_images: bool = True
    fetch_coordinates: bool = True

    def merged(self, overrides: dict[str, Any] | None) -> DisplaySettings:
        """Return a copy with ``overrides`` applied. ``namespaces`` are merged, not replaced."""
        if not overrides:
            return self
        known = {f.name for f in dataclasses.fields(self)}
        changes: dict[str, Any] = {}
        for key, value in overrides.items():
            key = str(key).lower()
            if key not in known:
                raise ValueError(f"Unknown entity display setting: {key!r}")
            if key == "namespaces" and isinstance(value, dict):
                value = {**self.namespaces, **value}
            changes[key] = value
        return dataclasses.replace(self, **changes)
