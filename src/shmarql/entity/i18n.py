"""Tiny i18n layer for the UI (ported from ldview's ``i18n.py``)."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable

log = logging.getLogger("shmarql.i18n")

TRANSLATIONS: dict[str, dict[str, str]] = {
    "en": {
        "menu.docs": "Docs",
        "menu.query": "Query",
        "menu.entity": "Entity",
        "menu.editor": "Story editor",
        "download.label": "Download as:",
        "inverse_relations.heading": "Inverse relations",
        "inverse_relations.all": "show all {count} in the query editor",
        "error.not_found": "Resource not found: {error}",
        "error.internal": "Internal server error: {error}",
        "error.no_profile": "No SPARQL profile is configured for this resource",
        "data_source.label": "data from SPARQL profile:",
        "wkt.hint": "see map — or expand",
        "entity.lookup": "Look up an entity URI",
        "entity.lookup_button": "View",
        "query.profile": "Profile",
        "query.profile_placeholder": "Type to choose a SPARQL profile…",
        "query.run": "Run query",
        "query.running": "Running…",
        "query.results": "Results",
        "query.no_profiles": "No SPARQL profiles are configured.",
        "query.rows": "{count} rows",
    },
    "nl": {
        "menu.docs": "Documentatie",
        "menu.query": "Query",
        "menu.entity": "Entiteit",
        "menu.editor": "Verhaleneditor",
        "download.label": "Opslaan als:",
        "inverse_relations.heading": "Inkomende links",
        "inverse_relations.all": "toon alle {count} in de query-editor",
        "error.not_found": "Bron niet gevonden: {error}",
        "error.internal": "Interne serverfout: {error}",
        "error.no_profile": "Er is geen SPARQL-profiel geconfigureerd voor deze bron",
        "data_source.label": "data van SPARQL-profiel:",
        "wkt.hint": "zie kaart — of klap open",
        "entity.lookup": "Zoek een entiteit-URI op",
        "entity.lookup_button": "Bekijk",
        "query.profile": "Profiel",
        "query.profile_placeholder": "Typ om een SPARQL-profiel te kiezen…",
        "query.run": "Voer query uit",
        "query.running": "Bezig…",
        "query.results": "Resultaten",
        "query.no_profiles": "Er zijn geen SPARQL-profielen geconfigureerd.",
        "query.rows": "{count} rijen",
    },
}


def preferred_language(accept_language: str | None, supported: Iterable[str], default: str) -> str:
    """Pick the best supported language from an ``Accept-Language`` header."""
    supported = list(supported)
    if not accept_language:
        return default
    languages: list[tuple[str, float]] = []
    for entry in accept_language.split(","):
        parts = entry.strip().split(";")
        lang = parts[0].strip().lower().split("-")[0]
        quality = 1.0
        for part in parts[1:]:
            part = part.strip()
            if part.startswith("q="):
                try:
                    quality = float(part[2:])
                except ValueError:
                    quality = 1.0
        if lang:
            languages.append((lang, quality))
    languages.sort(key=lambda x: x[1], reverse=True)
    for lang, _q in languages:
        if lang in supported:
            return lang
    return default


def translator(lang: str, default: str = "en") -> Callable[..., str]:
    """Return a ``_(key, **kwargs)`` function bound to ``lang``."""

    def translate(key: str, **kwargs: object) -> str:
        text = TRANSLATIONS.get(lang, {}).get(key)
        if text is None:
            text = TRANSLATIONS.get(default, {}).get(key)
        if text is None:
            log.debug("Missing translation for key %s", key)
            text = key
        if kwargs:
            try:
                text = text.format(**kwargs)
            except (KeyError, IndexError):
                log.warning("Missing format argument for %s", key)
        return text

    return translate
