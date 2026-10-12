"""Markdown rendering for documentation pages and LODEON data stories."""

from __future__ import annotations

import re
import xml.etree.ElementTree as etree
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import markdown
from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor
from pymdownx.superfences import fence_code_format

from .lodeon import StoryRenderer, extract_front_matter, is_datastory

# Fence name -> CSS class of the <pre> shell; matches LODEON's mkdocs.yml so that
# the LODEON browser runtime (runtime.js) can find and hydrate the blocks.
CUSTOM_FENCES = {
    "shmarql": "shmarql-source",
    "lodeon-visualization": "lodeon-visualization-source",
    "lodeon-rawgraphs": "lodeon-rawgraphs-source",
    "lodeon-embed": "lodeon-embed-source",
    "lodeon-iiif": "lodeon-iiif-source",
    "lodeon-graph-explorer": "lodeon-graph-explorer-source",
    "lodeon-leaflet": "lodeon-leaflet-source",
    "lodeon-verovio": "lodeon-verovio-source",
    "mermaid": "mermaid",
}


class _MdLinkRewriter(Treeprocessor):
    """Rewrite relative links to ``*.md`` files into the clean URLs served by the docs app."""

    def run(self, root: etree.Element) -> None:
        for el in root.iter("a"):
            href = el.get("href")
            if href:
                el.set("href", rewrite_md_link(href))


class MdLinkExtension(Extension):
    def extendMarkdown(self, md: markdown.Markdown) -> None:  # noqa: N802 (Markdown API)
        md.treeprocessors.register(_MdLinkRewriter(md), "shmarql_md_links", 5)


def rewrite_md_link(href: str) -> str:
    parts = urlsplit(href)
    if parts.scheme or parts.netloc or not parts.path.endswith(".md"):
        return href
    path = parts.path[: -len(".md")]
    if path == "index" or path.endswith("/index") or path.lower().endswith("readme"):
        path = path[: -len(path.rsplit("/", 1)[-1])] or "./"
    return urlunsplit(("", "", path, parts.query, parts.fragment))


def _extensions() -> tuple[list[Any], dict[str, dict[str, Any]]]:
    fences = [
        {"name": name, "class": css, "format": fence_code_format}
        for name, css in CUSTOM_FENCES.items()
    ]
    extensions: list[Any] = [
        "abbr",
        "attr_list",
        "def_list",
        "footnotes",
        "md_in_html",
        "tables",
        "toc",
        "pymdownx.blocks.admonition",
        "pymdownx.blocks.caption",
        "pymdownx.blocks.details",
        "pymdownx.blocks.html",
        "pymdownx.blocks.tab",
        "pymdownx.highlight",
        "pymdownx.inlinehilite",
        "pymdownx.superfences",
        "pymdownx.tasklist",
        "pymdownx.tilde",
        MdLinkExtension(),
    ]
    configs = {
        "toc": {"permalink": True},
        "pymdownx.highlight": {"pygments_lang_class": True},
        "pymdownx.superfences": {"custom_fences": fences},
        "pymdownx.tasklist": {"custom_checkbox": True},
        "pymdownx.blocks.tab": {"alternate_style": True},
    }
    return extensions, configs


@dataclass
class RenderedPage:
    html: str
    title: str
    meta: dict[str, Any]
    toc: list[dict[str, Any]] = field(default_factory=list)
    is_datastory: bool = False
    head: str = ""


_H1 = re.compile(r"^#\s+(.+?)\s*#*\s*$", re.MULTILINE)


def markdown_title(meta: dict[str, Any], body: str, fallback: str = "") -> str:
    title = meta.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    match = _H1.search(body)
    return match.group(1).strip() if match else fallback


class MarkdownRenderer:
    def __init__(self, story_renderer: StoryRenderer | None = None):
        self.story_renderer = story_renderer or StoryRenderer()

    def render(self, text: str, fallback_title: str = "") -> RenderedPage:
        meta, body = extract_front_matter(text)
        story = is_datastory(meta, body)
        head = ""
        if story:
            body = self.story_renderer.preprocess(body)
            head = self.story_renderer.head_metadata(meta)
        extensions, configs = _extensions()
        md = markdown.Markdown(extensions=extensions, extension_configs=configs)
        html = md.convert(body)
        return RenderedPage(
            html=html,
            title=markdown_title(meta, body, fallback_title),
            meta=meta,
            toc=getattr(md, "toc_tokens", []),
            is_datastory=story,
            head=head,
        )
