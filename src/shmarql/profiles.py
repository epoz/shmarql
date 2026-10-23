"""SPARQL backend "profiles", loaded from a YAML file.

Example ``profiles.yaml``::

    default: wikidata            # profile served at /sparql (name or endpoint address)
    display: {}                  # optional global entity-viewer overrides
    profiles:
      - name: wikidata
        title: Wikidata
        description: The Wikidata Query Service
        endpoint: https://query.wikidata.org/sparql
        headers: {User-Agent: "shmarql/0.1 (me@example.org)"}
        timeout: 20
        uri_prefixes: ["http://www.wikidata.org/entity/"]
        display:                 # optional per-profile entity-viewer overrides
          construct_query: "CONSTRUCT { {subject_uris} ?p ?o } WHERE { {subject_uris} ?p ?o }"
        sparnatural: sparnatural/wikidata.ttl   # optional LODEON visual query builder config
        graph_explorer: {}       # optional LODEON Graph Explorer overrides

Every profile is keyed by a hash of its endpoint address (see :func:`profile_key`),
which is used in URLs such as ``/sparql/<key>``.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

log = logging.getLogger("shmarql.profiles")

KEY_LENGTH = 12


class ProfileError(ValueError):
    """Raised when the profiles configuration is invalid."""


def normalise_endpoint(endpoint: str) -> str:
    """Normalise an endpoint address so trivially different spellings hash the same."""
    return endpoint.strip()


def is_endpoint_address(ref: str) -> bool:
    """Whether ``ref`` names an endpoint address (e.g. ``https://query.wikidata.org/sparql``)
    instead of a bare profile name."""
    return "://" in ref


def endpoint_name(endpoint: str) -> str:
    """Derive a profile name from an endpoint address, e.g. ``https://query.wikidata.org/sparql`` -> ``query.wikidata.org``."""
    host = urlparse(str(endpoint).strip()).netloc or str(endpoint).strip()
    host = host.lower()
    if host.startswith("www."):
        host = host[len("www.") :]
    return host or "endpoint"


def profile_key(endpoint: str) -> str:
    """Return the stable key for an endpoint address: a truncated SHA-256 hex digest."""
    digest = hashlib.sha256(normalise_endpoint(endpoint).encode("utf-8")).hexdigest()
    return digest[:KEY_LENGTH]


@dataclass(frozen=True)
class Profile:
    """One backend triplestore."""

    name: str
    endpoint: str
    title: str = ""
    description: str = ""
    headers: dict[str, str] = field(default_factory=dict)
    timeout: float | None = None
    # Entity URIs starting with one of these prefixes are looked up in this profile.
    uri_prefixes: tuple[str, ...] = ()
    # Allow SPARQL UPDATE requests to be proxied to this endpoint.
    allow_update: bool = False
    # Per-profile overrides for the entity viewer display settings.
    display: dict[str, Any] = field(default_factory=dict)
    # Sparnatural (SHACL, Turtle) configuration for the LODEON visual query builder.
    sparnatural: Path | None = None
    # Overrides for the LODEON editor's Graph Explorer profile (camelCase keys).
    graph_explorer: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return profile_key(self.endpoint)

    @property
    def label(self) -> str:
        return self.title or self.name

    @property
    def sparql_path(self) -> str:
        return f"/sparql/{self.key}"

    def public_dict(self, is_default: bool = False) -> dict[str, Any]:
        """Representation that is safe to send to browsers (no upstream address/headers)."""
        return {
            "key": self.key,
            "name": self.name,
            "title": self.label,
            "description": self.description,
            "sparql": self.sparql_path,
            "default": is_default,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any], base_dir: Path | None = None) -> Profile:
        if not isinstance(data, dict):
            raise ProfileError(f"Profile entry must be a mapping, got: {data!r}")
        endpoint = data.get("endpoint") or data.get("url")
        if not endpoint or not isinstance(endpoint, str):
            raise ProfileError(f"Profile {data.get('name')!r} has no 'endpoint'")
        name = str(data.get("name") or profile_key(endpoint))
        headers = data.get("headers") or {}
        if not isinstance(headers, dict):
            raise ProfileError(f"Profile {name!r}: 'headers' must be a mapping")
        prefixes = data.get("uri_prefixes") or []
        if isinstance(prefixes, str):
            prefixes = [prefixes]
        display = data.get("display") or {}
        if not isinstance(display, dict):
            raise ProfileError(f"Profile {name!r}: 'display' must be a mapping")
        timeout = data.get("timeout")
        sparnatural = data.get("sparnatural")
        if sparnatural is not None and not isinstance(sparnatural, str):
            raise ProfileError(f"Profile {name!r}: 'sparnatural' must be a file path")
        sparnatural_path = Path(sparnatural) if sparnatural else None
        if sparnatural_path and base_dir and not sparnatural_path.is_absolute():
            sparnatural_path = base_dir / sparnatural_path
        graph_explorer = data.get("graph_explorer") or {}
        if not isinstance(graph_explorer, dict):
            raise ProfileError(f"Profile {name!r}: 'graph_explorer' must be a mapping")
        return cls(
            name=name,
            endpoint=normalise_endpoint(endpoint),
            title=str(data.get("title") or ""),
            description=str(data.get("description") or ""),
            headers={str(k): str(v) for k, v in headers.items()},
            timeout=float(timeout) if timeout is not None else None,
            uri_prefixes=tuple(str(p) for p in prefixes),
            allow_update=bool(data.get("allow_update", False)),
            display=dict(display),
            sparnatural=sparnatural_path,
            graph_explorer=dict(graph_explorer),
        )


class ProfileRegistry:
    """All configured profiles, addressable by hash key, name or endpoint address."""

    def __init__(
        self,
        profiles: list[Profile],
        default: str | None = None,
        display: dict[str, Any] | None = None,
    ):
        self._by_key: dict[str, Profile] = {}
        self._by_name: dict[str, Profile] = {}
        self._by_endpoint: dict[str, Profile] = {}
        entries = list(profiles)
        if default and not entries and is_endpoint_address(str(default)):
            # No profiles are configured at all, while a default is given: the default names
            # a backend that was never declared in the YAML file (e.g. an ``ENDPOINT`` setting).
            # Create it as a single new profile, as if it was declared there.
            entries = [
                Profile(name=endpoint_name(str(default)), endpoint=normalise_endpoint(str(default)))
            ]
        for profile in entries:
            if profile.key in self._by_key:
                other = self._by_key[profile.key]
                raise ProfileError(
                    f"Profiles {other.name!r} and {profile.name!r} share the same endpoint "
                    f"address {profile.endpoint!r}"
                )
            if profile.name in self._by_name:
                raise ProfileError(f"Duplicate profile name {profile.name!r}")
            self._by_key[profile.key] = profile
            self._by_name[profile.name] = profile
            self._by_endpoint[normalise_endpoint(profile.endpoint)] = profile
        self.display: dict[str, Any] = dict(display or {})
        self._default: Profile | None = None
        if default:
            found = self.get(default)
            if found is None:
                raise ProfileError(f"Default profile {default!r} is not defined")
            self._default = found
        elif entries:
            self._default = entries[0]

    # -- construction -----------------------------------------------------------
    @classmethod
    def from_yaml(cls, path: Path, default_override: str = "") -> ProfileRegistry:
        path = Path(path)
        if not path.exists():
            log.warning("Profiles file %s not found; no SPARQL backends configured", path)
            # A default override (e.g. the ENDPOINT setting) may name the backend to use.
            return cls([], default_override or None)
        with path.open(encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return cls.from_data(data, default_override=default_override, base_dir=path.parent)

    @classmethod
    def from_data(
        cls, data: Any, default_override: str = "", base_dir: Path | None = None
    ) -> ProfileRegistry:
        if isinstance(data, list):  # allow a bare list of profiles
            data = {"profiles": data}
        if not isinstance(data, dict):
            raise ProfileError("Profiles configuration must be a mapping or a list")
        entries = data.get("profiles") or []
        if isinstance(entries, dict):  # allow a {name: {...}} mapping as well
            entries = [{"name": name, **(value or {})} for name, value in entries.items()]
        profiles = [Profile.from_dict(entry, base_dir) for entry in entries]
        # A profile may also mark itself as default.
        marked = [entry.get("name") for entry in entries if entry.get("default") is True]
        default = default_override or data.get("default") or (marked[0] if marked else None)
        return cls(profiles, default=default, display=data.get("display") or {})

    # -- lookups ----------------------------------------------------------------
    def __iter__(self):
        return iter(self._by_key.values())

    def __len__(self) -> int:
        return len(self._by_key)

    @property
    def default(self) -> Profile | None:
        return self._default

    def by_key(self, key: str) -> Profile | None:
        return self._by_key.get(key)

    def get(self, ref: str | None) -> Profile | None:
        """Resolve a hash key, profile name or endpoint address."""
        if not ref:
            return None
        ref = normalise_endpoint(ref)
        return self._by_key.get(ref) or self._by_name.get(ref) or self._by_endpoint.get(ref)

    def for_uri(self, uri: str) -> Profile | None:
        """Return the profile whose ``uri_prefixes`` best (longest) matches ``uri``."""
        best: tuple[int, Profile] | None = None
        for profile in self:
            for prefix in profile.uri_prefixes:
                if uri.startswith(prefix) and (best is None or len(prefix) > best[0]):
                    best = (len(prefix), profile)
        return best[1] if best else None

    def public_list(self) -> list[dict[str, Any]]:
        default_key = self._default.key if self._default else None
        return [p.public_dict(is_default=p.key == default_key) for p in self]
