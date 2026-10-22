"""Preview and Publish for stories written in the LODEON editor.

Follows the request contract of lodeon-core's renderer (``renderer/publication``):
the editor posts ``{title, slug?, markdown, assets[]}`` either as JSON (assets as
``dataBase64``) or as ``multipart/form-data`` with a JSON ``payload`` part and one
file part per asset (``fileField``). Unlike LODEON no static site is built: the
Markdown is stored as-is and rendered by shmarql on request, exactly like any other
page of the documentation.

* Preview: ``<preview root>/<32 hex id>/index.md`` plus ``assets/``; removed after
  ``ttl`` seconds or on request.
* Publish: ``<story root>/<slug>/index.md`` plus ``assets/`` and an optional
  top-level ``*.lodeon.zip``; the story directory is replaced atomically.
"""

from __future__ import annotations

import base64
import binascii
import json
import re
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
PREVIEW_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
INDEX = "index.md"


class StoryError(Exception):
    """A request the editor can show: ``code`` is a LODEON error-registry id."""

    def __init__(self, code: str, status: int = 400, detail: str = ""):
        super().__init__(code)
        self.code = code
        self.status = status
        self.detail = detail or code


@dataclass
class StoryAsset:
    path: str
    data: bytes
    mime_type: str = ""


@dataclass
class StoryPayload:
    title: str
    markdown: str
    slug: str = ""
    assets: list[StoryAsset] = field(default_factory=list)


def is_valid_slug(slug: str) -> bool:
    return bool(SLUG_PATTERN.fullmatch(slug))


def is_valid_preview_id(preview_id: str) -> bool:
    return bool(PREVIEW_ID_PATTERN.fullmatch(preview_id))


def is_allowed_asset_path(path: str) -> bool:
    """Only story-local ``assets/...`` files and one top-level ``*.lodeon.zip``."""
    if not path or "\\" in path or path.startswith("/"):
        return False
    parts = PurePosixPath(path).parts
    if any(part in ("", ".", "..") or part.startswith(".") for part in parts):
        return False
    if parts[0] == "assets":
        return len(parts) > 1
    return len(parts) == 1 and path.endswith(".lodeon.zip")


def parse_payload(data: Any, files: dict[str, bytes] | None = None) -> StoryPayload:
    """Validate a decoded request body; ``files`` holds multipart file parts by field name."""
    if not isinstance(data, dict):
        raise StoryError("renderer.asset_payload_invalid", detail="payload_not_object")
    markdown = data.get("markdown")
    if not isinstance(markdown, str) or not markdown.strip():
        raise StoryError("renderer.markdown_empty")
    title = data.get("title")
    slug = data.get("slug")
    raw_assets = data.get("assets") or []
    if not isinstance(raw_assets, list):
        raise StoryError("renderer.asset_payload_invalid", detail="asset_payload_not_list")
    files = files or {}
    assets: list[StoryAsset] = []
    for raw in raw_assets:
        if not isinstance(raw, dict):
            raise StoryError("renderer.asset_payload_invalid", detail="asset_entry_not_object")
        path = raw.get("path")
        if not isinstance(path, str) or not is_allowed_asset_path(path):
            raise StoryError(
                "renderer.asset_path_invalid", detail=f"asset_path_not_allowed: {path}"
            )
        file_field = raw.get("fileField")
        if file_field is not None:
            if not isinstance(file_field, str) or file_field not in files:
                raise StoryError("renderer.asset_payload_invalid", detail="asset_file_missing")
            content = files[file_field]
        else:
            try:
                content = base64.b64decode(str(raw.get("dataBase64") or ""), validate=True)
            except (binascii.Error, ValueError) as exc:
                raise StoryError("renderer.asset_payload_invalid", detail=str(exc)) from exc
        mime_type = raw.get("mimeType")
        assets.append(StoryAsset(path, content, mime_type if isinstance(mime_type, str) else ""))
    return StoryPayload(
        title=title if isinstance(title, str) else "",
        markdown=markdown,
        slug=slug if isinstance(slug, str) else "",
        assets=assets,
    )


def parse_json_payload(body: bytes) -> StoryPayload:
    try:
        data = json.loads(body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise StoryError("renderer.asset_payload_invalid", detail=str(exc)) from exc
    return parse_payload(data)


def parse_multipart_payload(payload_text: str, files: dict[str, bytes]) -> StoryPayload:
    try:
        data = json.loads(payload_text or "{}")
    except json.JSONDecodeError as exc:
        raise StoryError("renderer.asset_payload_invalid", detail=str(exc)) from exc
    return parse_payload(data, files)


def write_story(directory: Path, story: StoryPayload) -> None:
    """Write ``index.md`` and the assets into a fresh ``directory``."""
    directory.mkdir(parents=True, exist_ok=True)
    root = directory.resolve()
    (directory / INDEX).write_text(story.markdown, encoding="utf-8")
    for asset in story.assets:
        target = (directory / asset.path).resolve()
        if not target.is_relative_to(root):  # is_allowed_asset_path already prevents this
            raise StoryError("renderer.asset_path_invalid", detail="asset_target_escape")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(asset.data)


class PreviewStore:
    """Short-lived preview directories below ``root``."""

    def __init__(self, root: Path | None, ttl: int = 3600):
        self.root = Path(root) if root else Path(tempfile.gettempdir()) / "shmarql-previews"
        self.ttl = ttl

    def create(self, story: StoryPayload) -> str:
        self.cleanup()
        preview_id = uuid.uuid4().hex
        directory = self.root / preview_id
        try:
            write_story(directory, story)
        except Exception:
            shutil.rmtree(directory, ignore_errors=True)
            raise
        return preview_id

    def directory(self, preview_id: str) -> Path | None:
        if not is_valid_preview_id(preview_id):
            return None
        directory = self.root / preview_id
        if not directory.is_dir():
            return None
        if self.ttl > 0 and time.time() - directory.stat().st_mtime > self.ttl:
            shutil.rmtree(directory, ignore_errors=True)
            return None
        return directory

    def delete(self, preview_id: str) -> bool:
        if not is_valid_preview_id(preview_id):
            raise StoryError("renderer.invalid_target", detail="invalid_preview_id")
        directory = self.root / preview_id
        existed = directory.is_dir()
        shutil.rmtree(directory, ignore_errors=True)
        return existed

    def cleanup(self, now: float | None = None) -> int:
        """Remove expired previews; returns how many were removed."""
        if self.ttl <= 0 or not self.root.is_dir():
            return 0
        now = time.time() if now is None else now
        removed = 0
        for candidate in self.root.iterdir():
            if not candidate.is_dir() or not is_valid_preview_id(candidate.name):
                continue
            try:
                expired = now - candidate.stat().st_mtime > self.ttl
            except OSError:
                continue
            if expired:
                shutil.rmtree(candidate, ignore_errors=True)
                removed += 1
        return removed


def publish_story(story_root: Path, story: StoryPayload) -> Path:
    """Replace ``story_root/<slug>`` with the story; returns the story directory.

    The new version is written next to the old one and swapped in with renames, so
    readers never see a half-written story and a failure leaves the old one intact.
    """
    if not is_valid_slug(story.slug):
        raise StoryError("publish.invalid_request", detail="invalid_story_slug")
    story_root.mkdir(parents=True, exist_ok=True)
    target = story_root / story.slug
    staging = Path(tempfile.mkdtemp(prefix=f".{story.slug}.new-", dir=story_root))
    backup = story_root / f".{story.slug}.old-{uuid.uuid4().hex}"
    try:
        write_story(staging, story)
        staging.chmod(0o755)
        if target.exists():
            target.rename(backup)
        staging.rename(target)
    except Exception:
        if backup.exists() and not target.exists():
            backup.rename(target)
        shutil.rmtree(staging, ignore_errors=True)
        raise
    shutil.rmtree(backup, ignore_errors=True)
    return target


def published_package_path(story: StoryPayload) -> str | None:
    for asset in story.assets:
        if "/" not in asset.path and asset.path.endswith(".lodeon.zip"):
            return asset.path
    return None
