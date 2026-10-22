import json
import re

from shmarql.profiles import profile_key

from conftest import MAIN_ENDPOINT, OTHER_ENDPOINT


def _profiles_json(html: str) -> list[dict]:
    match = re.search(
        r'<script id="profiles-data" type="application/json">(.*?)</script>', html, re.S
    )
    assert match
    return json.loads(match.group(1))


def test_query_page_has_codemirror_and_profile_autocomplete(client):
    r = client.get("/query")
    assert r.status_code == 200
    assert "/static/codemirror/codemirror.js" in r.text
    assert "/static/codemirror/sparql.js" in r.text
    assert '<textarea id="query-editor"' in r.text
    assert 'id="profile-input"' in r.text and 'role="combobox"' in r.text
    # the default profile is pre-selected
    assert f'id="profile-key" name="profile" value="{profile_key(MAIN_ENDPOINT)}"' in r.text
    profiles = _profiles_json(r.text)
    assert {p["name"] for p in profiles} == {"main", "other"}
    assert all("endpoint" not in p for p in profiles)


def test_query_page_preselects_profile_and_query(client):
    r = client.get("/query", params={"profile": "other", "query": "ASK { ?s ?p ?o }"})
    assert f'value="{profile_key(OTHER_ENDPOINT)}"' in r.text
    assert 'value="Other store"' in r.text
    assert "ASK { ?s ?p ?o }" in r.text


def test_query_page_escapes_query(client):
    r = client.get("/query", params={"query": "</textarea><script>alert(1)</script>"})
    assert "<script>alert(1)</script>" not in r.text


def test_static_assets_are_served(client):
    for path in (
        "/static/js/query.js",
        "/static/codemirror/codemirror.js",
        "/static/css/shmarql.css",
        "/static/css/entity.css",
        "/static/lodeon/scripts/runtime.js",
    ):
        assert client.get(path).status_code == 200, path
