"""Rendering of LODEON data stories and the API used by the LODEON browser runtime."""

import json
import re

from fastapi.testclient import TestClient

from shmarql.lodeon import StoryRenderer, extract_front_matter, is_datastory
from shmarql.main import create_app
from shmarql.markdown_render import MarkdownRenderer

STORY = "/story/demo/"


def test_story_page_renders_fences_for_the_runtime(client):
    r = client.get(STORY)
    assert r.status_code == 200
    html = r.text
    # ```shmarql {title=".." kg=".."} -> <pre class="shmarql-source" title kg>, as in LODEON
    assert '<pre class="shmarql-source" title="People" kg="main"><code>SELECT ?s WHERE' in html
    assert '<pre class="lodeon-visualization-source" title="Distribution">' in html
    # media assets next to the story resolve relative to the story URL
    assert '<img alt="Painting" src="assets/pic.png"' in html


def test_story_page_loads_lodeon_runtime_and_metadata(client):
    html = client.get(STORY).text
    for asset in (
        "/static/lodeon/scripts/runtime.js",
        "/static/lodeon/styles/runtime.css",
        "/static/lodeon/vendor/jquery/jquery-3.7.1.min.js",
        "/static/lodeon/vendor/plotly-3.7.0.min.js",
        "/static/lodeon/verovio/lodeon-verovio.js",
    ):
        assert asset in html
    head = html.split("</head>")[0]
    assert '<meta name="description" content="A small data story.">' in head
    assert '<meta property="og:title" content="Demo Story">' in head
    ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', head).group(1)
    assert json.loads(ld)["@type"] == "ScholarlyArticle"
    assert "<title>Demo Story – Test Site</title>" in html


def test_embed_fence_respects_allowed_origins(client, settings, registry, endpoint, tmp_path):
    # Default LODEON configuration allows no embed origins.
    assert 'data-error-code="embed.origin_blocked"' in client.get(STORY).text

    config = tmp_path / "lodeon.yml"
    config.write_text("nodes:\n  embed:\n    allowedOrigins: ['https://player.example.org']\n")
    settings.lodeon_config_path = config
    app = create_app(settings, registry, transport=endpoint.transport)
    with TestClient(app) as c:
        html = c.get(STORY).text
    assert '<iframe class="lodeon-embed-iframe" src="https://player.example.org/viewer/one"' in html
    assert '<figcaption class="lodeon-embed-caption">An embed</figcaption>' in html


def test_server_side_node_projections():
    renderer = MarkdownRenderer()
    md = (
        "# Map\n\n"
        '```lodeon-graph-explorer {title="Neighbourhood"}\n'
        '{"renderer":"graphExplorer","knowledgeGraphProfileId":"main",'
        '"items":[{"iri":"http://example.org/rembrandt","label":"Rembrandt"}]}\n'
        "```\n"
    )
    page = renderer.render(md)
    assert page.is_datastory
    assert '<figure class="lodeon-graph-explorer">' in page.html
    spec = re.search(r'class="lodeon-graph-explorer-spec">(.*?)</script>', page.html).group(1)
    assert json.loads(spec)["profileId"] == "main"

    leaflet = renderer.render('```lodeon-leaflet {title="Places"}\nnot json\n```\n')
    assert "lodeon-leaflet" in leaflet.html and "data-error-code" in leaflet.html


def test_published_html_passes_through():
    """Stories already published by LODEON contain projected HTML; it must survive."""
    md = '<figure class="lodeon-embed">\n<iframe src="https://x.example/"></iframe>\n</figure>\n'
    page = MarkdownRenderer().render(md)
    assert page.is_datastory
    assert '<iframe src="https://x.example/"></iframe>' in page.html


def test_front_matter_helpers():
    meta, body = extract_front_matter("---\ntitle: X\nlodeon: {}\n---\n# Hi\n")
    assert meta == {"title": "X", "lodeon": {}} and body == "# Hi\n"
    assert extract_front_matter("---\n- a list\n---\nbody")[0] == {}
    assert extract_front_matter("no front matter") == ({}, "no front matter")
    assert is_datastory({"lodeon": {}}, "")
    assert is_datastory({}, "```shmarql\nSELECT * {}\n```")
    assert not is_datastory({}, "# plain\n```sparql\nSELECT * {}\n```")


def test_story_renderer_text_and_errors():
    renderer = StoryRenderer()
    assert renderer.text("embed.defaultTitle") == "Embedded content"
    assert renderer.text("graphExplorer.summary", {"nodes": 2}) == "2 nodes ·  edges"
    assert "embed.origin_blocked" in renderer.error_registry["errors"]


# -- runtime API ------------------------------------------------------------------------------
def test_api_sparql_by_profile_name(client):
    r = client.post(
        "/api/sparql/main",
        content="SELECT ?s WHERE { ?s a <http://schema.org/Person> }",
        headers={
            "Content-Type": "application/sparql-query",
            "Accept": "application/sparql-results+json",
        },
    )
    assert r.status_code == 200
    assert r.json()["results"]["bindings"]


def test_api_sparql_unknown_profile_and_updates(client):
    r = client.post("/api/sparql/nope", content="SELECT * {}")
    assert r.status_code == 404 and r.json()["ok"] is False
    # read-only even for profiles that allow updates
    r = client.post(
        "/api/sparql/other",
        content="INSERT DATA { <a:a> <a:b> <a:c> }",
        headers={"Content-Type": "application/sparql-update"},
    )
    assert r.status_code == 403


def test_fragments_endpoint_returns_html_table(client):
    r = client.post(
        "/shmarql/fragments/sparql",
        data={
            "query": "SELECT ?s ?l WHERE { ?s a <http://schema.org/Person> ; <http://www.w3.org/2000/01/rdf-schema#label> ?l }"
        },
    )
    assert r.status_code == 200
    assert '<table class="sparql-results">' in r.text
    assert "<th>s</th>" in r.text and "Saskia van Uylenburgh" in r.text
    assert "/entity?uri=http%3A%2F%2Fexample.org%2Fsaskia" in r.text
    bad = client.post("/shmarql/fragments/sparql", data={"query": "SELECT nonsense"})
    assert 'class="sparql-error"' in bad.text


def test_shmarql_execute_link_redirects_to_query_page(client):
    r = client.get("/shmarql/", params={"query": "SELECT 1 {}"}, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"].startswith("/query?query=SELECT")


def test_graph_explorer_expand(client):
    r = client.post(
        "/api/explorer/main/expand",
        json={"iris": ["http://example.org/rembrandt"], "direction": "both", "depth": 1},
    )
    assert r.status_code == 200
    body = r.json()
    ids = {n["id"] for n in body["nodes"]}
    assert "http://example.org/saskia" in ids and "http://example.org/nightwatch" in ids
    start = next(n for n in body["nodes"] if n["id"] == "http://example.org/rembrandt")
    assert start["start"] is True
    saskia = next(n for n in body["nodes"] if n["id"] == "http://example.org/saskia")
    assert saskia["label"] == "Saskia van Uylenburgh"
    edge = next(e for e in body["edges"] if e["target"] == "http://example.org/saskia")
    assert edge["source"] == "http://example.org/rembrandt" and edge["label"] == "knows"
    incoming = next(e for e in body["edges"] if e["source"] == "http://example.org/nightwatch")
    assert incoming["target"] == "http://example.org/rembrandt"
    assert all(n["kind"] != "literal" for n in body["nodes"])


def test_graph_explorer_validation(client):
    assert client.post("/api/explorer/main/expand", json={"iris": []}).status_code == 400
    assert client.post("/api/explorer/nope/expand", json={"iris": ["http://x/"]}).status_code == 404
