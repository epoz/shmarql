"""Application configuration.

All settings are read from environment variables at startup. A ``.env`` file in
the current working directory (or the file named by ``SHMARQL_ENV_FILE``) is
loaded first, so every setting can be put there instead of the real environment.
Real environment variables always take precedence over values in the ``.env`` file.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

log = logging.getLogger("shmarql")

ENV_FILE = os.environ.get("SHMARQL_ENV_FILE", ".env")


class Settings(BaseSettings):
    """Typed view of the environment. Field names map 1:1 to upper-case env vars."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- General -------------------------------------------------------------
    site_title: str = "SHMARQL"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 8000
    # Public base URL of this application (used for absolute links), optional.
    site_uri: str = ""

    # --- SPARQL profiles -------------------------------------------------------
    # YAML file describing the backend triplestores ("profiles").
    profiles_path: Path = Path("profiles.yaml")
    # Name (or hash key) of the profile served at /sparql. Overrides the
    # ``default`` entry in the profiles YAML file when set.
    default_profile: str = ""
    # Default timeout (seconds) for upstream SPARQL requests.
    sparql_timeout: float = 30.0
    # Send this User-Agent upstream unless a profile overrides it.
    sparql_user_agent: str = "shmarql/0.1 (+https://github.com/epoz/shmarql)"
    # Comma separated list of origins allowed for CORS on the SPARQL endpoints.
    # Use "*" to allow all.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # --- Documentation ---------------------------------------------------------
    # Directory containing the Markdown documentation rendered off the root URL.
    docs_path: Path = Path("docs")

    # --- LODEON data stories ---------------------------------------------------
    # Optional YAML file overriding the bundled LODEON renderer configuration
    # (e.g. ``nodes.embed.allowedOrigins``).
    lodeon_config_path: Path | None = None
    # Optional directory replacing the bundled LODEON browser assets
    # (i.e. a checkout of lodeon-core/shmarql/assets/lodeon).
    lodeon_assets_path: Path | None = None

    # --- LODEON story editor (served at /lodeon/) ------------------------------
    lodeon_editor_enabled: bool = True
    # Access token for the editor. When set, Preview and Publish require a login
    # with this token; when empty, Preview is open and Publish is disabled.
    lodeon_editor_token: str = ""
    # Lifetime of an editor login, in seconds.
    lodeon_editor_session_ttl: int = 8 * 3600
    # Published stories are written to DOCS_PATH/<this>/<slug>/index.md.
    lodeon_story_dir: str = "story"
    # Where previews are rendered (default: a directory in the system temp dir)
    # and how long they are kept, in seconds.
    lodeon_preview_path: Path | None = None
    lodeon_preview_ttl: int = 3600
    # Maximum size of a Preview/Publish upload (story plus media assets), in MB.
    lodeon_max_upload_mb: int = 100

    # --- Entity viewer ---------------------------------------------------------
    # Preferred language for labels, descriptions and UI strings when the
    # browser's Accept-Language header gives no supported match.
    default_language: str = "en"
    supported_languages: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["en", "nl"]
    )

    @field_validator("cors_origins", "supported_languages", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        # Allow plain comma separated strings in the environment, besides JSON lists.
        if isinstance(value, str):
            if value.strip().startswith("["):
                import json

                return json.loads(value)
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator(
        "lodeon_config_path", "lodeon_assets_path", "lodeon_preview_path", mode="before"
    )
    @classmethod
    def _empty_path_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    """Load the settings once per process (after reading the .env file)."""
    # load_dotenv also exposes .env values to code that reads os.environ directly.
    load_dotenv(ENV_FILE, override=False)
    settings = Settings()
    logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)
    log.debug("Settings loaded: %s", settings.model_dump())
    return settings
