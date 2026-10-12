"""Vendored verbatim from lodeon-core renderer/nodes (MIT License, (c) Torsten Schrade and LODEON contributors).

Verovio Special Node validation and HTML projection."""

from __future__ import annotations

import html
import json
import math
import re
from typing import Protocol, TypedDict


class _TextResolver(Protocol):
    """Localized text callable required by Verovio projection."""

    def __call__(self, key: str, variables: dict[str, object] | None = None) -> str: ...


class _VerovioPublicPayload(TypedDict):
    """Stable viewer envelope around validated notation and runtime data."""

    spec: dict[str, object]
    runtime: dict[str, object]
    messages: object
    errors: dict[str, object]
    unavailable: str


_PATTERN = re.compile(r"```lodeon-verovio(?P<info>[^\n]*)\n(?P<body>.*?)\n```", re.DOTALL)


def _parse_fence_title(info: str) -> str:
    match = re.search(r'title="([^"]*)"', info)
    return match.group(1) if match else ""


def _safe_inline_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def _error_definition(registry: dict[str, object], code: str) -> dict[str, object]:
    errors = registry.get("errors")
    if not isinstance(errors, dict):
        return {}
    value = errors.get(code)
    return value if isinstance(value, dict) else {}


def _render_error_template(template: str, variables: dict[str, object]) -> str:
    class Variables(dict[str, object]):
        def __missing__(self, key: str) -> str:
            return ""

    return template.format_map(Variables(variables)) if template.strip() else ""


class _VerovioSpecError(ValueError):
    def __init__(self, code: str, variables: dict[str, object] | None = None):
        self.code = code
        self.variables = variables or {}
        super().__init__(code)


def preprocess_lodeon_verovio(
    markdown: str,
    runtime: dict[str, object],
    text: _TextResolver,
    special_node_messages: object,
    error_registry: dict[str, object],
) -> str:
    """Validate Verovio fences and render pinned-runtime publication markup.

    Original notation text remains canonical. Invalid node state becomes a coded
    error surface, while successful output receives only the controlled viewer
    runtime and localized messages required by Preview and Publish.
    """

    def replace(match: re.Match[str]) -> str:
        info = match.group("info") or ""
        source = match.group("body") or ""
        try:
            spec = json.loads(source, parse_constant=_reject_verovio_json_constant)
            _validate_verovio_render_spec(spec, runtime)
        except json.JSONDecodeError:
            return _render_verovio_error("verovio.input_invalid", None, error_registry)
        except _VerovioSpecError as error:
            return _render_verovio_error(error.code, error.variables, error_registry)
        return _render_lodeon_verovio(
            spec, runtime, info, text, special_node_messages, error_registry
        )

    return _PATTERN.sub(replace, markdown)


def _reject_verovio_json_constant(_value: str) -> None:
    raise _VerovioSpecError("verovio.input_invalid")


def _render_lodeon_verovio(
    spec: dict[str, object],
    runtime: dict[str, object],
    info: str,
    text: _TextResolver,
    special_node_messages: object,
    error_registry: dict[str, object],
) -> str:
    title = str(_parse_fence_title(info) or text("verovio.defaultTitle")).strip()
    caption = str(spec["caption"]).strip()
    payload: _VerovioPublicPayload = {
        "spec": spec,
        "runtime": runtime,
        "messages": special_node_messages,
        "errors": _verovio_public_errors(error_registry),
        "unavailable": text("verovio.unavailable"),
    }
    unavailable = html.escape(text("verovio.unavailable"), quote=True)
    parts = [f'<figure class="lodeon-verovio" data-unavailable="{unavailable}">']
    caption_parts = []
    if title:
        caption_parts.append(f'<span class="lodeon-verovio-title">{html.escape(title)}</span>')
    if caption:
        caption_parts.append(
            f'<span class="lodeon-verovio-caption-text">{html.escape(caption)}</span>'
        )
    if caption_parts:
        parts.append(
            '<figcaption class="lodeon-verovio-caption">'
            + " ".join(caption_parts)
            + "</figcaption>"
        )
    parts.extend(
        [
            '<div class="lodeon-verovio-viewer" '
            f'aria-label="{html.escape(text("verovio.ariaLabel"), quote=True)}"></div>',
            '<p class="lodeon-verovio-status" role="status" aria-live="polite">'
            f"{html.escape(text('verovio.loading'))}</p>",
            '<script type="application/json" class="lodeon-verovio-spec">'
            f"{_safe_inline_json(payload)}</script>",
        ]
    )
    parts.append("</figure>")
    return "\n".join(parts)


def _render_verovio_error(
    code: str,
    variables: dict[str, object] | None,
    error_registry: dict[str, object],
) -> str:
    definition = _error_definition(error_registry, code)
    detail = _render_error_template(str(definition.get("detail") or code), variables or {})
    return (
        '<div class="lodeon-verovio lodeon-verovio-error" '
        f'data-error-code="{html.escape(code, quote=True)}">'
        f"<p>{html.escape(detail)}</p></div>"
    )


def _verovio_public_errors(error_registry: dict[str, object]) -> dict[str, object]:
    result: dict[str, object] = {}
    registry = error_registry.get("errors", {})
    if not isinstance(registry, dict):
        return result
    for code, definition in registry.items():
        if (
            not isinstance(code, str)
            or not code.startswith("verovio.")
            or not isinstance(definition, dict)
        ):
            continue
        result[code] = {
            "detail": str(definition.get("detail") or code),
            "technicalDetailTemplate": str(definition.get("technicalDetailTemplate") or ""),
            "showTechnicalDetail": definition.get("showTechnicalDetail") is True,
        }
    return result


def _validate_verovio_render_spec(spec: object, runtime: object) -> None:
    _require_verovio_object(
        spec,
        {
            "renderer",
            "items",
            "viewMode",
            "selectedItemId",
            "documentLayout",
            "initialZoom",
            "paginatedPageHeight",
            "visibleMetadataFields",
            "playback",
            "compare",
            "caption",
        },
    )
    assert isinstance(spec, dict)
    if spec["renderer"] != "verovio":
        raise _VerovioSpecError("verovio.input_invalid")
    _require_verovio_enum(spec["viewMode"], {"single", "list", "grouped", "compare"})
    _require_verovio_enum(spec["documentLayout"], {"responsive", "paginated"})
    _require_verovio_number(spec["initialZoom"], 0.25, 4)
    _require_verovio_integer(spec["paginatedPageHeight"], 100, 60000)
    _require_verovio_string(spec["caption"])
    _require_verovio_string_list(spec["visibleMetadataFields"], unique=True)
    if not isinstance(spec["items"], list):
        raise _VerovioSpecError("verovio.input_invalid")
    ids = []
    for item in spec["items"]:
        _validate_verovio_render_item(item, runtime)
        ids.append(item["id"])
    if len(ids) != len(set(ids)):
        raise _VerovioSpecError("verovio.input_invalid")
    selected = spec["selectedItemId"]
    if selected is not None and (not isinstance(selected, str) or selected not in ids):
        raise _VerovioSpecError("verovio.input_invalid")
    _validate_verovio_playback(spec["playback"])
    _validate_verovio_compare(spec["compare"], ids)


def _validate_verovio_render_item(item: object, runtime: object) -> None:
    _require_verovio_object(
        item,
        {
            "id",
            "data",
            "format",
            "label",
            "resource",
            "resourceLabel",
            "bindings",
            "status",
        },
    )
    assert isinstance(item, dict)
    assert isinstance(runtime, dict)
    _require_verovio_string(item["id"], nonempty=True)
    _require_verovio_string(item["data"], nonempty=True)
    if len(item["data"].encode("utf-8")) > runtime["maxInputBytesPerItem"]:
        raise _VerovioSpecError("verovio.input_too_large", {"itemId": item["id"]})
    if item["format"] not in {"mei", "pae", None}:
        raise _VerovioSpecError("verovio.input_invalid")
    for key in ("label", "resource", "resourceLabel"):
        if item[key] is not None:
            _require_verovio_string(item[key])
    if not isinstance(item["bindings"], dict):
        raise _VerovioSpecError("verovio.input_invalid")
    for key, binding in item["bindings"].items():
        _require_verovio_string(key, nonempty=True)
        _require_verovio_object(binding, {"type", "value"}, optional={"datatype", "xml:lang"})
        _require_verovio_enum(binding["type"], {"uri", "literal", "bnode"})
        _require_verovio_string(binding["value"])
        for optional in ("datatype", "xml:lang"):
            if optional in binding:
                _require_verovio_string(binding[optional])
    _validate_verovio_item_status(item["status"])


def _validate_verovio_item_status(status: object) -> None:
    _require_verovio_object(status, {"state", "messages"})
    assert isinstance(status, dict)
    _require_verovio_enum(status["state"], {"unvalidated", "ready", "warning", "error"})
    if not isinstance(status["messages"], list):
        raise _VerovioSpecError("verovio.input_invalid")
    for message in status["messages"]:
        _require_verovio_object(message, {"code", "severity", "variables"}, optional={"location"})
        _require_verovio_string(message["code"], nonempty=True)
        _require_verovio_enum(message["severity"], {"warning", "error"})
        if not isinstance(message["variables"], dict) or any(
            not isinstance(value, (str, int, float, bool))
            or isinstance(value, float)
            and not math.isfinite(value)
            for value in message["variables"].values()
        ):
            raise _VerovioSpecError("verovio.input_invalid")
        if "location" in message:
            _require_verovio_object(message["location"], set(), optional={"row", "column", "field"})


def _validate_verovio_playback(value: object) -> None:
    _require_verovio_object(value, {"tempoMultiplier", "loop", "volume"})
    assert isinstance(value, dict)
    _require_verovio_enum(value["tempoMultiplier"], {0.5, 0.75, 1, 1.25, 1.5})
    if not isinstance(value["loop"], bool):
        raise _VerovioSpecError("verovio.input_invalid")
    _require_verovio_number(value["volume"], 0, 1)


def _validate_verovio_compare(value: object, ids: list[str]) -> None:
    _require_verovio_object(
        value,
        {
            "aItemId",
            "bItemId",
            "synchronizedZoom",
            "playbackMode",
            "aZoom",
            "bZoom",
            "loopSequence",
            "tempoMultiplier",
            "targetKey",
            "showTransposed",
        },
    )
    assert isinstance(value, dict)
    for key in ("synchronizedZoom", "loopSequence", "showTransposed"):
        if not isinstance(value[key], bool):
            raise _VerovioSpecError("verovio.input_invalid")
    for key in ("aItemId", "bItemId"):
        if value[key] is not None and value[key] not in ids:
            raise _VerovioSpecError("verovio.compare_selection_invalid")
    if value["aItemId"] is not None and value["aItemId"] == value["bItemId"]:
        raise _VerovioSpecError("verovio.compare_selection_invalid")
    _require_verovio_enum(value["playbackMode"], {"a", "b", "aThenB", "bThenA"})
    _require_verovio_enum(value["tempoMultiplier"], {0.5, 0.75, 1, 1.25, 1.5})
    _require_verovio_number(value["aZoom"], 0.25, 4)
    _require_verovio_number(value["bZoom"], 0.25, 4)
    if value["targetKey"] is not None and not re.fullmatch(r"[A-Ga-g](?:#|b)?", value["targetKey"]):
        raise _VerovioSpecError("verovio.transposition_failed")
    if value["showTransposed"] and value["targetKey"] is None:
        raise _VerovioSpecError("verovio.transposition_failed")


def _require_verovio_object(
    value: object, required: set[str], optional: set[str] | None = None
) -> None:
    allowed = required | (optional or set())
    if not isinstance(value, dict) or set(value) - allowed or required - set(value):
        raise _VerovioSpecError("verovio.input_invalid")


def _require_verovio_string(value: object, nonempty: bool = False) -> None:
    if not isinstance(value, str) or nonempty and not value.strip():
        raise _VerovioSpecError("verovio.input_invalid")


def _require_verovio_enum(value: object, allowed: set[object]) -> None:
    if value not in allowed:
        raise _VerovioSpecError("verovio.input_invalid")


def _require_verovio_number(value: object, minimum: float, maximum: float) -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not minimum <= value <= maximum
    ):
        raise _VerovioSpecError("verovio.input_invalid")


def _require_verovio_integer(value: object, minimum: int, maximum: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise _VerovioSpecError("verovio.input_invalid")


def _require_verovio_string_list(value: object, unique: bool = False) -> None:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        raise _VerovioSpecError("verovio.input_invalid")
    if unique and len(value) != len(set(value)):
        raise _VerovioSpecError("verovio.input_invalid")
