"""The LODEON story editor: its configuration, auth, welcome story, preview and publish API."""

import base64
import io
import json
import re
import shutil
import zipfile

import httpx
import pytest
from fastapi.testclient import TestClient

from shmarql.lodeon.publishing import PreviewStore, StoryPayload, is_allowed_asset_path
from shmarql.main import create_app
from shmarql.profiles import ProfileRegistry
from shmarql.routes.lodeon_editor import create_session, valid_session

from conftest import FIXTURES, MAIN_ENDPOINT

TOKEN = "s3cret-token"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
STORY_MD = """---
title: Editor Story
lodeon:
  htmlMeta:
    description: Written in the editor.
---

# Editor Story

Some *text*.

![A picture](assets/pic.png)

```shmarql {title="People" kg="main"}
SELECT ?s WHERE { ?s ?p ?o } LIMIT 3
```
"""


@pytest.fixture
def docs(tmp_path):
    target = tmp_path / "docs"
    shutil.copytree(FIXTURES / "docs", target)
    return target


@pytest.fixture
def editor_settings(settings, docs, tmp_path):
    return settings.model_copy(
        update={
            "docs_path": docs,
            "lodeon_editor_token": TOKEN,
            "lodeon_preview_path": tmp_path / "previews",
        }
    )


@pytest.fixture
def editor(editor_settings, registry, endpoint):
    app = create_app(settings=editor_settings, registry=registry, transport=endpoint.transport)
    with TestClient(app) as c:
        yield c


def login(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"token": TOKEN})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['session']}"}


def story_json(slug: str = "editor-story", **extra) -> dict:
    return {
        "title": "Editor Story",
        "slug": slug,
        "markdown": STORY_MD,
        "assets": [
            {
                "path": "assets/pic.png",
                "mimeType": "image/png",
                "dataBase64": base64.b64encode(PNG).decode(),
            }
        ],
        **extra,
    }


# -- configuration ----------------------------------------------------------------------------
def test_config_lists_profiles_and_has_no_assistant(client):
    config = client.get("/api/config").json()
    assert "assistant" not in config
    assert config["application"]["baseURL"] == "/lodeon/"
    kg = config["knowledgeGraph"]
    assert kg["defaultProfile"] == "main"
    assert [(p["id"], p["sparqlUrl"], p["active"]) for p in kg["profiles"]] == [
        ("main", "/api/sparql/main", True),
        ("other", "/api/sparql/other", False),
    ]
    nodes = config["nodes"]
    assert "assistantContext" not in nodes["verovio"]
    # no profile has a Sparnatural configuration
    assert nodes["sparql"]["profiles"] == {}
    explorer = nodes["graphExplorer"]["profiles"]["main"]
    assert explorer["expandURL"] == "/api/explorer/main/expand"
    assert "http://www.w3.org/2000/01/rdf-schema#label" in explorer["labelProperties"]
    assert set(config["localization"]["resources"]["en"]) == {"editor", "special-nodes"}
    assert config["errors"]["publish.login_required"]["title"]
    engine = config["renderer"]["engines"]["shmarql"]
    assert engine["specialNodeMappings"]["sparnaturalNode"]["fence"] == "shmarql"
    assert "lodeon-story-metadata" in engine["templates"]["special-nodes/story-metadata.md.hbs"]
    assert config["renderer"]["publishURL"] == "/api/publish"


def test_profile_sparnatural_and_graph_explorer_settings(settings, endpoint, tmp_path):
    (tmp_path / "shapes.ttl").write_text("@prefix sh: <http://www.w3.org/ns/shacl#> .\n")
    profiles = tmp_path / "profiles.yaml"
    profiles.write_text(
        f"""
profiles:
  - name: main
    endpoint: {MAIN_ENDPOINT}
    sparnatural: shapes.ttl
    graph_explorer:
      maxNodes: 20
      colorSchemes:
        basic:
          edgeColors: {{default: "#000000"}}
"""
    )
    registry = ProfileRegistry.from_yaml(profiles)
    app = create_app(settings=settings, registry=registry, transport=endpoint.transport)
    with TestClient(app) as client:
        nodes = client.get("/api/config").json()["nodes"]
        assert nodes["sparql"]["profiles"] == {
            "main": {"configURL": "/api/knowledge-graphs/main/sparnatural"}
        }
        explorer = nodes["graphExplorer"]["profiles"]["main"]
        assert explorer["maxNodes"] == 20
        assert explorer["colorSchemes"]["basic"]["edgeColors"]["default"] == "#000000"
        assert explorer["colorSchemes"]["basic"]["nodeColors"]["iri"] == "#0072B2"
        r = client.get("/api/knowledge-graphs/main/sparnatural")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/turtle")
        assert client.get("/api/knowledge-graphs/nope/sparnatural").status_code == 404


def test_welcome_story_uses_default_profile(client):
    r = client.get("/api/welcome-story")
    assert r.headers["content-type"] == "application/zip"
    package = json.loads(zipfile.ZipFile(io.BytesIO(r.content)).read("project.lodeon.json"))
    assert package["format"] == "lodeon-project-package"
    project = package["project"]
    assert project["format"] == "lodeon-datastory"
    assert "assistant" not in project
    nodes = [n for n in project["document"]["content"] if n["type"] == "sparnaturalNode"]
    assert nodes[0]["attrs"]["knowledgeGraphProfileId"] == "main"
    assert "AI" not in json.dumps(project["document"])


# -- authentication -------------------------------------------------------------------------
def test_without_token_preview_is_open_and_publish_disabled(client):
    status = client.get("/api/auth/status").json()
    assert status == {
        "authEnabled": False,
        "authenticated": False,
        "methods": {"token": False, "externalProviders": []},
        "capabilities": {"publish": False},
    }
    assert client.post("/api/auth/login", json={"token": "x"}).status_code == 404
    assert client.post("/api/publish", json=story_json()).status_code == 403
    assert client.post("/api/preview", json=story_json()).status_code == 200


def test_token_login(editor):
    assert editor.get("/api/auth/status").json()["authEnabled"] is True
    assert editor.post("/api/auth/login", json={"token": "wrong"}).status_code == 401
    assert editor.post("/api/auth/login", json={}).status_code == 400
    headers = login(editor)
    status = editor.get("/api/auth/status", headers=headers).json()
    assert status["authenticated"] is True
    assert status["capabilities"]["publish"] is True
    bad = {"Authorization": "Bearer 99999999999.deadbeef"}
    assert editor.get("/api/auth/status", headers=bad).json()["authenticated"] is False


def test_sessions_expire_and_are_bound_to_the_token():
    session = create_session(TOKEN, ttl=60, now=1000)
    assert valid_session(TOKEN, session, now=1059)
    assert not valid_session(TOKEN, session, now=1061)
    assert not valid_session("other-token", session, now=1000)
    assert not valid_session(TOKEN, "garbage", now=1000)


def test_preview_and_publish_require_login_with_token(editor):
    assert editor.post("/api/preview", json=story_json()).status_code == 401
    r = editor.post("/api/publish", json=story_json())
    assert r.status_code == 401
    assert r.json()["code"] == "publish.login_required"


# -- publish ------------------------------------------------------------------------------------
def test_publish_writes_story_into_docs(editor, docs):
    headers = login(editor)
    r = editor.post("/api/publish", json=story_json(), headers=headers)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "slug": "editor-story",
        "title": "Editor Story",
        "path": "story/editor-story/index.md",
        "url": "/story/editor-story/",
    }
    assert (docs / "story/editor-story/index.md").read_text() == STORY_MD
    assert (docs / "story/editor-story/assets/pic.png").read_bytes() == PNG

    page = editor.get("/story/editor-story/")
    assert page.status_code == 200
    assert '<pre class="shmarql-source" title="People" kg="main">' in page.text
    assert '<meta name="description" content="Written in the editor.">' in page.text
    assert editor.get("/story/editor-story/assets/pic.png").content == PNG
    # the published story appears in the docs navigation
    assert 'href="/story/editor-story/"' in editor.get("/").text


def test_republish_replaces_the_story(editor, docs):
    headers = login(editor)
    editor.post("/api/publish", json=story_json(), headers=headers)
    second = story_json(markdown="# Second version\n")
    second["assets"] = []
    assert editor.post("/api/publish", json=second, headers=headers).status_code == 200
    story = docs / "story/editor-story"
    assert (story / "index.md").read_text() == "# Second version\n"
    assert not (story / "assets").exists()
    assert [p.name for p in (docs / "story").iterdir() if p.name.startswith(".")] == []


def test_publish_multipart_with_project_package(editor, docs):
    headers = login(editor)
    payload = story_json()
    payload["assets"] = [
        {"path": "assets/pic.png", "mimeType": "image/png", "fileField": "asset-0"},
        {"path": "editor-story.lodeon.zip", "mimeType": "application/zip", "fileField": "asset-1"},
    ]
    payload["publishStoryZip"] = True
    r = editor.post(
        "/api/publish",
        data={"payload": json.dumps(payload)},
        files={
            "asset-0": ("blob", PNG, "image/png"),
            "asset-1": ("blob", b"PK-zip", "application/zip"),
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["packageUrl"] == "/story/editor-story/editor-story.lodeon.zip"
    assert (docs / "story/editor-story/assets/pic.png").read_bytes() == PNG
    assert (docs / "story/editor-story/editor-story.lodeon.zip").read_bytes() == b"PK-zip"


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"slug": "../escape"}, "publish.invalid_request"),
        ({"slug": ""}, "publish.invalid_request"),
        ({"markdown": "  "}, "renderer.markdown_empty"),
        (
            {"assets": [{"path": "assets/../../x.md", "dataBase64": "eA=="}]},
            "renderer.asset_path_invalid",
        ),
        ({"assets": [{"path": "index.md", "dataBase64": "eA=="}]}, "renderer.asset_path_invalid"),
        ({"assets": [{"path": "assets/x", "dataBase64": "%%%"}]}, "renderer.asset_payload_invalid"),
    ],
)
def test_publish_rejects_invalid_requests(editor, docs, change, code):
    headers = login(editor)
    r = editor.post("/api/publish", json=story_json(**change), headers=headers)
    assert r.status_code == 400
    assert r.json()["code"] == code
    assert not (docs / "story/escape").exists()
    assert not (docs.parent / "escape").exists()


def test_asset_path_policy():
    assert is_allowed_asset_path("assets/img/a.png")
    assert is_allowed_asset_path("story.lodeon.zip")
    for bad in (
        "",
        "/etc/passwd",
        "assets",
        "assets/../x",
        "a\\b",
        "x.png",
        "assets/.hidden",
        "d/x.lodeon.zip",
    ):
        assert not is_allowed_asset_path(bad), bad


def test_publish_rejects_oversized_uploads(editor, editor_settings):
    editor.app.state.shmarql.settings = editor_settings.model_copy(
        update={"lodeon_max_upload_mb": 0}
    )
    r = editor.post("/api/publish", json=story_json(), headers=login(editor))
    assert r.status_code == 413
    assert r.json()["code"] == "publish.payload_too_large"


# -- preview ----------------------------------------------------------------------------------
def test_preview_lifecycle(editor, tmp_path):
    headers = login(editor)
    r = editor.post("/api/preview", json=story_json(), headers=headers)
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["url"] == f"/api/artefacts/{preview['id']}/"

    page = editor.get(preview["url"])
    assert page.status_code == 200
    assert page.headers["x-robots-tag"] == "noindex"
    assert "<h1" in page.text and "Editor Story" in page.text
    assert '<pre class="shmarql-source" title="People" kg="main">' in page.text
    assert "/static/lodeon/scripts/runtime.js" in page.text
    assert editor.get(preview["url"] + "assets/pic.png").content == PNG
    assert editor.get(preview["url"] + "../../etc/passwd").status_code == 404

    cleanup = f"/api/artefacts/{preview['id']}"
    assert editor.delete(cleanup).status_code == 401
    assert editor.delete(cleanup, headers=headers).json() == {"id": preview["id"], "deleted": True}
    assert editor.get(preview["url"]).status_code == 404
    assert editor.delete("/api/artefacts/not-an-id", headers=headers).status_code == 400


def test_expired_previews_are_removed(tmp_path):
    store = PreviewStore(tmp_path, ttl=10)
    preview_id = store.create(StoryPayload(title="t", markdown="# t"))
    assert store.directory(preview_id) is not None
    assert store.cleanup(now=10**12) == 1
    assert store.directory(preview_id) is None


# -- embed metadata -----------------------------------------------------------------------------
def test_embed_metadata_only_fetches_allowed_origins(settings, registry, tmp_path):
    override = tmp_path / "lodeon.yml"
    override.write_text("nodes:\n  embed:\n    allowedOrigins: ['https://video.example']\n")
    fetched: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        fetched.append(str(request.url))
        if request.url.path == "/moved":
            return httpx.Response(302, headers={"location": "https://evil.example/"})
        return httpx.Response(
            200,
            text='<html><head><title>Fallback</title><meta property="og:title" '
            'content="A &amp; B"><meta name="description" content=" Nice  video "></head></html>',
            headers={"content-type": "text/html; charset=utf-8"},
        )

    app = create_app(
        settings=settings.model_copy(update={"lodeon_config_path": override}),
        registry=registry,
        transport=httpx.MockTransport(handler),
    )
    with TestClient(app) as client:
        r = client.post(
            "/api/embed/metadata",
            json={
                "urls": [
                    "https://video.example/v/1",
                    "https://other.example/x",
                    "https://video.example/moved",
                    "ftp://x",
                ]
            },
        )
    items = r.json()["items"]
    assert items[0] == {
        "url": "https://video.example/v/1",
        "status": "allowed",
        "origin": "https://video.example",
        "title": "A & B",
        "description": "Nice video",
    }
    assert items[1]["status"] == "blocked"
    assert items[2]["status"] == "unavailable"  # redirect off the allow-list
    assert items[3]["status"] == "invalid"
    assert fetched == ["https://video.example/v/1", "https://video.example/moved"]


# -- the editor application ---------------------------------------------------------------------
def test_editor_app_is_served_at_lodeon(client):
    r = client.get("/lodeon", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"] == "/lodeon/"
    r = client.get("/lodeon/")
    assert r.status_code == 200
    html = r.text
    # the editor runs in the main pane of the site template, with its header and footer
    assert '<header class="site-header">' in html
    assert '<footer class="site-footer">' in html
    assert '<main class="container container--editor">' in html
    assert '<div id="app" class="lodeon-editor-app"></div>' in html
    assert "<title>Story editor – Test Site</title>" in html
    # the editor's build, with its stylesheet before the site's
    scripts = re.findall(
        r'<script type="module" crossorigin src="(/lodeon/assets/[^"]+\.js)"', html
    )
    styles = re.findall(
        r'<link rel="stylesheet" crossorigin href="(/lodeon/assets/[^"]+\.css)"', html
    )
    assert scripts and styles
    assert html.index(styles[0]) < html.index("/static/css/shmarql.css")
    assert client.get(scripts[0]).status_code == 200
    # missing editor files are 404s, never the application document
    assert client.get("/lodeon/missing.js").status_code == 404


def test_site_navigation_links_to_the_editor(client, settings, registry, endpoint):
    assert '<a href="/lodeon/" class="nav-item">Story editor</a>' in client.get("/query").text
    app = create_app(
        settings=settings.model_copy(update={"lodeon_editor_enabled": False}),
        registry=registry,
        transport=endpoint.transport,
    )
    with TestClient(app) as other:
        assert 'href="/lodeon/"' not in other.get("/query").text


def test_editor_page_without_a_build(client, tmp_path):
    from shmarql.routes.lodeon_editor import editor_assets

    assert editor_assets(tmp_path) == {"scripts": [], "styles": [], "preloads": []}


def test_editor_can_be_disabled(settings, registry, endpoint):
    app = create_app(
        settings=settings.model_copy(update={"lodeon_editor_enabled": False}),
        registry=registry,
        transport=endpoint.transport,
    )
    with TestClient(app) as client:
        assert client.get("/api/config").status_code == 404
        assert client.post("/api/preview", json=story_json()).status_code in (404, 405)
        assert client.get("/lodeon/").status_code == 404
