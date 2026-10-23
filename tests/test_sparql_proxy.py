import httpx
from fastapi.testclient import TestClient

from shmarql.main import create_app
from shmarql.profiles import profile_key

from conftest import MAIN_ENDPOINT, OTHER_ENDPOINT

SELECT = "SELECT ?s WHERE { ?s a <http://schema.org/Person> } ORDER BY ?s"
JSON = "application/sparql-results+json"


def test_default_endpoint_get(client, endpoint):
    r = client.get("/sparql", params={"query": SELECT}, headers={"Accept": JSON})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(JSON)
    values = [b["s"]["value"] for b in r.json()["results"]["bindings"]]
    assert "http://example.org/rembrandt" in values
    sent = endpoint.requests[-1]
    assert sent["url"].startswith(MAIN_ENDPOINT)
    assert sent["method"] == "GET"
    # profile headers are added, the client's Accept is passed through
    assert sent["headers"]["x-api-key"] == "secret"
    assert sent["headers"]["accept"] == JSON


def test_default_endpoint_post_form_and_direct(client, endpoint):
    r = client.post("/sparql", data={"query": SELECT}, headers={"Accept": JSON})
    assert r.status_code == 200 and r.json()["results"]["bindings"]
    r = client.post(
        "/sparql",
        content=SELECT,
        headers={"Content-Type": "application/sparql-query", "Accept": JSON},
    )
    assert r.status_code == 200 and r.json()["results"]["bindings"]
    assert endpoint.requests[-1]["method"] == "POST"


def test_profile_endpoint_by_key(client, endpoint):
    key = profile_key(OTHER_ENDPOINT)
    r = client.get(f"/sparql/{key}", params={"query": "ASK { ?s ?p ?o }"}, headers={"Accept": JSON})
    assert r.status_code == 200
    assert r.json()["boolean"] is True
    assert endpoint.requests[-1]["url"].startswith(OTHER_ENDPOINT)


def test_construct_passthrough(client):
    r = client.get(
        "/sparql",
        params={"query": "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 3"},
        headers={"Accept": "text/turtle"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/turtle")


def test_unknown_profile(client):
    assert client.get("/sparql/doesnotexist", params={"query": SELECT}).status_code == 404


def test_missing_query(client):
    assert client.get("/sparql", headers={"Accept": JSON}).status_code == 400
    assert client.post("/sparql", data={}).status_code == 400


def test_browser_get_without_query_redirects_to_editor(client):
    r = client.get("/sparql", headers={"Accept": "text/html"}, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == f"/query?profile={profile_key(MAIN_ENDPOINT)}"


def test_updates_only_when_allowed(client, endpoint, data_graph):
    update = "INSERT DATA { <http://example.org/x> <http://example.org/p> 1 }"
    r = client.post("/sparql", data={"update": update})
    assert r.status_code == 403
    r = client.post(
        "/sparql", content=update, headers={"Content-Type": "application/sparql-update"}
    )
    assert r.status_code == 403
    assert client.get("/sparql", params={"update": update}).status_code == 405
    before = len(data_graph)
    r = client.post(f"/sparql/{profile_key(OTHER_ENDPOINT)}", data={"update": update})
    assert r.status_code == 204
    assert len(data_graph) == before + 1


def test_upstream_errors_are_passed_through(client):
    r = client.get("/sparql", params={"query": "SELECT nonsense"})
    assert r.status_code == 400
    assert "bad query" in r.text


def test_unreachable_upstream(settings, registry):
    def boom(request):
        raise httpx.ConnectError("connection refused")

    app = create_app(settings, registry, transport=httpx.MockTransport(boom))
    with TestClient(app) as c:
        r = c.get("/sparql", params={"query": SELECT})
    assert r.status_code == 502


def test_profiles_api(client):
    profiles = client.get("/api/profiles").json()
    assert [p["name"] for p in profiles] == ["main", "other"]
    assert profiles[0]["default"] is True
    assert all("endpoint" not in p for p in profiles)


def test_cors(settings, registry, endpoint):
    settings.cors_origins = ["https://app.example"]
    app = create_app(settings, registry, transport=endpoint.transport)
    with TestClient(app) as c:
        r = c.get("/sparql", params={"query": SELECT}, headers={"Origin": "https://app.example"})
    assert r.headers["access-control-allow-origin"] == "https://app.example"


def test_endpoint_setting_overrides_default_profile(settings, registry, endpoint):
    settings.endpoint = MAIN_ENDPOINT
    app = create_app(settings, registry, transport=endpoint.transport)
    with TestClient(app) as c:
        r = c.get("/sparql", params={"query": SELECT}, headers={"Accept": JSON})
        assert r.status_code == 200
        assert r.headers["content-type"].startswith(JSON)
        assert endpoint.requests[-1]["url"].startswith(MAIN_ENDPOINT)
        profiles = c.get("/api/profiles").json()
        assert [p["name"] for p in profiles] == ["main", "other"]
        assert profiles[0]["default"] is True
        assert profiles[1]["default"] is False


def test_query_page_uses_endpoint_setting_as_default(settings, registry, endpoint):
    settings.endpoint = OTHER_ENDPOINT
    app = create_app(settings, registry, transport=endpoint.transport)
    with TestClient(app) as c:
        r = c.get("/query")
        assert r.status_code == 200
        # The endpoint override becomes the default pre-selected in the query page.
        assert f'value="{profile_key(OTHER_ENDPOINT)}"' in r.text
        assert 'value="Other store"' in r.text
