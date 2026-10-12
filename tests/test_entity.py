from urllib.parse import quote

from rdflib import BNode, Graph, Literal, URIRef
from rdflib.namespace import RDFS

from shmarql.entity.settings import DisplaySettings
from shmarql.entity.uri_utils import parse_wkt_geometry, shorten_uri
from shmarql.entity.view import group_predicates, process_subject
from shmarql.profiles import profile_key

from conftest import MAIN_ENDPOINT, OTHER_ENDPOINT
from fake_endpoint import FakeSparqlEndpoint

REMBRANDT = "http://example.org/rembrandt"
MAIN_KEY = profile_key(MAIN_ENDPOINT)


def entity(client, uri=REMBRANDT, **kwargs):
    return client.get("/entity", params={"uri": uri, **kwargs.pop("params", {})}, **kwargs)


def test_lookup_form_without_uri(client):
    r = client.get("/entity")
    assert r.status_code == 200
    assert 'name="uri"' in r.text


def test_main_subject_table(client):
    r = entity(client)
    assert r.status_code == 200
    html = r.text
    assert "<h1>Rembrandt</h1>" in html
    assert 'class="description"' in html and "Dutch painter" in html
    assert 'class="properties-table"' in html
    # type badge, prefixed predicate names and linked object labels
    assert '<span class="prefix">schema:</span><span class="local">Person</span>' in html
    assert "birth<wbr>Date" in html
    assert "^^xsd:date" in html
    assert ">Saskia van Uylenburgh</a>" in html  # label fetched for a referenced URI
    href = f"/entity?uri={quote('http://example.org/saskia', safe='')}&amp;profile={MAIN_KEY}"
    assert href in html


def test_language_tabs_and_preferred_language(client):
    html = entity(client).text
    assert 'class="lang-tab active" data-lang="en"' in html
    nl = entity(client, headers={"Accept-Language": "nl-NL,nl;q=0.9"}).text
    assert "<h1>Rembrandt van Rijn</h1>" in nl
    assert "Nederlandse schilder" in nl.split('class="description"')[1][:200]
    assert 'class="lang-tab active" data-lang="nl"' in nl


def test_blank_nodes_are_rendered(client):
    html = entity(client).text
    assert 'class="blank-nodes-section"' in html
    # blank node objects link to an anchor on the page, labelled with the blank node label
    assert 'class="blank-node-ref">[Leiden]</a>' in html
    # skolemised IRIs are treated as blank nodes
    assert 'class="blank-node-ref">[Latin School]</a>' in html
    # predicate chain from the main subject to the nested blank node (geometry)
    section = html.split('class="blank-nodes-section"')[1]
    assert "hasGeometry" in section
    assert "birth" in section and "::" in section
    assert "POINT" in section


def test_blank_node_anchors_resolve(client):
    import re

    html = entity(client).text
    refs = set(re.findall(r'href="#(bn-[0-9a-f]+)" class="blank-node-ref"', html))
    ids = set(re.findall(r'class="blank-node" id="(bn-[0-9a-f]+)"', html))
    assert refs and refs <= ids


def test_html_literals_are_sanitized(client):
    html = entity(client).text
    assert '<span class="html-literal"><p>Some <b>bold</b> text</p></span>' in html
    assert "alert(1)" not in html.split('class="html-literal"')[1][:200]


def test_images(client):
    html = entity(client).text
    assert '<img src="http://images.example.org/rembrandt.jpg"' in html


def test_inverse_relations(client):
    html = entity(client).text
    assert 'class="inverse-relations-heading"' in html
    assert ">The Night Watch</a>" in html
    # Titus links via a blank node: [ .. ] -> parent :: person -> Rembrandt
    box = html.split(">Titus van Rijn</a>")[0].rsplit('class="blank-node inverse-relation-box"', 1)[
        1
    ]
    assert "parent" in box and "person" in box


def test_inverse_relations_query_link_when_truncated(settings, registry, data_graph):
    from fastapi.testclient import TestClient

    from shmarql.main import create_app

    for i in range(5):
        data_graph.add(
            (
                URIRef(f"http://example.org/work{i}"),
                URIRef("http://schema.org/creator"),
                URIRef(REMBRANDT),
            )
        )
    registry.display["max_inverse_subjects"] = 3
    app = create_app(settings, registry, transport=FakeSparqlEndpoint(data_graph).transport)
    with TestClient(app) as c:
        html = entity(c).text
    assert "show all 6 in the query editor" in html
    assert "/query?query=SELECT" in html and f"profile={MAIN_KEY}" in html


def test_map_for_coordinates(client):
    html = entity(client, uri="http://example.org/leiden").text
    assert 'id="map"' in html
    assert '"latitude": 52.16' in html
    assert "/static/lodeon/vendor/leaflet/leaflet.js" in html


def test_content_negotiation(client):
    r = entity(client, params={"format": "turtle"})
    assert r.headers["content-type"].startswith("text/turtle")
    g = Graph().parse(data=r.text, format="turtle")
    assert (URIRef(REMBRANDT), RDFS.label, Literal("Rembrandt", lang="en")) in g
    r = entity(client, headers={"Accept": "application/ld+json"})
    assert r.headers["content-type"].startswith("application/ld+json")
    r = entity(client, headers={"Accept": "text/html,application/xhtml+xml,*/*"})
    assert r.headers["content-type"].startswith("text/html")


def test_not_found_and_invalid(client):
    assert entity(client, uri="http://example.org/unknown").status_code == 404
    assert entity(client, uri="http://example.org/a>b").status_code == 400


def test_profile_selection(client, endpoint):
    entity(client)
    assert endpoint.requests[0]["url"].startswith(MAIN_ENDPOINT)
    endpoint.requests.clear()
    entity(client, uri="http://other.example/thing")  # matched by uri_prefixes
    assert endpoint.requests[0]["url"].startswith(OTHER_ENDPOINT)
    endpoint.requests.clear()
    entity(client, params={"profile": "other"})  # explicit profile wins
    assert endpoint.requests[0]["url"].startswith(OTHER_ENDPOINT)


def test_construct_fallbacks(settings, registry, data_graph):
    """When the complex CONSTRUCT fails, simpler queries are tried (like ldview)."""
    from fastapi.testclient import TestClient

    from shmarql.main import create_app

    endpoint = FakeSparqlEndpoint(data_graph, fail_on=("UNION", "OPTIONAL {\n        ?o ?p2"))
    app = create_app(settings, registry, transport=endpoint.transport)
    with TestClient(app) as c:
        r = entity(c)
    assert r.status_code == 200
    constructs = [q["query"] for q in endpoint.requests if "CONSTRUCT" in q["query"]]
    assert len(constructs) >= 3
    assert constructs[2].startswith("CONSTRUCT { <http://example.org/rembrandt> ?p ?o")


def test_per_profile_display_overrides(settings, registry, endpoint):
    from fastapi.testclient import TestClient

    from shmarql.main import create_app
    from shmarql.profiles import ProfileRegistry

    data = [
        {
            "name": "main",
            "endpoint": MAIN_ENDPOINT,
            "display": {
                "show_inverse_relations": False,
                "namespaces": {"sch": "http://schema.org/"},
            },
        }
    ]
    app = create_app(settings, ProfileRegistry.from_data(data), transport=endpoint.transport)
    with TestClient(app) as c:
        html = entity(c).text
    assert "inverse-relations-heading" not in html
    assert '<span class="prefix">sch:</span>' in html


# -- unit tests ------------------------------------------------------------------------------
def test_process_subject_unit():
    s = DisplaySettings()
    g = Graph()
    subj, bn = URIRef("http://x/s"), BNode()
    g.add((subj, RDFS.label, Literal("S")))
    g.add((subj, URIRef("http://x/p"), bn))
    g.add((bn, RDFS.label, Literal("inner")))
    g.add((subj, URIRef("http://x/n"), Literal(3)))
    data = process_subject(subj, g, s, is_main_subject=True, id_uri="http://x/s")
    assert data["main_label"] == "S"
    rows = [r for grp in data["predicate_groups"] for r in grp["predicates"]]
    blank_row = next(r for r in rows if r["predicate"] == "http://x/p")
    assert blank_row["is_blank_object"] and blank_row["object_label"] == "inner"
    assert next(r for r in rows if r["predicate"] == "http://x/n")["is_numeric"]


def test_group_predicates_orders_configured_groups_first():
    rows = [{"predicate": "http://z"}, {"predicate": "http://a"}, {"predicate": "http://g1"}]
    groups = group_predicates(rows, [["http://g1"]])
    assert [r["predicate"] for r in groups[0]["predicates"]] == ["http://g1"]
    assert [r["predicate"] for r in groups[1]["predicates"]] == ["http://a", "http://z"]


def test_wkt_and_shorten():
    point = parse_wkt_geometry("POINT(4.49 52.16)")
    assert point["center"] == {"latitude": 52.16, "longitude": 4.49}
    poly = parse_wkt_geometry("POLYGON((0 0, 1 0, 1 1, 0 0))")
    assert poly["type"] == "polygon" and len(poly["coordinates"]) == 3
    assert parse_wkt_geometry("nonsense") is None
    ns = {"ex": "http://example.org/", "exd": "http://example.org/deep/"}
    assert shorten_uri("http://example.org/deep/x", ns) == {
        "prefix": "exd:",
        "local": "x",
        "uri": "http://example.org/deep/x",
    }
    assert shorten_uri("http://other/x", ns)["prefix"] == ""


def test_label_language_fallback(client):
    # Only "mul" and "ru" labels: "mul" wins over an arbitrary language.
    assert "<h1>Douglas Adams</h1>" in entity(client, uri="http://example.org/adams").text
    ru = entity(client, uri="http://example.org/adams", headers={"Accept-Language": "ru"})
    # "ru" is not a supported UI language, so the configured fallbacks still apply.
    assert "<h1>Douglas Adams</h1>" in ru.text


def test_pick_by_language_order():
    from shmarql.entity.labels import pick_by_language

    preds = ["http://p/pref", "http://p/label"]
    cands = [
        ("http://p/label", "de", "Hallo"),
        ("http://p/label", "mul", "Hi-mul"),
        ("http://p/pref", None, "Plain"),
        ("http://p/label", "nl", "Hoi"),
    ]
    assert pick_by_language(cands, preds, "nl", ["mul"]) == ("Hoi",)
    assert pick_by_language(cands, preds, "fr", ["mul"]) == ("Plain",)
    assert pick_by_language(cands[:2], preds, "fr", ["mul"]) == ("Hi-mul",)
    assert pick_by_language(cands[:1], preds, "fr", ["mul"]) == ("Hallo",)
    assert pick_by_language([], preds, "fr") is None


def test_label_lookups_are_batched(settings, registry, endpoint):
    from fastapi.testclient import TestClient

    from shmarql.main import create_app

    registry.display["label_batch_size"] = 2
    app = create_app(settings, registry, transport=endpoint.transport)
    with TestClient(app) as c:
        html = entity(c, uri="http://example.org/adams").text
    label_queries = [q for q in endpoint.requests if q["query"].startswith("SELECT ?s ?p ?l")]
    assert len(label_queries) == 2  # four referenced URIs, two per batch
    assert ">Saskia van Uylenburgh</a>" in html and ">Titus van Rijn</a>" in html
