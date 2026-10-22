"""Apply LODEON Special Node projections to data story Markdown.

Mirrors ``renderer/rendering/dispatcher.py`` from lodeon-core, but loads its
configuration, localisation and error registry from the resources bundled with
this package (optionally overridden by ``LODEON_CONFIG_PATH``).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from functools import cached_property
from pathlib import Path
from typing import Any

import yaml

from .metadata import render_lodeon_head_metadata
from .nodes.embed import preprocess_lodeon_embeds
from .nodes.graph_explorer import preprocess_lodeon_graph_explorers
from .nodes.leaflet import preprocess_lodeon_leaflet
from .nodes.verovio import preprocess_lodeon_verovio

log = logging.getLogger("shmarql.lodeon")

RESOURCES = Path(__file__).parent / "resources"

_FRONT_MATTER = re.compile(r"\A---\s*\n(?P<body>.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
# Fences that LODEON's renderer projects server-side.
_SERVER_FENCES = re.compile(r"^```lodeon-(embed|graph-explorer|leaflet|verovio)\b", re.MULTILINE)
# Any LODEON-specific fence, including the ones hydrated in the browser.
_STORY_FENCES = re.compile(r"^```(shmarql|lodeon-[a-z-]+)\b", re.MULTILINE)
# HTML produced by an earlier LODEON publication step.
_STORY_HTML = re.compile(r'class="(lodeon-[a-z-]+|shmarql-source)')


def extract_front_matter(markdown: str) -> tuple[dict[str, Any], str]:
    """Split leading YAML front matter from ``markdown``. Non-mapping YAML is ignored."""
    match = _FRONT_MATTER.match(markdown)
    if not match:
        return {}, markdown
    try:
        loaded = yaml.safe_load(match.group("body")) or {}
    except yaml.YAMLError as exc:
        log.warning("Invalid YAML front matter: %s", exc)
        return {}, markdown
    meta = loaded if isinstance(loaded, dict) else {}
    return meta, markdown[match.end() :]


def is_datastory(meta: Mapping[str, Any], body: str) -> bool:
    """True when the document needs the LODEON browser runtime."""
    return (
        "lodeon" in meta
        or bool(meta.get("datastory"))
        or bool(_STORY_FENCES.search(body))
        or bool(_STORY_HTML.search(body))
    )


class _Missing(dict):
    def __missing__(self, key: str) -> str:
        return ""


def _deep_merge(base: dict, override: dict) -> dict:
    result = dict(base)
    for key, value in override.items():
        if isinstance(result.get(key), dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _load_yaml(path: Path) -> dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}
    return data if isinstance(data, dict) else {}


class StoryRenderer:
    """Server-side part of the LODEON renderer."""

    def __init__(self, config_path: Path | None = None, locale: str = "en"):
        self.config_path = config_path
        self.locale = locale

    # -- resources ------------------------------------------------------------------
    @cached_property
    def config(self) -> dict[str, Any]:
        config = _load_yaml(RESOURCES / "config.yml")
        if self.config_path:
            override = _load_yaml(Path(self.config_path))
            if not override:
                log.warning("LODEON config %s is empty or missing", self.config_path)
            config = _deep_merge(config, override)
        return config

    def _messages(self, namespace: str) -> dict[str, Any]:
        for locale in (self.locale, "en"):
            data = _load_yaml(RESOURCES / "i18n" / locale / f"{namespace}.yml")
            messages = data.get("messages")
            if isinstance(messages, dict):
                return messages
        return {}

    @cached_property
    def _renderer_messages(self) -> dict[str, Any]:
        return self._messages("renderer")

    @staticmethod
    def _lookup(messages: Mapping[str, Any], key: str) -> Any:
        current: Any = messages
        for part in key.split("."):
            if not isinstance(current, Mapping) or part not in current:
                return None
            current = current[part]
        return current

    def text(self, key: str, variables: Mapping[str, object] | None = None) -> str:
        value = self._lookup(self._renderer_messages, key)
        if not isinstance(value, str):
            return f"renderer:{key}"
        if variables is not None:
            return value.format_map(_Missing(variables))
        return value

    @cached_property
    def error_registry(self) -> dict[str, Any]:
        """Technical error policies merged with localised copy (like lodeon-core)."""
        errors: dict[str, Any] = {}
        copy = self._messages("errors")
        for path in sorted((RESOURCES / "errors").glob("*.yml")):
            data = _load_yaml(path)
            defaults = data.get("defaults") if isinstance(data.get("defaults"), dict) else {}
            definitions = data.get("errors")
            if not isinstance(definitions, dict):
                continue
            for code, definition in definitions.items():
                if isinstance(definition, dict):
                    localized = self._lookup(copy, code)
                    errors[code] = {
                        **defaults,
                        **definition,
                        **(localized if isinstance(localized, dict) else {}),
                    }
        return {"errors": errors}

    # -- rendering ----------------------------------------------------------------------
    def preprocess(self, markdown: str) -> str:
        """Project the server-side LODEON fences in ``markdown`` to HTML."""
        if not _SERVER_FENCES.search(markdown):
            return markdown
        config = self.config
        nodes = config.get("nodes") if isinstance(config.get("nodes"), dict) else {}
        errors = self.error_registry
        embed = nodes.get("embed") if isinstance(nodes.get("embed"), dict) else {}
        markdown = preprocess_lodeon_embeds(markdown, embed, self.text, errors)
        markdown = preprocess_lodeon_graph_explorers(markdown, config, self.text, errors)
        markdown = preprocess_lodeon_leaflet(markdown, config, self.text, errors)
        verovio = nodes.get("verovio") if isinstance(nodes.get("verovio"), dict) else {}
        return preprocess_lodeon_verovio(
            markdown,
            verovio,
            self.text,
            self._lookup(self._messages("special-nodes"), "verovio"),
            errors,
        )

    def head_metadata(self, front_matter: Mapping[str, Any]) -> str:
        """``<meta>`` / JSON-LD tags for the ``lodeon`` block of a story's front matter."""
        return render_lodeon_head_metadata(dict(front_matter), self.text)
