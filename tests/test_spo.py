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
    assert "ORDER BY ?s ?p ?o" in sent["query"]


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
    assert build_spo_query() == "SELECT ?s ?p ?o\nWHERE {\n  ?s ?p ?o .\n}\nORDER BY ?s ?p ?o\n"


def test_build_spo_query_adds_one_filter_per_position():
    assert build_spo_query(s=REMBRANDT, p="http://schema.org/knows", o=SASKIA) == (
        "SELECT ?s ?p ?o\n"
        "WHERE {\n"
        "  ?s ?p ?o .\n"
        f"  FILTER(?s = <{REMBRANDT}>)\n"
        "  FILTER(?p = <http://schema.org/knows>)\n"
        f"  FILTER(?o = <{SASKIA}>)\n"
        "}\n"
        "ORDER BY ?s ?p ?o\n"
    )


def test_build_spo_query_treats_bare_words_as_plain_literals():
    assert 'FILTER(?o = "Dutch painter")' in build_spo_query(o="Dutch painter")
    assert "FILTER" not in build_spo_query(o="_:b1")
