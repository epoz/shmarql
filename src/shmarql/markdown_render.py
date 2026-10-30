"""Markdown rendering for documentation pages and LODEON data stories."""

from __future__ import annotations

import re
import xml.etree.ElementTree as etree
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import markdown
from markdown.blockprocessors import BlockProcessor
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


# Admonition types known to Material for MkDocs; anything else falls back to "note".
ADMONITION_TYPES = (
    "note",
    "abstract",
    "info",
    "tip",
    "success",
    "question",
    "warning",
    "failure",
    "danger",
    "bug",
    "quote",
)
ADMONITION_FALLBACK_TYPE = "note"

# `!!! type ["Title"]` or `??? type` / `???+ type ["Title"]`.
_ADMONITION_RE = re.compile(
    r"[ ]*(?P<kind>!!!|\?\?\?)(?P<plus>\+?)[ ]+(?P<type>[\w\-]+)(?P<rest>.*)"
)


class AdmonitionProcessor(BlockProcessor):
    """Material for MkDocs style admonitions.

    ``!!! type`` renders a static admonition, ``!!! type "Title"`` a static one
    with a custom title, ``!!! type ""`` omits the title, ``??? type`` a
    collapsible one and ``???+ type`` a collapsible, expanded one.  Content is
    indented by four spaces, mirroring the Material for MkDocs syntax.
    """

    CLASSNAME = "admonition"
    CLASSNAME_TITLE = "admonition-title"

    def __init__(self, parser: Any) -> None:
        super().__init__(parser)
        self.types = frozenset(ADMONITION_TYPES)

    def test(self, parent: etree.Element, block: str) -> bool:
        return _ADMONITION_RE.match(block) is not None

    def run(self, parent: etree.Element, blocks: list[str]) -> bool | None:
        if not self.test(parent, blocks[0]):
            return False
        block = blocks.pop(0)
        m = _ADMONITION_RE.match(block)
        assert m is not None
        kind = m.group("kind")
        is_collapsible = kind == "???"
        is_expanded = (m.group("plus") or "") == "+"
        type_ = m.group("type")
        type_ = type_ if type_ in self.types else ADMONITION_FALLBACK_TYPE
        title, tokens = self._parse_title(m.group("rest") or "")
        content_lines = block[m.end() :].split("\n")[1:]
        content_indent = 0
        for line in content_lines:
            if line.strip():
                content_indent = len(line) - len(line.lstrip(" "))
                break
        content_text = self._dedent("\n".join(content_lines))
        parts: list[str] = [content_text] if content_text.strip() else []
        if content_indent:
            # Blocks are split on blank lines, so an admonition spanning several
            # paragraphs shows up as several blocks: keep consuming indented ones.
            while blocks and self._is_indented(blocks[0], content_indent):
                parts.append(self._dedent(blocks.pop(0)))
        content = "\n\n".join(parts)

        classes = [self.CLASSNAME, type_]
        is_inline = "inline" in tokens
        if is_inline:
            classes.append("inline")
            if "end" in tokens:
                classes.append("inline-end")
        element_class = " ".join(classes)

        if is_collapsible:
            details = etree.SubElement(parent, "details")
            details.set("class", element_class)
            if is_expanded:
                details.set("open", "open")
            summary = etree.SubElement(details, "summary")
            summary.set("class", self.CLASSNAME_TITLE)
            summary_text = self._title_text(type_, title, True)
            if summary_text is not None:
                summary.text = summary_text
            if content.strip():
                self.parser.parseChunk(details, content)
        else:
            admonition = etree.SubElement(parent, "div")
            admonition.set("class", element_class)
            title_text = self._title_text(type_, title, False)
            if title_text is not None:
                title_el = etree.SubElement(admonition, "p")
                title_el.set("class", self.CLASSNAME_TITLE)
                title_el.text = title_text
            if content.strip():
                self.parser.parseChunk(admonition, content)
        return True

    def _is_indented(self, block: str, indent: int) -> bool:
        first = block.split("\n", 1)[0]
        if not first.strip():
            return False
        return len(first) - len(first.lstrip(" ")) >= indent

    def _title_text(self, type_: str, title: str | None, is_collapsible: bool) -> str | None:
        default_title = re.sub(r"[_-]+", " ", type_).title()
        if is_collapsible:
            # An empty title is not supported for collapsible admonitions.
            return (title or "").strip() or default_title
        if title is None:
            return default_title
        return title if (title or "").strip() else None

    def _parse_title(self, rest: str) -> tuple[str | None, list[str]]:
        rest = (rest or "").strip()
        title: str | None = None
        tokens: list[str] = []
        if rest.startswith('"'):
            end = rest.find('"', 1)
            title = rest[1:end] if end > 0 else ""
            tail = rest[end + 1 :].strip()
            tokens = tail.split() if tail else []
        elif rest:
            tokens = rest.split()
        return title, tokens

    def _dedent(self, text: str) -> str:
        lines = text.split("\n")
        content_indent = 0
        dedented: list[str] = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                dedented.append(line)
                continue
            indent = len(line) - len(line.lstrip(" "))
            if not content_indent:
                content_indent = indent
            if indent < content_indent:
                break
            dedented.append(line[content_indent:] if indent >= content_indent else line)
        return "\n".join(dedented)


class AdmonitionExtension(Extension):
    def extendMarkdown(self, md: markdown.Markdown) -> None:  # noqa: N802 (Markdown API)
        md.parser.blockprocessors.register(AdmonitionProcessor(md.parser), "admonition", 105)


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
        AdmonitionExtension(),
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
