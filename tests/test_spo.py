from rdflib import Graph, Literal, URIRef
from rdflib.namespace import RDFS

from shmarql.profiles import profile_key
from shmarql.routes.pages import build_spo_query

from conftest import MAIN_ENDPOINT, OTHER_ENDPOINT

REMBRANDT = "http://example.org/rembrandt"
SASKIA = "http://example.org/saskia"
NAME = "http://schema.org/name"


def spo(client, **params):
    return client.get("/spo", params=params)


def spo_query(endpoint):
    return endpoint.requests[-1]["query"]


def test_spo_page_renders_the_knowledge_graph_table(client, endpoint):
    r = spo(client)
    assert r.status_code == 200
    assert '<table class="sparql-results">' in r.text
    assert "<th>s</th>" in r.text and "<th>p</th>" in r.text and "<th>o</th>" in r.text
    assert "No matching triples." not in r.text

    sent = endpoint.requests[-1]
    assert sent["method"] == "POST"
    assert sent["url"].startswith(MAIN_ENDPOINT)
    assert sent["query"].startswith("SELECT ?s ?p ?o")
    assert "?s ?p ?o ." in sent["query"]
    # the object label is fetched through an optional join
    assert "OPTIONAL" in sent["query"]
    assert "?label" in sent["query"]


def test_spo_subject_filter(client, endpoint):
    r = spo(client, s=REMBRANDT)
    assert r.status_code == 200
    assert f"FILTER(?s = <{REMBRANDT}>)" in spo_query(endpoint)
    assert "FILTER(?p" not in spo_query(endpoint) and "FILTER(?o" not in spo_query(endpoint)
    assert 'href="/entity?uri=http%3A%2F%2Fexample.org%2Frembrandt' in r.text


def test_spo_predicate_filter(client, endpoint):
    r = spo(client, p="http://schema.org/knows")
    assert r.status_code == 200
    assert "FILTER(?p = <http://schema.org/knows>)" in spo_query(endpoint)
    # predicate prefixes are converted to their short form
    assert '<span class="prefix">schema:</span>knows' in r.text


def test_spo_object_filter(client, endpoint):
    r = spo(client, o=SASKIA)
    assert r.status_code == 200
    assert f"FILTER(?o = <{SASKIA}>)" in spo_query(endpoint)


def test_spo_combined_filters(client, endpoint):
    r = spo(client, s=REMBRANDT, p=NAME, o=SASKIA)
    assert r.status_code == 200
    query = spo_query(endpoint)
    assert f"FILTER(?s = <{REMBRANDT}>)" in query
    assert f"FILTER(?p = <{NAME}>)" in query
    assert f"FILTER(?o = <{SASKIA}>)" in query


def test_spo_page_renders_the_profile_picker(client):
    r = spo(client)
    assert r.status_code == 200
    # the profile picker is there, like on the query page
    assert 'id="profile-input"' in r.text and 'role="combobox"' in r.text
    assert 'id="profile-options"' in r.text and 'id="profile-endpoint"' in r.text
    assert 'name="profile"' in r.text and 'id="profile-key"' in r.text
    # the default profile is pre-selected
    assert f'name="profile" id="profile-key" value="{profile_key(MAIN_ENDPOINT)}"' in r.text


def test_spo_page_hides_the_profile_picker_with_a_single_profile(settings, endpoint):
    # with a single profile there is nothing to select: the picker is not shown
    from fastapi.testclient import TestClient

    from shmarql.main import create_app
    from shmarql.profiles import ProfileRegistry

    single = ProfileRegistry.from_data(
        {
            "default": "main",
            "profiles": [
                {
                    "name": "main",
                    "title": "Main store",
                    "description": "The test triplestore",
                    "endpoint": MAIN_ENDPOINT,
                    "headers": {"X-Api-Key": "secret"},
                    "uri_prefixes": ["http://example.org/"],
                }
            ],
        }
    )
    app = create_app(settings, single, transport=endpoint.transport)
    with TestClient(app) as c:
        r = c.get("/spo")
        assert r.status_code == 200
        assert 'for="profile-input"' not in r.text
        assert 'id="profile-endpoint"' not in r.text


def test_spo_page_renders_the_download_formats(client):
    # like the entity viewer: a "Download as" row with a link per RDF format
    r = spo(client)
    assert r.status_code == 200
    assert "Download as:" in r.text
    assert 'href="/spo?format=turtle"' in r.text
    assert 'href="/spo?format=json-ld"' in r.text
    assert 'href="/spo?format=xml"' in r.text
    # the data comes from the selected SPARQL profile, like on the entity viewer
    assert "data from SPARQL profile:" in r.text
    assert f'href="/query?profile={profile_key(MAIN_ENDPOINT)}"' in r.text


def test_spo_download_links_keep_the_browsed_filters(client):
    # the download links carry the current s/p/o filters along
    r = spo(client, s=REMBRANDT)
    assert r.status_code == 200
    assert 'href="/spo?s=http%3A%2F%2Fexample.org%2Frembrandt&amp;format=turtle"' in r.text


def test_spo_download_as_rdf_serializes_the_browsed_triples(client):
    r = spo(client, s=REMBRANDT, format="turtle")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/turtle")
    assert "@prefix schema:" in r.text
    g = Graph().parse(data=r.text, format="turtle")
    assert (URIRef(REMBRANDT), URIRef(RDFS.label), Literal("Rembrandt", lang="en")) in g


def test_spo_download_as_json_ld(client):
    r = spo(client, format="json-ld")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/ld+json")
    g = Graph().parse(data=r.text, format="json-ld")
    assert (URIRef(REMBRANDT), URIRef(RDFS.label), Literal("Rembrandt", lang="en")) in g


def test_spo_download_as_unknown_format_renders_the_page(client):
    # an unsupported format falls back to the HTML browse page
    r = spo(client, format="doesnotexist")
    assert r.status_code == 200
    assert '<table class="sparql-results">' in r.text


def test_spo_page_preselects_profile_from_query_params(client):
    r = spo(client, profile="other")
    assert r.status_code == 200
    assert f'name="profile" id="profile-key" value="{profile_key(OTHER_ENDPOINT)}"' in r.text


def test_spo_static_assets_are_served(client):
    for path in (
        "/static/js/profile-picker.js",
        "/static/js/spo.js",
        "/static/js/query.js",
    ):
        assert client.get(path).status_code == 200, path


def test_spo_object_label_is_rendered_in_the_object_cell(client, endpoint):
    # the label of the ?o item is rendered inside the object cell, after the object itself
    r = spo(client, s=REMBRANDT, o=SASKIA)
    assert r.status_code == 200
    assert "Saskia van Uylenburgh" in r.text
    row = r.text.split("</tr>")[1]
    assert row.index(SASKIA) < row.index("Saskia van Uylenburgh")


def test_spo_unknown_profile_falls_back_to_default(client, endpoint):
    # like the entity viewer, an unknown profile name falls back to the default profile
    assert spo(client, profile="doesnotexist").status_code == 200
    assert spo_query(endpoint).startswith("SELECT ?s ?p ?o")


def test_spo_cell_values_are_linked_and_offer_spo_positions(client, endpoint):
    r = spo(client, s=REMBRANDT)
    html = r.text
    # IRIs are clickable to the entity view
    assert 'href="/entity?uri=http%3A%2F%2Fexample.org%2Frembrandt' in html
    # every cell offers SPO links to choose the value for the s, p or o position
    assert 'class="spo-link spo-s"' in html
    assert 'class="spo-link spo-p"' in html
    assert 'class="spo-link spo-o"' in html
    assert 'href="/spo?s=http%3A%2F%2Fexample.org%2Frembrandt&amp;profile=' in html
    assert 'href="/spo?p=http%3A%2F%2Fschema.org%2Fknows&amp;profile=' in html
    assert 'href="/spo?o=http%3A%2F%2Fexample.org%2Frembrandt&amp;profile=' in html


def test_spo_blank_node_cells_render_without_iri_link(client, endpoint):
    # Blank node objects render as plain values; their cells still offer the SPO positions
    r = spo(client, s=REMBRANDT)
    assert 'class="bnode"' in r.text


def test_spo_profile_param_selects_backend(client, endpoint):
    r = spo(client, s=REMBRANDT, profile="other")
    assert r.status_code == 200
    assert endpoint.requests[-1]["url"].startswith(OTHER_ENDPOINT)


def test_build_spo_query_without_filters():
    assert build_spo_query() == (
        "SELECT ?s ?p ?o ?label\n"
        "WHERE {\n"
        "  ?s ?p ?o .\n"
        "  OPTIONAL { ?o <http://www.w3.org/2004/02/skos/core#prefLabel> ?label }\n"
        "  OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#label> ?label }\n"
        "  OPTIONAL { ?o <http://purl.org/dc/terms/title> ?label }\n"
        "  OPTIONAL { ?o <http://purl.org/dc/elements/1.1/title> ?label }\n"
        "  OPTIONAL { ?o <http://schema.org/name> ?label }\n"
        "  OPTIONAL { ?o <https://schema.org/name> ?label }\n"
        "  OPTIONAL { ?o <http://xmlns.com/foaf/0.1/name> ?label }\n"
        "  OPTIONAL { ?o <http://www.w3.org/2004/02/skos/core#altLabel> ?label }\n"
        "}\n"
        "LIMIT 999\n"
    )


def test_build_spo_query_adds_one_filter_per_position():
    assert build_spo_query(s=REMBRANDT, p="http://schema.org/knows", o=SASKIA) == (
        "SELECT ?s ?p ?o ?label\n"
        "WHERE {\n"
        "  ?s ?p ?o .\n"
        f"  FILTER(?s = <{REMBRANDT}>)\n"
        "  FILTER(?p = <http://schema.org/knows>)\n"
        f"  FILTER(?o = <{SASKIA}>)\n"
        "  OPTIONAL { ?o <http://www.w3.org/2004/02/skos/core#prefLabel> ?label }\n"
        "  OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#label> ?label }\n"
        "  OPTIONAL { ?o <http://purl.org/dc/terms/title> ?label }\n"
        "  OPTIONAL { ?o <http://purl.org/dc/elements/1.1/title> ?label }\n"
        "  OPTIONAL { ?o <http://schema.org/name> ?label }\n"
        "  OPTIONAL { ?o <https://schema.org/name> ?label }\n"
        "  OPTIONAL { ?o <http://xmlns.com/foaf/0.1/name> ?label }\n"
        "  OPTIONAL { ?o <http://www.w3.org/2004/02/skos/core#altLabel> ?label }\n"
        "}\n"
        "LIMIT 999\n"
    )


def test_build_spo_query_adds_the_object_label_optional():
    query = build_spo_query(
        o=SASKIA, label_predicates=["http://www.w3.org/2000/01/rdf-schema#label"]
    )
    assert f"FILTER(?o = <{SASKIA}>)" in query
    assert "OPTIONAL { ?o <http://www.w3.org/2000/01/rdf-schema#label> ?label }" in query
    # no optional is added when no label predicates are configured
    assert build_spo_query(label_predicates=[]) == (
        "SELECT ?s ?p ?o ?label\nWHERE {\n  ?s ?p ?o .\n}\nLIMIT 999\n"
    )


def test_build_spo_query_treats_bare_words_as_plain_literals():
    assert 'FILTER(?o = "Dutch painter")' in build_spo_query(o="Dutch painter")
    assert "FILTER" not in build_spo_query(o="_:b1")
