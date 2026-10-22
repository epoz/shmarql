"""Vendored from lodeon-core renderer/rendering/metadata.py (MIT License).

HTML-head metadata projection for rendered stories."""

from __future__ import annotations

import html
import json
from datetime import date, datetime
from pathlib import Path
from typing import Protocol


class TextResolver(Protocol):
    """Localized text callable used by metadata projection."""

    def __call__(self, key: str, variables: dict[str, object] | None = None) -> str: ...


def inject_story_head_metadata(
    html_path: Path,
    front_matter: dict[str, object],
    text: TextResolver,
) -> None:
    """Inject configured metadata immediately before an existing HTML head end."""

    head_markup = render_lodeon_head_metadata(front_matter, text)

    if not head_markup or not html_path.exists():
        return

    html_text = html_path.read_text(encoding="utf-8")
    marker = "</head>"

    if marker not in html_text:
        return

    html_path.write_text(
        html_text.replace(marker, f"{head_markup}\n{marker}", 1),
        encoding="utf-8",
    )


def render_lodeon_head_metadata(front_matter: dict[str, object], text: TextResolver) -> str:
    lodeon = front_matter.get("lodeon")

    if not isinstance(lodeon, dict):
        return ""

    parts = []
    parts.extend(render_html_meta_tags(lodeon.get("htmlMeta")))
    parts.extend(render_open_graph_meta_tags(lodeon.get("openGraph")))

    json_ld = lodeon.get("jsonLd")
    if isinstance(json_ld, dict) and json_ld:
        parts.append(render_json_ld_script(json_ld))

    if not parts:
        return ""

    return "\n".join([text("metadata.comment", None), *parts])


def render_html_meta_tags(values: object) -> list[str]:
    if not isinstance(values, dict):
        return []

    tags = []
    for name, value in values.items():
        for content in metadata_values(value):
            if name == "keywords" and isinstance(value, list):
                continue
            tags.append(
                f'<meta name="{html.escape(str(name), quote=True)}" content="{html.escape(content, quote=True)}">'
            )

    keywords = values.get("keywords")
    if isinstance(keywords, list):
        keyword_content = ", ".join(metadata_values(keywords))
        if keyword_content:
            tags.append(
                f'<meta name="keywords" content="{html.escape(keyword_content, quote=True)}">'
            )

    return tags


def render_open_graph_meta_tags(values: object) -> list[str]:
    if not isinstance(values, dict):
        return []

    tags = []
    for name, value in values.items():
        property_name = str(name) if str(name).startswith("og:") else f"og:{name}"
        for content in metadata_values(value):
            tags.append(
                f'<meta property="{html.escape(property_name, quote=True)}" content="{html.escape(content, quote=True)}">'
            )

    return tags


def render_json_ld_script(value: dict[str, object]) -> str:
    payload = json.dumps(
        normalize_metadata_value(value),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    payload = payload.replace("</", "<\\/")

    return f'<script type="application/ld+json">{payload}</script>'


def normalize_metadata_value(value: object) -> object:
    if isinstance(value, dict):
        return {str(key): normalize_metadata_value(item) for key, item in value.items()}

    if isinstance(value, list):
        return [normalize_metadata_value(item) for item in value]

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    return value


def metadata_values(value: object) -> list[str]:
    if isinstance(value, list):
        return [scalar for item in value for scalar in metadata_values(item)]

    if isinstance(value, bool):
        return [str(value).lower()]

    if isinstance(value, (datetime, date)):
        return [value.isoformat()]

    if isinstance(value, (str, int, float)):
        text = str(value).strip()
        return [text] if text else []

    return []
