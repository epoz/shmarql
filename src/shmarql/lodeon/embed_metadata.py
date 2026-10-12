"""Title/description lookup for Embed nodes in the editor (``POST /api/embed/metadata``).

Port of lodeon-core's ``api/integrations/embed.py``: only URLs whose origin is in
``nodes.embed.allowedOrigins`` are fetched, the response is read up to a byte limit,
and only OpenGraph / HTML ``<title>`` and description values are returned. Redirects
are followed only while they stay on an allowed origin.
"""

from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

HTML_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
HTML_META_RE_TEMPLATE = (
    r"<meta[^>]+(?:property|name)=[\"']{name}[\"'][^>]+content=[\"'](.*?)[\"'][^>]*>"
    r"|<meta[^>]+content=[\"'](.*?)[\"'][^>]+(?:property|name)=[\"']{name}[\"'][^>]*>"
)
MAX_REDIRECTS = 3


def _origin(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _validate(url: str, allowed: set[str]) -> dict[str, str]:
    if not url.strip():
        return {"status": "empty"}
    origin = _origin(url)
    if not origin:
        return {"status": "invalid"}
    if origin not in allowed:
        return {"status": "blocked", "origin": origin}
    return {"status": "allowed", "origin": origin}


def _first_meta(text: str, name: str) -> str:
    pattern = re.compile(HTML_META_RE_TEMPLATE.format(name=re.escape(name)), re.I | re.S)
    match = pattern.search(text)
    return html.unescape(next((g for g in match.groups() if g), "")) if match else ""


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def extract_metadata(text: str) -> dict[str, str]:
    title_match = HTML_TITLE_RE.search(text)
    title = _first_meta(text, "og:title") or (
        html.unescape(title_match.group(1)) if title_match else ""
    )
    description = _first_meta(text, "og:description") or _first_meta(text, "description")
    return {"title": _clean(title), "description": _clean(description)}


async def _fetch_html(
    client: httpx.AsyncClient, url: str, allowed: set[str], timeout: float, max_bytes: int
) -> str:
    headers = {"Accept": "text/html,application/xhtml+xml", "User-Agent": "shmarql-embed-metadata"}
    for _ in range(MAX_REDIRECTS + 1):
        async with client.stream(
            "GET", url, headers=headers, timeout=timeout, follow_redirects=False
        ) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers.get("location", ""))
                if _origin(url) not in allowed:
                    raise httpx.HTTPError("redirect to a non-allowed origin")
                continue
            response.raise_for_status()
            body = b""
            async for chunk in response.aiter_bytes():
                body += chunk
                if len(body) >= max_bytes:
                    break
            return body[:max_bytes].decode(response.encoding or "utf-8", errors="replace")
    raise httpx.HTTPError("too many redirects")


async def metadata_response(
    client: httpx.AsyncClient, urls: list[Any], embed_config: dict[str, Any]
) -> dict[str, Any]:
    allowed = {o for o in (_origin(str(v)) for v in embed_config.get("allowedOrigins") or []) if o}
    metadata = embed_config.get("metadata") or {}
    timeout = float(metadata.get("timeoutSeconds") or 5)
    max_bytes = int(metadata.get("maxResponseBytes") or 262_144)
    items = []
    for url in urls:
        if not isinstance(url, str) or not url.strip():
            continue
        validation = _validate(url, allowed)
        item = {
            "url": url,
            "status": validation["status"],
            "origin": validation.get("origin", ""),
            "title": "",
            "description": "",
        }
        if validation["status"] == "allowed":
            try:
                item.update(
                    extract_metadata(await _fetch_html(client, url, allowed, timeout, max_bytes))
                )
            except (httpx.HTTPError, UnicodeDecodeError, LookupError):
                item["status"] = "unavailable"
        items.append(item)
    return {"items": items}
