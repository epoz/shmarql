from fastapi.testclient import TestClient

from shmarql.docs_site import DocsSite
from shmarql.main import create_app
from shmarql.markdown_render import MarkdownRenderer, rewrite_md_link

from conftest import FIXTURES


def test_root_renders_index(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "<title>Test Home – Test Site</title>" in r.text
    assert '<h1 id="welcome">Welcome' in r.text
    # relative .md links are rewritten to clean URLs
    assert 'href="guide/"' in r.text
    assert 'href="guide/setup"' in r.text


def test_navigation_sidebar(client):
    r = client.get("/guide/setup")
    assert r.status_code == 200
    assert 'class="docs-nav"' in r.text
    assert '<a href="/guide/">Guide</a>' in r.text
    assert '<a href="/guide/setup">Setup</a>' in r.text
    assert '<a href="/story/demo/">Demo Story</a>' in r.text
    # table of contents for the headings on the page
    assert '<a href="#install">Install</a>' in r.text


def test_navigation_tree_is_collapsible(client):
    r = client.get("/")
    assert r.status_code == 200
    assert '<button class="nav-toggle"' in r.text
    assert 'aria-expanded="false"' in r.text
    assert '<span class="nav-toggle-icon" aria-hidden="true">▸</span>' in r.text
    # nothing is expanded automatically on the home page
    assert '<li class=" open">' not in r.text


def test_navigation_tree_opens_current_path(client):
    r = client.get("/guide/setup")
    assert r.status_code == 200
    # the branch leading to the current page is open ...
    assert '<li class="nav-section open">' in r.text
    assert 'aria-expanded="true"' in r.text
    assert '<span class="nav-toggle-icon" aria-hidden="true">▾</span>' in r.text
    # ... and the current page is highlighted
    assert '<li class=" active open">' in r.text


def test_navigation_tree_opens_current_path_for_deep_pages(client):
    r = client.get("/story/demo/")
    assert r.status_code == 200
    assert '<li class="nav-section open">' in r.text


def test_docs_site_nav_opens_current_path():
    site = DocsSite(FIXTURES / "docs")
    assert site.nav()[0].is_open is False
    nav = site.nav("/guide/setup")
    assert nav[1].is_open is True
    assert nav[1].children[0].is_open is True
    nav = site.nav("/story/demo/")
    assert nav[2].is_open is True
    assert nav[2].children[0].is_open is True


# -- admonitions ---------------------------------------------------------------------------------
def test_admonition_renders_static_block():
    page = MarkdownRenderer().render("!!! note\n    This is a note.\n")
    assert '<div class="admonition note">' in page.html
    assert '<p class="admonition-title">Note</p>' in page.html
    assert "<p>This is a note.</p>" in page.html


def test_admonition_renders_custom_title():
    page = MarkdownRenderer().render('!!! abstract "Custom Title"\n    Content here.\n')
    assert '<div class="admonition abstract">' in page.html
    assert '<p class="admonition-title">Custom Title</p>' in page.html


def test_admonition_without_title():
    page = MarkdownRenderer().render('!!! warning ""\n    No title.\n')
    assert '<div class="admonition warning">' in page.html
    assert "admonition-title" not in page.html
    assert "<p>No title.</p>" in page.html


def test_admonition_multiparagraph_content():
    page = MarkdownRenderer().render("!!! note\n    First para.\n\n    Second para.\n")
    assert page.html.count("<p>") >= 2
    assert "First para." in page.html
    assert "Second para." in page.html


def test_admonition_renders_collapsible():
    page = MarkdownRenderer().render("??? tip\n    Collapsible tip.\n")
    assert '<details class="admonition tip">' in page.html
    assert '<summary class="admonition-title">Tip</summary>' in page.html
    assert "<p>Collapsible tip.</p>" in page.html


def test_admonition_renders_expanded_collapsible():
    page = MarkdownRenderer().render("???+ danger\n    Expanded danger.\n")
    assert '<details class="admonition danger" open="open">' in page.html
    assert "<p>Expanded danger.</p>" in page.html


def test_admonition_allows_blank_line_before_content():
    page = MarkdownRenderer().render("!!! note\n\n    This is a note.\n")
    assert '<div class="admonition note">' in page.html
    assert '<p class="admonition-title">Note</p>' in page.html
    assert "<p>This is a note.</p>" in page.html
    assert "<pre" not in page.html


def test_admonition_unknown_type_falls_back_to_note():
    page = MarkdownRenderer().render("!!! futuristic\n    Falls back to note.\n")
    assert '<div class="admonition note">' in page.html
    assert '<p class="admonition-title">Note</p>' in page.html


def test_redirects(client):
    r = client.get("/guide", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/guide/"
    r = client.get("/guide/setup.md", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/guide/setup"
    r = client.get("/guide/index.md", follow_redirects=False)
    assert r.headers["location"] == "/guide/"


def test_static_files_from_docs(client):
    r = client.get("/story/demo/assets/pic.png")
    assert r.status_code == 200
    assert r.content.startswith(b"\x89PNG")


def test_missing_and_traversal(client):
    assert client.get("/nope").status_code == 404
    assert client.get("/guide/nope/").status_code == 404
    assert client.get("/../conftest.py").status_code == 404
    assert client.get("/%2e%2e/conftest.py").status_code == 404
    assert client.get("/.hidden").status_code == 404


def test_sparql_code_blocks_get_highlighting(client):
    r = client.get("/")
    assert "language-sparql" in r.text
    assert "/static/js/docs.js" in r.text


def test_plain_docs_do_not_load_lodeon_runtime(client):
    assert "lodeon/scripts/runtime.js" not in client.get("/").text


def test_no_docs_directory_shows_home(settings, registry, endpoint, tmp_path):
    settings.docs_path = tmp_path / "nodocs"
    app = create_app(settings, registry, transport=endpoint.transport)
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "SPARQL profiles" in r.text
        assert "Main store" in r.text
        assert c.get("/something").status_code == 404


def test_rewrite_md_link():
    assert rewrite_md_link("page.md") == "page"
    assert rewrite_md_link("dir/index.md#x") == "dir/#x"
    assert rewrite_md_link("index.md") == "./"
    assert rewrite_md_link("../README.md") == "../"
    assert rewrite_md_link("https://example.org/a.md") == "https://example.org/a.md"
    assert rewrite_md_link("image.png") == "image.png"


def test_docs_site_titles_and_urls():
    site = DocsSite(FIXTURES / "docs")
    assert site.title_of(FIXTURES / "docs" / "index.md") == "Test Home"
    assert site.title_of(FIXTURES / "docs" / "guide" / "setup.md") == "Setup"
    assert site.url_of(FIXTURES / "docs" / "guide" / "index.md") == "/guide/"
    assert site.url_of(FIXTURES / "docs" / "guide" / "setup.md") == "/guide/setup"
