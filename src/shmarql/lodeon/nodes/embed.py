"""Vendored verbatim from lodeon-core renderer/nodes (MIT License, (c) Torsten Schrade and LODEON contributors).

Embed Special Node validation and HTML projection."""

from __future__ import annotations

import html
import json
import re
from typing import Protocol
from urllib.parse import parse_qs, urlparse


class _TextResolver(Protocol):
    """Localized text callable required by Embed projection."""

    def __call__(self, key: str, variables: dict[str, object] | None = None) -> str: ...


_PATTERN = re.compile(r"```lodeon-embed(?P<info>[^\n]*)\n(?P<body>.*?)\n```", re.DOTALL)


def _error_definition(registry: dict[str, object], code: str) -> dict[str, object]:
    errors = registry.get("errors")
    value = errors.get(code) if isinstance(errors, dict) else None
    return value if isinstance(value, dict) else {}


def _render_error_template(template: str, variables: dict[str, object]) -> str:
    class Variables(dict[str, object]):
        def __missing__(self, key: str) -> str:
            return ""

    return template.format_map(Variables(variables)) if template.strip() else ""


def preprocess_lodeon_embeds(
    markdown: str,
    embed_config: dict[str, object],
    text: _TextResolver,
    error_registry: dict[str, object],
) -> str:
    """Replace every Embed fence with validated, configuration-bound HTML.

    Invalid JSON, disabled rendering, and disallowed origins become localized
    coded error surfaces. Remote content is referenced by URL and never fetched
    or embedded into the publication process.
    """

    def replace(match: re.Match[str]) -> str:
        info = match.group("info") or ""
        source = match.group("body") or ""

        try:
            spec = json.loads(source)
        except json.JSONDecodeError:
            return _render_embed_error("embed.spec_json_invalid", None, error_registry)

        return _render_lodeon_embed(spec, info, embed_config, text, error_registry)

    return _PATTERN.sub(replace, markdown)


def _render_lodeon_embed(
    spec: object,
    info: str,
    embed_config: dict[str, object],
    text: _TextResolver,
    error_registry: dict[str, object],
) -> str:
    if not isinstance(spec, dict):
        return _render_embed_error("embed.spec_invalid", None, error_registry)

    if not bool(embed_config.get("enabled", False)):
        return _render_embed_error("embed.disabled", None, error_registry)

    if spec.get("renderer") != "iframe":
        return _render_embed_error(
            "embed.renderer_invalid",
            {"renderer": str(spec.get("renderer") or "")},
            error_registry,
        )

    items = _valid_embed_items(spec, embed_config.get("allowedOrigins", []), text)

    if not items:
        validation = _validate_embed_url(
            spec.get("url"),
            embed_config.get("allowedOrigins", []),
        )
        code = validation.get("code")
        variables = validation.get("variables")
        return _render_embed_error(
            code if isinstance(code, str) else "embed.url_invalid",
            variables if isinstance(variables, dict) else {},
            error_registry,
        )

    title = str(spec.get("title") or _parse_fence_title(info) or text("embed.defaultTitle"))
    caption = str(spec.get("caption") or "").strip()
    sandbox = _sanitize_embed_token_list(embed_config.get("sandbox"))
    allow = _sanitize_embed_token_list(embed_config.get("allow"))
    referrer_policy = str(embed_config.get("referrerPolicy") or "strict-origin-when-cross-origin")
    loading = str(spec.get("loading") or "lazy")
    style = _embed_iframe_style(spec)
    selected_index = _normalize_embed_selected_index(spec.get("selectedIndex"), len(items))
    selected_item = items[selected_index]
    iframe = _render_embed_iframe(
        selected_item["url"],
        title,
        style,
        sandbox,
        allow,
        referrer_policy,
        loading,
    )
    view_mode = str(spec.get("viewMode") or "single")
    strip = str(spec.get("galleryReferenceStrip") or "horizontal")
    selector = ""

    if view_mode == "gallery" and strip != "none" and len(items) > 1:
        selector = _render_embed_selector(items, selected_index, strip, text)

    content = iframe
    if selector and strip == "vertical":
        content = f'<div class="lodeon-embed-preview-row">{selector}{iframe}</div>'
    elif selector:
        content = f"{iframe}\n{selector}"

    parts = [
        '<figure class="lodeon-embed">',
        content,
    ]

    if caption:
        parts.append(
            f'<figcaption class="lodeon-embed-caption">{html.escape(caption)}</figcaption>'
        )

    parts.append("</figure>")
    return "\n".join(parts)


def _valid_embed_items(
    spec: dict[str, object], allowed_origins: object, text: _TextResolver
) -> list[dict[str, str]]:
    raw_items = spec.get("items")

    if isinstance(raw_items, list) and raw_items:
        candidates = raw_items
    else:
        raw_urls = spec.get("urls")

        if not isinstance(raw_urls, list) or not raw_urls:
            raw_urls = [spec.get("url")]

        candidates = [{"url": raw_url} for raw_url in raw_urls]

    items: list[dict[str, str]] = []
    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            continue

        raw_url = candidate.get("url")
        validation = _validate_embed_url(raw_url, allowed_origins)

        if validation["status"] != "allowed":
            continue

        label = _compact_embed_item_text(candidate.get("label") or candidate.get("title"))
        resource = _compact_embed_item_text(candidate.get("resource") or candidate.get("item"))

        validated_url = validation.get("url")
        validated_origin = validation.get("origin")
        if not isinstance(validated_url, str) or not isinstance(validated_origin, str):
            continue

        items.append(
            {
                "url": validated_url,
                "origin": validated_origin,
                "title": label or text("embed.itemTitle", {"index": index + 1}),
                "meta": resource or _embed_url_summary(validated_url, validated_origin),
            }
        )

    return items


def _compact_embed_item_text(value: object) -> str:
    if not isinstance(value, str):
        return ""

    return value.strip()[:500]


def _normalize_embed_selected_index(value: object, count: int) -> int:
    if count <= 0:
        return 0

    try:
        selected_index = int(value) if isinstance(value, (str, int)) else 0
    except (TypeError, ValueError):
        selected_index = 0

    return min(max(selected_index, 0), count - 1)


def _render_embed_iframe(
    url: str,
    title: str,
    style: str,
    sandbox: list[str],
    allow: list[str],
    referrer_policy: str,
    loading: str,
) -> str:
    return (
        f'<iframe class="lodeon-embed-iframe" '
        f'src="{html.escape(url, quote=True)}" '
        f'title="{html.escape(title, quote=True)}" '
        f'style="{html.escape(style, quote=True)}" '
        f'sandbox="{html.escape(" ".join(sandbox), quote=True)}" '
        f'allow="{html.escape("; ".join(allow), quote=True)}" '
        f'referrerpolicy="{html.escape(referrer_policy, quote=True)}" '
        f'loading="{html.escape(loading, quote=True)}" '
        "allowfullscreen></iframe>"
    )


def _render_embed_selector(
    items: list[dict[str, str]],
    selected_index: int,
    strip: str,
    text: _TextResolver,
) -> str:
    classes = ["lodeon-embed-selector"]
    if strip == "vertical":
        classes.append("lodeon-embed-selector-vertical")

    buttons = []
    for index, item in enumerate(items):
        aria_label = text("embed.showItemAria", {"index": index + 1})
        buttons.append(
            '<button type="button" '
            'class="lodeon-embed-selector-item" '
            f'data-active="{str(index == selected_index).lower()}" '
            f'data-embed-url="{html.escape(item["url"], quote=True)}" '
            f'data-embed-title="{html.escape(item["title"], quote=True)}" '
            f'aria-pressed="{str(index == selected_index).lower()}" '
            f'aria-label="{html.escape(aria_label, quote=True)}">'
            f'<span class="lodeon-embed-selector-title">{html.escape(item["title"])}</span>'
            f'<span class="lodeon-embed-selector-meta">{html.escape(item["meta"])}</span>'
            "</button>"
        )

    return f'<div class="{" ".join(classes)}">' + "\n".join(buttons) + "</div>"


def _embed_url_summary(url: str, origin: str) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    distinguishing = (
        _first_query_value(query, "entity")
        or _first_query_value(query, "v")
        or next((part for part in reversed(parsed.path.split("/")) if part), "")
    )

    if distinguishing and distinguishing != "index.html":
        return f"{parsed.netloc} · {distinguishing}"

    return origin


def _first_query_value(query: dict[str, list[str]], key: str) -> str:
    values = query.get(key)

    if not values:
        return ""

    return str(values[0])


def _embed_iframe_style(spec: dict[str, object]) -> str:
    aspect_ratio = str(spec.get("aspectRatio") or "16:9")

    if aspect_ratio == "custom":
        height = _parse_embed_height(spec.get("height"))
        return f"width: 100%; height: {height}px; border: 0;"

    ratio = aspect_ratio.replace(":", " / ")
    return f"width: 100%; aspect-ratio: {ratio}; border: 0;"


def _parse_embed_height(value: object) -> int:
    try:
        height = int(value) if isinstance(value, (str, int)) else 420
    except (TypeError, ValueError):
        height = 420

    return min(max(height, 120), 1600)


def _render_embed_error(
    code: str,
    variables: dict[str, object] | None,
    error_registry: dict[str, object],
) -> str:
    definition = _error_definition(error_registry, code)
    detail = str(definition.get("detail") or code)
    hint = str(definition.get("hint") or "")
    technical_detail = ""
    variables = variables if isinstance(variables, dict) else {}

    if definition.get("showTechnicalDetail") is True:
        technical_detail = _render_error_template(
            str(definition.get("technicalDetailTemplate") or ""),
            variables,
        )

    parts = [f"<p>{html.escape(detail)}</p>"]
    if hint:
        parts.append(f"<p>{html.escape(hint)}</p>")
    if technical_detail:
        parts.append(f"<p><code>{html.escape(technical_detail)}</code></p>")

    attributes = (
        f'class="lodeon-embed lodeon-embed-error" data-error-code="{html.escape(code, quote=True)}"'
    )
    return f"<div {attributes}>" + "\n".join(parts) + "</div>"


def _validate_embed_url(url: object, allowed_origins: object) -> dict[str, object]:
    if not isinstance(url, str) or not url.strip():
        return {
            "status": "empty",
            "code": "embed.url_invalid",
            "variables": {"reason": "url_empty"},
        }

    from urllib.parse import urlparse

    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return {
            "status": "invalid",
            "code": "embed.url_invalid",
            "variables": {"reason": "absolute_http_url_required"},
        }

    origin = f"{parsed.scheme}://{parsed.netloc}"
    origin_values = allowed_origins if isinstance(allowed_origins, list) else []
    allowed = [
        normalized
        for normalized in (
            _normalize_embed_origin(origin_value)
            for origin_value in origin_values
            if isinstance(origin_value, str)
        )
        if normalized
    ]

    if origin not in allowed:
        return {
            "status": "blocked",
            "origin": origin,
            "code": "embed.origin_blocked",
            "variables": {"origin": origin},
        }

    return {"status": "allowed", "url": url, "origin": origin}


def _normalize_embed_origin(value: str) -> str:
    from urllib.parse import urlparse

    parsed = urlparse(value)

    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""

    return f"{parsed.scheme}://{parsed.netloc}"


def _sanitize_embed_token_list(tokens: object) -> list[str]:
    if not isinstance(tokens, list):
        return []

    return [
        token.strip()
        for token in tokens
        if isinstance(token, str) and re.fullmatch(r"[A-Za-z0-9_-]+", token.strip())
    ]


def _parse_fence_title(info: str) -> str:
    match = re.search(r'title="([^"]*)"', info)
    return match.group(1) if match else ""
