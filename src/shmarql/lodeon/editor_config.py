"""Browser configuration of the LODEON story editor (``GET /api/config``).

Mirrors ``RuntimeDiscovery.public_client_config`` from lodeon-core's API: the same
JSON shape, assembled from the resources bundled in ``lodeon/resources`` (the
renderer ``config.yml`` and its ``LODEON_CONFIG_PATH`` override, localisation,
error registry, metadata panel, rich text, renderer engines) and from the SPARQL
profiles of this site. The LODEON Assistant is not part of this editor, so the
``assistant`` section is omitted.
"""

from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from typing import Any
from urllib.parse import quote

from ..entity.settings import DisplaySettings
from ..profiles import Profile, ProfileRegistry
from .dispatcher import RESOURCES, StoryRenderer, _deep_merge, _load_yaml

BASE_URL = "/lodeon/"
API_PREFIX = "/api"
# i18next namespaces used by the editor.
EDITOR_NAMESPACES = ("editor", "special-nodes")
# Error-definition fields that may be sent to browsers.
PUBLIC_ERROR_FIELDS = {
    "status",
    "severity",
    "title",
    "detail",
    "hint",
    "showTechnicalDetail",
    "technicalDetailTemplate",
}
PUBLIC_ENGINE_FIELDS = {
    "templateDirectory",
    "templates",
    "requiredMarkdownExtensions",
    "formatMappings",
    "containerMappings",
    "metadata",
    "specialNodeMappings",
}
RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"


def sparql_url(profile: Profile) -> str:
    return f"{API_PREFIX}/sparql/{quote(profile.name, safe='')}"


def sparnatural_url(profile: Profile) -> str:
    return f"{API_PREFIX}/knowledge-graphs/{quote(profile.name, safe='')}/sparnatural"


def graph_explorer_profile(profile: Profile, display: DisplaySettings) -> dict[str, Any]:
    """Graph Explorer settings for one profile; ``graph_explorer`` in the YAML overrides them."""
    defaults: dict[str, Any] = {
        "labelProperties": list(display.label_predicates),
        "descriptionProperties": list(display.description_predicates),
        "typeProperties": [RDF_TYPE],
        "predicateLabelProperties": [RDFS_LABEL],
        "defaultDirection": "both",
        "defaultDepth": 1,
        "maxDepth": 3,
        "maxNodes": 100,
        "maxEdgesPerNode": 50,
        "includeLiterals": True,
        "includeBlankNodes": False,
        "showPredicateLabels": True,
        "showTypes": True,
        "defaultColorScheme": "basic",
        "colorSchemes": {
            "basic": {
                "label": "Basic",
                "nodeColors": {"iri": "#0072B2", "blank": "#E69F00", "literal": "#FFFFFF"},
                "edgeColors": {"default": "#666666"},
            }
        },
    }
    merged = _deep_merge(defaults, profile.graph_explorer)
    merged["expandURL"] = f"{API_PREFIX}/explorer/{quote(profile.name, safe='')}/expand"
    return merged


class EditorConfig:
    """Builds the editor configuration; static parts are loaded once."""

    def __init__(
        self,
        story_renderer: StoryRenderer,
        registry: ProfileRegistry,
        display_for: Callable[[Profile], DisplaySettings],
        *,
        title: str = "LODEON",
        welcome_story: bool = True,
    ):
        self.story_renderer = story_renderer
        self.registry = registry
        self.display_for = display_for
        self.title = title
        self.welcome_story = welcome_story

    # -- static resources ---------------------------------------------------------------
    def _localization(self) -> dict[str, Any]:
        locale = self.story_renderer.locale
        resources: dict[str, Any] = {}
        for loc in dict.fromkeys((locale, "en")):
            namespaces = {}
            for namespace in EDITOR_NAMESPACES:
                data = _load_yaml(RESOURCES / "i18n" / loc / f"{namespace}.yml")
                if isinstance(data.get("messages"), dict):
                    namespaces[namespace] = data["messages"]
            if namespaces:
                resources[loc] = namespaces
        return {"activeLocale": locale, "fallbackLocale": "en", "resources": resources}

    def _errors(self) -> dict[str, Any]:
        errors = self.story_renderer.error_registry.get("errors", {})
        return {
            code: {k: v for k, v in definition.items() if k in PUBLIC_ERROR_FIELDS}
            for code, definition in errors.items()
            if isinstance(definition, dict)
        }

    @staticmethod
    def _renderer_engines() -> dict[str, Any]:
        engines = _load_yaml(RESOURCES / "renderers.yml").get("engines") or {}
        public: dict[str, Any] = {}
        for engine_id, engine in engines.items():
            if not isinstance(engine, dict):
                continue
            engine = {k: deepcopy(v) for k, v in engine.items() if k in PUBLIC_ENGINE_FIELDS}
            directory = engine.get("templateDirectory")
            if isinstance(directory, str):
                # lodeon-core paths are relative to its config root ("runtime/...").
                root = RESOURCES / directory.removeprefix("runtime/")
                engine["templates"] = {
                    path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
                    for path in sorted(root.rglob("*"))
                    if path.is_file()
                }
            public[engine_id] = engine
        return public

    # -- per-request configuration ----------------------------------------------------
    def _nodes(self) -> dict[str, Any]:
        nodes = deepcopy(self.story_renderer.config.get("nodes") or {})
        profiles = list(self.registry)
        sparql = nodes.setdefault("sparql", {})
        sparql["profiles"] = {
            p.name: {"configURL": sparnatural_url(p)} for p in profiles if p.sparnatural is not None
        }
        explorer = nodes.setdefault("graphExplorer", {})
        configured = explorer.get("profiles") if isinstance(explorer.get("profiles"), dict) else {}
        explorer["profiles"] = {
            p.name: _deep_merge(
                graph_explorer_profile(p, self.display_for(p)),
                configured.get(p.name) or {},
            )
            for p in profiles
        }
        return nodes

    def _knowledge_graph(self) -> dict[str, Any]:
        default = self.registry.default
        config: dict[str, Any] = {
            "ui": {"showProfileSelect": True},
            "profiles": [
                {
                    "id": p.name,
                    "label": p.label,
                    "description": p.description,
                    "active": p is default,
                    "sparqlUrl": sparql_url(p),
                }
                for p in self.registry
            ],
        }
        if default is not None:
            config["defaultProfile"] = default.name
        return config

    def build(self) -> dict[str, Any]:
        engines = self._renderer_engines()
        return {
            "application": {
                "title": self.title,
                "baseURL": BASE_URL,
                "branding": {
                    "logo": {
                        "light": "resources/branding/logo-light.svg",
                        "dark": "resources/branding/logo-dark.svg",
                    },
                    "favIcon": {
                        "light": "resources/branding/favicon-light.svg",
                        "dark": "resources/branding/favicon-dark.svg",
                    },
                },
            },
            "localization": self._localization(),
            "errors": self._errors(),
            "editor": {
                "defaultProjectTitle": "Untitled Data Story",
                "welcomeStory": {
                    "enabled": self.welcome_story,
                    "url": f"{API_PREFIX}/welcome-story",
                },
                "richText": {
                    "enabled": True,
                    "resolved": _load_yaml(RESOURCES / "rich-text.yml"),
                },
            },
            "metadata": {"enabled": True, "resolved": _load_yaml(RESOURCES / "metadata.yml")},
            "nodes": self._nodes(),
            "knowledgeGraph": self._knowledge_graph(),
            "renderer": {
                "activeEngine": "shmarql",
                "engines": engines,
                "previewURL": f"{API_PREFIX}/preview",
                "publishURL": f"{API_PREFIX}/publish",
            },
        }
