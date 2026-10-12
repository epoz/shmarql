"""A directory of Markdown files served as a documentation site.

URL mapping (``DOCS_PATH`` is the root directory):

* ``/``            -> ``index.md`` (or ``README.md``)
* ``/guide``       -> ``guide.md``
* ``/guide/``      -> ``guide/index.md`` (``/guide`` redirects here when there's no guide.md)
* ``/guide.md``    -> redirects to ``/guide``
* any other existing file (images, story assets, ...) is served as-is.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from .lodeon import extract_front_matter
from .markdown_render import markdown_title

log = logging.getLogger("shmarql.docs")

INDEX_NAMES = ("index.md", "README.md", "readme.md")


@dataclass
class Resolution:
    kind: str  # "markdown" | "file" | "redirect" | "missing"
    path: Path | None = None
    location: str = ""


@dataclass
class NavItem:
    title: str
    url: str
    children: list[NavItem] = field(default_factory=list)
    is_section: bool = False


class DocsSite:
    def __init__(self, root: Path):
        self.root = Path(root)
        self._title_cache: dict[Path, tuple[float, str]] = {}

    @property
    def exists(self) -> bool:
        return self.root.is_dir()

    def _safe(self, candidate: Path) -> Path | None:
        """Return the resolved path if it lies inside the docs root, else None."""
        try:
            resolved = candidate.resolve()
            resolved.relative_to(self.root.resolve())
        except (ValueError, OSError):
            return None
        return resolved

    def _index_of(self, directory: Path) -> Path | None:
        for name in INDEX_NAMES:
            candidate = directory / name
            if candidate.is_file():
                return candidate
        return None

    def resolve(self, url_path: str) -> Resolution:
        if not self.exists:
            return Resolution("missing")
        url_path = url_path.lstrip("/")
        if any(part.startswith(".") for part in url_path.split("/") if part):
            return Resolution("missing")
        target = self._safe(self.root / url_path) if url_path else self.root.resolve()
        if target is None:
            return Resolution("missing")

        if url_path == "" or url_path.endswith("/"):
            if target.is_dir():
                index = self._index_of(target)
                if index:
                    return Resolution("markdown", index)
            return Resolution("missing")

        if url_path.endswith(".md"):
            if target.is_file():
                clean = url_path[: -len(".md")]
                name = clean.rsplit("/", 1)[-1]
                if name in ("index", "README", "readme"):
                    clean = clean[: -len(name)]
                return Resolution("redirect", location="/" + clean)
            return Resolution("missing")

        md_file = self._safe(self.root / f"{url_path}.md")
        if md_file and md_file.is_file():
            return Resolution("markdown", md_file)
        if target.is_dir():
            if self._index_of(target):
                return Resolution("redirect", location="/" + url_path + "/")
            return Resolution("missing")
        if target.is_file():
            return Resolution("file", target)
        return Resolution("missing")

    # -- navigation -------------------------------------------------------------------
    def title_of(self, path: Path) -> str:
        try:
            mtime = path.stat().st_mtime
        except OSError:
            return path.stem
        cached = self._title_cache.get(path)
        if cached and cached[0] == mtime:
            return cached[1]
        fallback = path.stem if path.name not in INDEX_NAMES else path.parent.name or "Home"
        try:
            meta, body = extract_front_matter(path.read_text(encoding="utf-8"))
            title = markdown_title(meta, body, fallback.replace("-", " ").replace("_", " "))
        except (OSError, UnicodeDecodeError):
            title = fallback
        self._title_cache[path] = (mtime, title)
        return title

    def url_of(self, path: Path) -> str:
        rel = path.resolve().relative_to(self.root.resolve()).as_posix()
        if path.name in INDEX_NAMES:
            parent = rel[: -len(path.name)]
            return "/" + parent
        return "/" + rel[: -len(".md")]

    def nav(self) -> list[NavItem]:
        if not self.exists:
            return []
        return self._nav_dir(self.root)

    def _nav_dir(self, directory: Path) -> list[NavItem]:
        items: list[NavItem] = []
        try:
            entries = sorted(directory.iterdir(), key=lambda p: (p.is_dir(), p.name.lower()))
        except OSError:
            return items
        for entry in entries:
            if entry.name.startswith((".", "_")):
                continue
            if entry.is_file() and entry.suffix == ".md":
                if entry.name in INDEX_NAMES and directory != self.root:
                    continue  # represented by the section itself
                if entry.name in INDEX_NAMES:
                    items.insert(0, NavItem(self.title_of(entry), "/"))
                    continue
                items.append(NavItem(self.title_of(entry), self.url_of(entry)))
            elif entry.is_dir():
                index = self._index_of(entry)
                children = self._nav_dir(entry)
                if not index and not children:
                    continue
                title = self.title_of(index) if index else entry.name.replace("-", " ")
                url = self.url_of(index) if index else ""
                items.append(NavItem(title, url, children, is_section=True))
        return items
